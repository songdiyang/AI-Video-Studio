const { queryOne, queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getBatchStoryboardLinks } = require('../../resourceLinks/queryLinks');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

/**
 * 从图片 URL 生成缩略图 URL
 * 如果原 URL 为 images/frames/123/first_frame.png
 * 则缩略图 URL 为 images/frames/123/first_frame-thumb.png
 * 
 * 注意：这只是 URL 生成逻辑，实际缩略图需要在图片上传时生成
 * 当前作为备用字段，前端可在缩略图不存在时回退到原图
 */
function generateThumbUrl(originalUrl) {
  if (!originalUrl) return null;
  
  // 在文件名与扩展名之间插入 -thumb
  const lastDotIndex = originalUrl.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return originalUrl + '-thumb';
  }
  
  const basePath = originalUrl.substring(0, lastDotIndex);
  const extension = originalUrl.substring(lastDotIndex);
  return `${basePath}-thumb${extension}`;
}

// GET /:scriptId - 获取指定剧本的所有分镜
module.exports = (router) => {
  router.get('/:scriptId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const scriptId = Number(req.params.scriptId);

    try {
      // 验证剧本权限（支持团队成员访问）
      const script = await queryOne(
        'SELECT * FROM scripts WHERE id = ?',
        [scriptId]
      );

      if (!script) {
        return res.status(404).json({ message: '剧本不存在' });
      }

      // 通过剧本关联的项目检查权限
      const role = await getEffectiveProjectRole(userId, script.project_id);
      if (!role) {
        return res.status(403).json({ message: '无权访问该剧本' });
      }

      // 获取分镜
      const storyboards = await queryAll(
        'SELECT * FROM storyboards WHERE script_id = ? ORDER BY idx ASC',
        [scriptId]
      );

      // 批量查询关联的角色/场景（避免 N+1）
      const sbIds = storyboards.map(sb => sb.id);
      let linksMap = new Map();
      try {
        linksMap = await getBatchStoryboardLinks(sbIds);
      } catch (linkErr) {
        console.warn('[Get Storyboards] 查询资源关联失败（降级为空）:', linkErr.message);
      }

      // 解析 variables_json 并附带关联数据
      const parsed = storyboards.map(sb => {
        const links = linksMap.get(sb.id) || { characters: [], scenes: [] };
        // 解析 spatial_description JSON
        let spatialDescription = null;
        if (sb.spatial_description) {
          try {
            spatialDescription = typeof sb.spatial_description === 'string' 
              ? JSON.parse(sb.spatial_description) 
              : sb.spatial_description;
          } catch (e) {
            console.warn(`[Get Storyboards] 解析 spatial_description 失败 (id=${sb.id}):`, e.message);
          }
        }
        return {
          ...sb,
          variables: sb.variables_json ? JSON.parse(sb.variables_json) : {},
          linkedCharacters: links.characters,
          linkedScenes: links.scenes,
          spatial_description: spatialDescription,
          // 缩略图 URL（备用字段，前端可在不存在时回退到原图）
          first_frame_thumb_url: generateThumbUrl(sb.first_frame_url),
          last_frame_thumb_url: generateThumbUrl(sb.last_frame_url)
        };
      });

      res.json(parsed);
    } catch (error) {
      console.error('[Get Storyboards]', error);
      res.status(500).json({ message: '获取分镜失败' });
    }
  });
};
