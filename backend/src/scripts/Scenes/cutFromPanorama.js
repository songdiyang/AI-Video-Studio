/**
 * 从场景全景图裁切透视视图（漫剧正反打 A/B 面工具）
 *
 * POST /api/scenes/:id/cut-from-panorama
 *   body: { yaw, pitch?, fov?, outW?, outH?, label? }
 *   resp: { cutUrl, yaw, pitch, fov, outW, outH }
 *
 * 裁切结果不写入 scenes 表，仅返回 MinIO 持久化 URL，
 * 由前端/分镜工作台决定如何使用（如写入 storyboard.image_url）。
 */
const { queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { uploadBuffer } = require('../../utils/fileStorage');
const {
  fetchToBuffer,
  cutEquirectangularToPerspective,
} = require('../../utils/panoramaCut');

module.exports = (router) => {
  router.post('/:id/cut-from-panorama', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);

    const {
      yaw,
      pitch = 0,
      fov = 75,
      outW = 768,
      outH = 1024,
      label = 'cut',
    } = req.body || {};

    if (typeof yaw !== 'number' || Number.isNaN(yaw)) {
      return res.status(400).json({ message: 'yaw 参数必须为数字（度）' });
    }

    try {
      // 权限校验 + 读取全景图 URL
      const scene = await queryOne(
        'SELECT id, panorama_image_url FROM scenes WHERE id = ? AND user_id = ?',
        [sceneId, userId]
      );
      if (!scene) {
        return res.status(404).json({ message: '场景不存在或无权访问' });
      }
      if (!scene.panorama_image_url) {
        return res.status(400).json({ message: '该场景尚未生成全景图，无法裁切' });
      }

      // 尺寸安全限制
      const w = Math.max(128, Math.min(2048, Number(outW) || 768));
      const h = Math.max(128, Math.min(2048, Number(outH) || 1024));
      const f = Math.max(30, Math.min(110, Number(fov) || 75));
      const y = Number(yaw) || 0;
      const p = Math.max(-89, Math.min(89, Number(pitch) || 0));

      const t0 = Date.now();
      const panoBuffer = await fetchToBuffer(scene.panorama_image_url);
      const pngBuffer = await cutEquirectangularToPerspective(panoBuffer, {
        yawDeg: y,
        pitchDeg: p,
        fovDeg: f,
        outW: w,
        outH: h,
      });
      const durationMs = Date.now() - t0;

      // 存储到 MinIO
      const safeLabel = String(label || 'cut').replace(/[^\w\-]/g, '').slice(0, 16) || 'cut';
      const filename = `${Date.now()}-${safeLabel}-yaw${Math.round(y)}-pitch${Math.round(p)}-fov${Math.round(f)}.png`;
      const objectPath = `images/scenes/${sceneId}/cuts/${filename}`;
      const cutUrl = await uploadBuffer(pngBuffer, objectPath, {
        contentType: 'image/png',
      });

      console.log(
        `[PanoramaCut] scene=${sceneId} yaw=${y} pitch=${p} fov=${f} ${w}x${h} ${durationMs}ms -> ${cutUrl}`
      );

      res.json({
        message: '裁切完成',
        cutUrl,
        yaw: y,
        pitch: p,
        fov: f,
        outW: w,
        outH: h,
        durationMs,
      });
    } catch (error) {
      console.error('[PanoramaCut]', error);
      res.status(500).json({ message: error.message || '裁切全景图失败' });
    }
  });
};
