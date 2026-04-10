/**
 * 草图文件上传 API
 * 
 * POST   /:storyboardId/sketch        - 上传草图文件
 * DELETE /:storyboardId/sketch        - 删除草图
 * PUT    /:storyboardId/sketch-settings - 更新草图设置
 * PUT    /:storyboardId/sketch-data   - 保存 Excalidraw 矢量数据
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, execute, query } = require('../../dbHelper');
const { getPool } = require('../../db');
const { getUploadsBase } = require('../../utils/uploadsBase');

// 最大历史版本数量（超过后删除最旧的）
const MAX_HISTORY_VERSIONS = 50;

// 有效的草图类型
const VALID_SKETCH_TYPES = ['stick_figure', 'storyboard_sketch', 'detailed_lineart'];

// 允许的文件 MIME 类型
const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

// 文件扩展名映射
const EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg'
};

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 获取 uploads 目录的基础路径
const UPLOADS_BASE = getUploadsBase();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 临时存储位置，后续会移动到正确目录
    const tempDir = path.join(UPLOADS_BASE, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_MAP[file.mimetype] || 'png';
    cb(null, `temp_${Date.now()}.${ext}`);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 PNG/JPG/SVG 格式'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

/**
 * 获取分镜信息并验证用户权限
 * @param {number} storyboardId 
 * @param {number} userId 
 * @returns {Promise<object|null>}
 */
async function getStoryboardWithAuth(storyboardId, userId) {
  return queryOne(
    `SELECT s.id, s.project_id, s.sketch_url, s.sketch_type, s.sketch_data, s.control_strength, s.sketch_version
     FROM storyboards s 
     JOIN scripts sc ON s.script_id = sc.id 
     WHERE s.id = ? AND sc.user_id = ?`,
    [storyboardId, userId]
  );
}

/**
 * 创建草图历史记录（使用事务版本）
 * @param {object} connection - 数据库连接（事务中的连接）
 * @param {number} storyboardId 
 * @param {object} sketchData - 草图数据 {sketch_url, sketch_type, sketch_data, control_strength, sketch_version}
 */
