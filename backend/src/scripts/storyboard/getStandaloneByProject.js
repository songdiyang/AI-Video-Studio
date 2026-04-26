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

      // 查询自由分镜（script_id IS NULL）
      const storyboards = await queryAll(
        'SELECT * FROM storyboards WHERE project_id = ? AND script_id IS NULL ORDER BY idx ASC',
        [projectId]
      );

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
