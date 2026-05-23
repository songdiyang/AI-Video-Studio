/**
 * 分镜首尾帧草图管理 API
 * 
 * GET    /:storyboardId/sketch-frames          - 获取分镜草图信息
 * PUT    /:storyboardId/first-sketch-data      - 保存首帧草图数据
 * PUT    /:storyboardId/last-sketch-data       - 保存尾帧草图数据
 * DELETE /:storyboardId/:frameType-sketch      - 删除草图（frameType: first 或 last）
 */

const { queryOne, execute, query } = require('../../dbHelper');
const { getPool } = require('../../db');

// 最大历史版本数量（超过后删除最旧的）
const MAX_HISTORY_VERSIONS = 20;

/**
 * 导出路由注册函数
 * @param {import('express').Router} router 
 */
module.exports = function(router) {

/**
 * 获取分镜信息并验证用户权限
 */
async function getStoryboardWithAuth(storyboardId, userId) {
  return queryOne(
    `SELECT s.id, s.project_id, 
            s.first_sketch_data, s.first_sketch_version, s.first_sketch_updated_at,
            s.last_sketch_data, s.last_sketch_version, s.last_sketch_updated_at
     FROM storyboards s 
     JOIN scripts sc ON s.script_id = sc.id 
     WHERE s.id = ? AND sc.user_id = ?`,
    [storyboardId, userId]
  );
}

/**
 * 创建草图历史记录（使用事务版本）
 */
async function createSketchHistoryWithConnection(connection, storyboardId, frameType, sketchData, version) {
  await connection.execute(
    `INSERT INTO storyboard_sketch_history (storyboard_id, frame_type, version, sketch_data)
     VALUES (?, ?, ?, ?)`,
    [storyboardId, frameType, version, JSON.stringify(sketchData)]
  );

  // 清理旧版本，保留最近 MAX_HISTORY_VERSIONS 条
  await connection.execute(
    `DELETE FROM storyboard_sketch_history 
     WHERE storyboard_id = ? AND frame_type = ? 
     AND version NOT IN (
       SELECT version FROM (
         SELECT version FROM storyboard_sketch_history 
         WHERE storyboard_id = ? AND frame_type = ? 
         ORDER BY version DESC 
         LIMIT ?
       ) AS temp
     )`,
    [storyboardId, frameType, storyboardId, frameType, MAX_HISTORY_VERSIONS]
  );
}

// ============================================
// GET /api/storyboards/:storyboardId/sketch-frames
// 获取分镜草图信息
// ============================================
router.get('/:storyboardId(\\d+)/sketch-frames', async (req, res) => {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  try {
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 解析首帧草图数据
    let firstSketchData = null;
    if (storyboard.first_sketch_data) {
      try {
        firstSketchData = typeof storyboard.first_sketch_data === 'string' 
          ? JSON.parse(storyboard.first_sketch_data) 
          : storyboard.first_sketch_data;
      } catch (e) {
        console.warn('[SketchFrames] Failed to parse first_sketch_data:', e.message);
      }
    }

    // 解析尾帧草图数据
    let lastSketchData = null;
    if (storyboard.last_sketch_data) {
      try {
        lastSketchData = typeof storyboard.last_sketch_data === 'string'
          ? JSON.parse(storyboard.last_sketch_data)
          : storyboard.last_sketch_data;
      } catch (e) {
        console.warn('[SketchFrames] Failed to parse last_sketch_data:', e.message);
      }
    }

    res.json({
      first: firstSketchData ? {
        sketch_data: firstSketchData,
        version: storyboard.first_sketch_version || 0,
        updated_at: storyboard.first_sketch_updated_at
      } : null,
      last: lastSketchData ? {
        sketch_data: lastSketchData,
        version: storyboard.last_sketch_version || 0,
        updated_at: storyboard.last_sketch_updated_at
      } : null
    });
  } catch (err) {
    console.error('[SketchFrames GET]', err);
    res.status(500).json({ message: '获取草图信息失败' });
  }
});

// ============================================
// PUT /api/storyboards/:storyboardId/first-sketch-data
// 保存首帧草图数据
// ============================================
router.put('/:storyboardId(\\d+)/first-sketch-data', async (req, res) => {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { sketch_data } = req.body;

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (sketch_data === undefined) {
    return res.status(400).json({ message: '缺少 sketch_data 字段' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    await connection.beginTransaction();
    
    try {
      const newVersion = (storyboard.first_sketch_version || 0) + 1;
      
      await connection.execute(
        'UPDATE storyboards SET first_sketch_data = ?, first_sketch_version = ?, first_sketch_updated_at = NOW() WHERE id = ?',
        [JSON.stringify(sketch_data), newVersion, storyboardId]
      );
      
      await createSketchHistoryWithConnection(connection, storyboardId, 'first', sketch_data, newVersion);
      
      await connection.commit();

      console.log('[SketchFrames] First sketch saved:', { storyboardId, version: newVersion });

      res.json({ success: true, version: newVersion });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[SketchFrames First PUT]', err);
    res.status(500).json({ message: '保存首帧草图数据失败' });
  } finally {
    connection.release();
  }
});

// ============================================
// PUT /api/storyboards/:storyboardId/last-sketch-data
// 保存尾帧草图数据
// ============================================
router.put('/:storyboardId(\\d+)/last-sketch-data', async (req, res) => {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { sketch_data } = req.body;

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (sketch_data === undefined) {
    return res.status(400).json({ message: '缺少 sketch_data 字段' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    await connection.beginTransaction();
    
    try {
      const newVersion = (storyboard.last_sketch_version || 0) + 1;
      
      await connection.execute(
        'UPDATE storyboards SET last_sketch_data = ?, last_sketch_version = ?, last_sketch_updated_at = NOW() WHERE id = ?',
        [JSON.stringify(sketch_data), newVersion, storyboardId]
      );
      
      await createSketchHistoryWithConnection(connection, storyboardId, 'last', sketch_data, newVersion);
      
      await connection.commit();

      console.log('[SketchFrames] Last sketch saved:', { storyboardId, version: newVersion });

      res.json({ success: true, version: newVersion });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[SketchFrames Last PUT]', err);
    res.status(500).json({ message: '保存尾帧草图数据失败' });
  } finally {
    connection.release();
  }
});

// ============================================
// DELETE /api/storyboards/:storyboardId/:frameType-sketch
// 删除草图
// ============================================
router.delete('/:storyboardId(\\d+)/:frameType(first|last)-sketch', async (req, res) => {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const frameType = req.params.frameType;

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (!['first', 'last'].includes(frameType)) {
    return res.status(400).json({ message: '无效的帧类型' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    await connection.beginTransaction();
    
    try {
      const dataField = `${frameType}_sketch_data`;
      const versionField = `${frameType}_sketch_version`;
      const updatedAtField = `${frameType}_sketch_updated_at`;

      await connection.execute(
        `UPDATE storyboards SET ${dataField} = NULL, ${versionField} = 0, ${updatedAtField} = NULL WHERE id = ?`,
        [storyboardId]
      );
      
      await connection.commit();

      console.log('[SketchFrames] Sketch deleted:', { storyboardId, frameType });

      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[SketchFrames DELETE]', err);
    res.status(500).json({ message: '删除草图失败' });
  } finally {
    connection.release();
  }
});

  return router;
};