async function createSketchHistoryWithConnection(connection, storyboardId, sketchData) {
  const version = sketchData.sketch_version || 1;
  
  // 插入历史记录
  await connection.execute(
    `INSERT INTO sketch_history (storyboard_id, version, sketch_url, sketch_type, sketch_data, control_strength)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      storyboardId,
      version,
      sketchData.sketch_url || null,
      sketchData.sketch_type || null,
      sketchData.sketch_data ? JSON.stringify(sketchData.sketch_data) : null,
      sketchData.control_strength || 0.85
    ]
  );
  
  // 清理超过限制的旧版本
  const [countResult] = await connection.execute(
    'SELECT COUNT(*) as count FROM sketch_history WHERE storyboard_id = ?',
    [storyboardId]
  );
  
  if (countResult[0].count > MAX_HISTORY_VERSIONS) {
    const deleteCount = countResult[0].count - MAX_HISTORY_VERSIONS;
    await connection.execute(
      `DELETE FROM sketch_history 
       WHERE storyboard_id = ? 
       ORDER BY version ASC 
       LIMIT ?`,
      [storyboardId, deleteCount]
    );
  }
}

/**
 * 删除文件（如果存在）
 * @param {string} filePath 
 */
function safeDeleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[Sketch] Failed to delete file:', filePath, err.message);
    }
  }
}

/**
 * POST /:storyboardId/sketch
 * 上传草图文件
 */
async function uploadSketch(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const sketchType = req.body.sketch_type;

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (!sketchType || !VALID_SKETCH_TYPES.includes(sketchType)) {
    // 删除已上传的临时文件
    if (req.file) safeDeleteFile(req.file.path);
    return res.status(400).json({ 
      message: '无效的草图类型',
      validTypes: VALID_SKETCH_TYPES
    });
  }

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的草图文件' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      safeDeleteFile(req.file.path);
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    const projectId = storyboard.project_id;

    // 创建存储目录
    const sketchDir = path.join(UPLOADS_BASE, 'sketches', String(projectId));
    if (!fs.existsSync(sketchDir)) {
      fs.mkdirSync(sketchDir, { recursive: true });
    }

    // 生成文件名
    const ext = EXTENSION_MAP[req.file.mimetype] || 'png';
    const fileName = `${storyboardId}_${Date.now()}.${ext}`;
    const finalPath = path.join(sketchDir, fileName);

    // 移动文件到正确目录
    fs.renameSync(req.file.path, finalPath);

    // 删除旧草图文件
    if (storyboard.sketch_url) {
      // 修复路径拼接：去掉 URL 前缀 /uploads/，拼到 UPLOADS_BASE 下
      const relative = storyboard.sketch_url.replace(/^\/uploads\//, '');
      const oldFilePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(oldFilePath);
    }

    // 生成相对 URL
    const sketchUrl = `/uploads/sketches/${projectId}/${fileName}`;

    // 使用事务更新数据库并创建历史记录
    await connection.beginTransaction();
    
    try {
      // 计算新版本号
      const newVersion = (storyboard.sketch_version || 0) + 1;
      
      // 更新分镜表
      await connection.execute(
        'UPDATE storyboards SET sketch_url = ?, sketch_type = ?, sketch_version = ? WHERE id = ?',
        [sketchUrl, sketchType, newVersion, storyboardId]
      );
      
      // 创建历史记录
      await createSketchHistoryWithConnection(connection, storyboardId, {
        sketch_url: sketchUrl,
        sketch_type: sketchType,
        sketch_data: storyboard.sketch_data, // 保留原有的矢量数据
        control_strength: storyboard.control_strength,
        sketch_version: newVersion
      });
      
      await connection.commit();
      
      console.log('[Sketch] Uploaded:', { storyboardId, sketchUrl, sketchType, version: newVersion });

      res.json({ 
        message: '草图上传成功',
        sketch_url: sketchUrl,
        sketchUrl,  // 兼容前端驼峰命名
        version: newVersion
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    // 清理临时文件
    if (req.file) safeDeleteFile(req.file.path);
    console.error('[Sketch Upload]', err);
    res.status(500).json({ message: '草图上传失败' });
  } finally {
    connection.release();
  }
}

/**
 * DELETE /:storyboardId/sketch
 * 删除草图
 */
async function deleteSketch(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 删除文件
    if (storyboard.sketch_url) {
      // 修复路径拼接：去掉 URL 前缀 /uploads/，拼到 UPLOADS_BASE 下
      const relative = storyboard.sketch_url.replace(/^\/uploads\//, '');
      const filePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(filePath);
    }

    // 重置数据库字段
    await execute(
      'UPDATE storyboards SET sketch_url = NULL, sketch_type = NULL, sketch_data = NULL, control_strength = 0.85 WHERE id = ?',
      [storyboardId]
    );

    console.log('[Sketch] Deleted:', { storyboardId });

    res.json({ success: true });
  } catch (err) {
    console.error('[Sketch Delete]', err);
    res.status(500).json({ message: '删除草图失败' });
  }
}

/**
 * PUT /:storyboardId/sketch-settings
 * 更新草图设置
 */
async function updateSketchSettings(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { sketch_type, control_strength } = req.body;

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  // 验证参数
  if (sketch_type !== undefined && !VALID_SKETCH_TYPES.includes(sketch_type)) {
    return res.status(400).json({ 
      message: '无效的草图类型',
      validTypes: VALID_SKETCH_TYPES
    });
  }

  if (control_strength !== undefined) {
    const strength = Number(control_strength);
    if (isNaN(strength) || strength < 0 || strength > 1) {
      return res.status(400).json({ message: 'control_strength 必须在 0.0 ~ 1.0 之间' });
    }
  }

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 构建更新语句
    const updates = [];
    const params = [];

    if (sketch_type !== undefined) {
      updates.push('sketch_type = ?');
      params.push(sketch_type);
    }

    if (control_strength !== undefined) {
      updates.push('control_strength = ?');
      params.push(Number(control_strength));
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    params.push(storyboardId);
    await execute(`UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?`, params);

    // 查询更新后的数据
    const updated = await queryOne(
      'SELECT sketch_type, control_strength FROM storyboards WHERE id = ?',
      [storyboardId]
    );

    console.log('[Sketch] Settings updated:', { storyboardId, ...updated });

    res.json({
      message: '草图设置已更新',
      sketch_type: updated.sketch_type,
      control_strength: updated.control_strength
    });
  } catch (err) {
    console.error('[Sketch Settings]', err);
    res.status(500).json({ message: '更新草图设置失败' });
  }
}

/**
 * PUT /:storyboardId/sketch-data
 * 保存 Excalidraw 矢量数据
 */
async function saveSketchData(req, res) {
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
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 使用事务存储 JSON 数据并创建历史记录
    await connection.beginTransaction();
    
    try {
      // 计算新版本号
      const newVersion = (storyboard.sketch_version || 0) + 1;
      
      // 更新分镜表
      await connection.execute(
        'UPDATE storyboards SET sketch_data = ?, sketch_version = ? WHERE id = ?',
        [JSON.stringify(sketch_data), newVersion, storyboardId]
      );
      
      // 创建历史记录
      await createSketchHistoryWithConnection(connection, storyboardId, {
        sketch_url: storyboard.sketch_url,
        sketch_type: storyboard.sketch_type,
        sketch_data: sketch_data,
        control_strength: storyboard.control_strength,
        sketch_version: newVersion
      });
      
      await connection.commit();

      console.log('[Sketch] Data saved:', { storyboardId, version: newVersion });

      res.json({ success: true, version: newVersion });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[Sketch Data]', err);
    res.status(500).json({ message: '保存草图数据失败' });
  } finally {
    connection.release();
  }
}

/**
 * GET /:storyboardId/sketch/history
 * 获取草图版本历史列表
 */
async function getSketchHistory(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 查询历史记录
    const history = await query(
      `SELECT id, version, sketch_url, sketch_type, sketch_data, control_strength, created_at
       FROM sketch_history
       WHERE storyboard_id = ?
       ORDER BY version DESC
       LIMIT ? OFFSET ?`,
      [storyboardId, limit, offset]
    );

    // 查询总数
    const countResult = await queryOne(
      'SELECT COUNT(*) as total FROM sketch_history WHERE storyboard_id = ?',
      [storyboardId]
    );

    // 转换为前端期望的格式
    const formattedHistory = history.map(item => ({
      id: String(item.id),
      version: item.version,
      sketchUrl: item.sketch_url,
      sketchType: item.sketch_type,
      sketchData: item.sketch_data,
      controlStrength: parseFloat(item.control_strength),
      createdAt: item.created_at?.toISOString() || null
    }));

    res.json({
      history: formattedHistory,
      total: countResult?.total || 0
    });
  } catch (err) {
    console.error('[Sketch History]', err);
    res.status(500).json({ message: '获取草图历史失败' });
  }
}

/**
 * GET /:storyboardId/sketch/history/:version
 * 获取特定版本的草图数据
 */
async function getSketchHistoryVersion(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const version = Number(req.params.version);

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (!version || version < 1) {
    return res.status(400).json({ message: '无效的版本号' });
  }

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 查询指定版本
    const historyItem = await queryOne(
      `SELECT id, version, sketch_url, sketch_type, sketch_data, control_strength, created_at
       FROM sketch_history
       WHERE storyboard_id = ? AND version = ?`,
      [storyboardId, version]
    );

    if (!historyItem) {
      return res.status(404).json({ message: '指定版本的草图不存在' });
    }

    res.json({
      id: String(historyItem.id),
      version: historyItem.version,
      sketchUrl: historyItem.sketch_url,
      sketchType: historyItem.sketch_type,
      sketchData: historyItem.sketch_data,
      controlStrength: parseFloat(historyItem.control_strength),
      createdAt: historyItem.created_at?.toISOString() || null
    });
  } catch (err) {
    console.error('[Sketch History Version]', err);
    res.status(500).json({ message: '获取草图版本失败' });
  }
}

/**
 * POST /:storyboardId/sketch/restore/:version
 * 恢复到指定版本的草图
 */
async function restoreSketchVersion(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const version = Number(req.params.version);

  if (!storyboardId) {
    return res.status(400).json({ message: '无效的分镜 ID' });
  }

  if (!version || version < 1) {
    return res.status(400).json({ message: '无效的版本号' });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // 验证用户权限
    const storyboard = await getStoryboardWithAuth(storyboardId, userId);
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在或无权访问' });
    }

    // 查询要恢复的版本
    const historyItem = await queryOne(
      `SELECT sketch_url, sketch_type, sketch_data, control_strength
       FROM sketch_history
       WHERE storyboard_id = ? AND version = ?`,
      [storyboardId, version]
    );

    if (!historyItem) {
      return res.status(404).json({ message: '指定版本的草图不存在' });
    }

    // 使用事务恢复并创建新历史记录
    await connection.beginTransaction();

    try {
      // 计算新版本号
      const newVersion = (storyboard.sketch_version || 0) + 1;

      // 更新分镜表为恢复的数据
      await connection.execute(
        `UPDATE storyboards 
         SET sketch_url = ?, sketch_type = ?, sketch_data = ?, control_strength = ?, sketch_version = ?
         WHERE id = ?`,
        [
          historyItem.sketch_url,
          historyItem.sketch_type,
          historyItem.sketch_data ? JSON.stringify(historyItem.sketch_data) : null,
          historyItem.control_strength,
          newVersion,
          storyboardId
        ]
      );

      // 创建新的历史记录（恢复操作也产生一个新版本）
      await createSketchHistoryWithConnection(connection, storyboardId, {
        sketch_url: historyItem.sketch_url,
        sketch_type: historyItem.sketch_type,
        sketch_data: historyItem.sketch_data,
        control_strength: historyItem.control_strength,
        sketch_version: newVersion
      });

      await connection.commit();

      console.log('[Sketch] Restored:', { storyboardId, fromVersion: version, toVersion: newVersion });

      res.json({
        success: true,
        message: `已恢复到版本 ${version}`,
        version: newVersion,
        sketchUrl: historyItem.sketch_url,
        sketchType: historyItem.sketch_type,
        controlStrength: parseFloat(historyItem.control_strength)
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[Sketch Restore]', err);
    res.status(500).json({ message: '恢复草图版本失败' });
  } finally {
    connection.release();
  }
}

/**
 * 导出路由注册函数
 * @param {import('express').Router} router 
 */
module.exports = function(router) {
  const { authMiddleware } = require('../../middleware');

  // 上传草图（使用 multer 处理文件上传）
  router.post('/:storyboardId/sketch', authMiddleware, upload.single('sketch'), uploadSketch);

  // 删除草图
  router.delete('/:storyboardId/sketch', authMiddleware, deleteSketch);

  // 更新草图设置
  router.put('/:storyboardId/sketch-settings', authMiddleware, updateSketchSettings);

  // 保存 Excalidraw 数据
  router.put('/:storyboardId/sketch-data', authMiddleware, saveSketchData);

  // 草图版本历史 API
  router.get('/:storyboardId/sketch/history', authMiddleware, getSketchHistory);
  router.get('/:storyboardId/sketch/history/:version', authMiddleware, getSketchHistoryVersion);
  router.post('/:storyboardId/sketch/restore/:version', authMiddleware, restoreSketchVersion);
};
