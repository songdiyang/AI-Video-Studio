/**
 * GET /api/storyboards/project/:projectId/standalone
 * 获取指定项目下的"自由分镜"（script_id IS NULL）
 *
 * 与 getByScriptId 配对：剧集分镜走 /:scriptId，自由分镜走此端点。
 */

const { queryOne, queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getBatchStoryboardLinks } = require('../../resourceLinks/queryLinks');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// 与 getByScriptId 共用的缩略图 URL 生成逻辑
function generateThumbUrl(originalUrl) {
  if (!originalUrl) return null;
  const lastDotIndex = originalUrl.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return originalUrl + '-thumb';
  }
  const basePath = originalUrl.substring(0, lastDotIndex);
  const extension = originalUrl.substring(lastDotIndex);
  return `${basePath}-thumb${extension}`;
}

module.exports = (router) => {
  router.get('/project/:projectId/standalone', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const projectId = Number(req.params.projectId);
    // 可选集数过滤：传入时仅返回归档于该集的分镜（旧数据 episode_number 回填为 1）
    const rawEp = req.query.episode;
    const episodeFilter = rawEp !== undefined && rawEp !== '' ? Number(rawEp) : null;
    const useEpisode = Number.isFinite(episodeFilter) && episodeFilter >= 1 ? episodeFilter : null;

    try {
      // 权限校验：项目存在且当前用户可访问
      const project = await queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
      if (!project) {
        return res.status(404).json({ message: '项目不存在' });
      }
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role) {
        return res.status(403).json({ message: '无权访问该项目' });
      }

      // 查询自由分镜（script_id IS NULL），按集数可选过滤
      let sql = 'SELECT * FROM storyboards WHERE project_id = ? AND script_id IS NULL';
      const params = [projectId];
      if (useEpisode !== null) {
        // 旧数据 episode_number 已回填为 1；新数据写入时也默认 1，因此直接相等过滤即可
        sql += ' AND episode_number = ?';
        params.push(useEpisode);
      }
      sql += ' ORDER BY idx ASC';
      const storyboards = await queryAll(sql, params);

      // 批量补齐资源关联
      const sbIds = storyboards.map(sb => sb.id);
      let linksMap = new Map();
      try {
        linksMap = await getBatchStoryboardLinks(sbIds);
      } catch (linkErr) {
        console.warn('[Get Standalone Storyboards] 查询资源关联失败（降级为空）:', linkErr.message);
      }

      const parsed = storyboards.map(sb => {
        const links = linksMap.get(sb.id) || { characters: [], scenes: [] };
        let spatialDescription = null;
        if (sb.spatial_description) {
          try {
            spatialDescription = typeof sb.spatial_description === 'string'
              ? JSON.parse(sb.spatial_description)
              : sb.spatial_description;
          } catch (e) {
            console.warn(`[Get Standalone Storyboards] 解析 spatial_description 失败 (id=${sb.id}):`, e.message);
          }
        }
        return {
          ...sb,
          variables: sb.variables_json ? JSON.parse(sb.variables_json) : {},
          linkedCharacters: links.characters,
          linkedScenes: links.scenes,
          spatial_description: spatialDescription,
          first_frame_thumb_url: generateThumbUrl(sb.first_frame_url),
          last_frame_thumb_url: generateThumbUrl(sb.last_frame_url)
        };
      });

      res.json(parsed);
    } catch (error) {
      console.error('[Get Standalone Storyboards]', error);
      res.status(500).json({ message: '获取自由分镜失败' });
    }
  });
};
