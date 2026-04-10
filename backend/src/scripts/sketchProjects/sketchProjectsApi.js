/**
 * 独立草图项目 API
 * 
 * GET    /                    - 列表查询
 * POST   /                    - 新建草图项目
 * GET    /:id                 - 获取详情
 * PUT    /:id                 - 更新草图项目
 * DELETE /:id                 - 删除草图项目
 * POST   /:id/thumbnail       - 上传缩略图
 * POST   /:id/export          - 导出为图片
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { getPool } = require('../../db');
const { getUploadsBase } = require('../../utils/uploadsBase');

// 允许的文件 MIME 类型
const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp'];

// 文件扩展名映射
const EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

// 最大文件大小 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 获取 uploads 目录的基础路径
const UPLOADS_BASE = getUploadsBase();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(UPLOADS_BASE, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_MAP[file.mimetype] || 'png';
    cb(null, `sketch_project_temp_${Date.now()}.${ext}`);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 PNG/JPG/WebP 格式'), false);
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
 * 删除文件（如果存在）
 * @param {string} filePath 
 */
function safeDeleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[SketchProjects] Failed to delete file:', filePath, err.message);
    }
  }
}

/**
 * 从 URL 获取文件的绝对路径
 * @param {string} url 
 * @returns {string|null}
 */
function getFilePathFromUrl(url) {
  if (!url) return null;
  const relative = url.replace(/^\/uploads\//, '');
  return path.join(UPLOADS_BASE, relative);
}

/**
 * 验证草图项目所有权
 * @param {number} id 
 * @param {number} userId 
 * @returns {Promise<object|null>}
 */
async function getSketchProjectWithAuth(id, userId) {
  return queryOne(
    'SELECT * FROM sketch_projects WHERE id = ? AND user_id = ?',
    [id, userId]
  );
}

/**
 * GET /
 * 列表查询
 */
async function listSketchProjects(req, res) {
  const userId = req.user.id;
  const { search, page = 1, limit = 20, project_id } = req.query;
  
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  try {
    let whereClauses = ['user_id = ?'];
    let params = [userId];

    if (project_id) {
      whereClauses.push('project_id = ?');
      params.push(project_id);
    }

    if (search) {
      whereClauses.push('title LIKE ?');
      params.push(`%${search}%`);
    }

    const whereSQL = whereClauses.join(' AND ');

    // 查询总数
    const countResult = await queryOne(
      `SELECT COUNT(*) as total FROM sketch_projects WHERE ${whereSQL}`,
      params
    );

    // 查询列表（不包含 excalidraw_data 以提高性能）
    const items = await queryAll(
      `SELECT id, user_id, project_id, title, description, thumbnail_url, sketch_url, tags, created_at, updated_at
       FROM sketch_projects 
       WHERE ${whereSQL}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      items,
      total: countResult?.total || 0,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('[SketchProjects List]', err);
    res.status(500).json({ message: '获取草图列表失败' });
  }
}

/**
 * POST /
 * 新建草图项目
 */
async function createSketchProject(req, res) {
  const userId = req.user.id;
  const { title, description, project_id } = req.body;

  if (!project_id) {
    return res.status(400).json({ message: 'project_id 不能为空' });
  }

  try {
    const result = await execute(
      `INSERT INTO sketch_projects (user_id, project_id, title, description)
       VALUES (?, ?, ?, ?)`,
      [userId, project_id, title || '未命名草图', description || null]
    );

    const id = result.insertId;
    const sketchProject = await queryOne(
      'SELECT * FROM sketch_projects WHERE id = ?',
      [id]
    );

    console.log('[SketchProjects] Created:', { id, title: sketchProject.title });

    res.json({
      message: '草图项目创建成功',
      sketchProject
    });
  } catch (err) {
    console.error('[SketchProjects Create]', err);
    res.status(500).json({ message: '创建草图项目失败' });
  }
}

/**
 * GET /:id
 * 获取详情（包含 excalidraw_data）
 */
async function getSketchProject(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: '无效的草图项目 ID' });
  }

  try {
    const sketchProject = await getSketchProjectWithAuth(id, userId);

    if (!sketchProject) {
      return res.status(404).json({ message: '草图项目不存在或无权访问' });
    }

    res.json(sketchProject);
  } catch (err) {
    console.error('[SketchProjects Get]', err);
    res.status(500).json({ message: '获取草图项目失败' });
  }
}

/**
 * PUT /:id
 * 更新草图项目
 */
async function updateSketchProject(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const { title, description, excalidraw_data, tags } = req.body;

  if (!id) {
    return res.status(400).json({ message: '无效的草图项目 ID' });
  }

  try {
    const existing = await getSketchProjectWithAuth(id, userId);

    if (!existing) {
      return res.status(404).json({ message: '草图项目不存在或无权访问' });
    }

    // 构建更新语句
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (excalidraw_data !== undefined) {
      updates.push('excalidraw_data = ?');
      params.push(typeof excalidraw_data === 'string' ? excalidraw_data : JSON.stringify(excalidraw_data));
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(typeof tags === 'string' ? tags : JSON.stringify(tags));
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    params.push(id, userId);
    await execute(
      `UPDATE sketch_projects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      params
    );

    const sketchProject = await queryOne(
      'SELECT * FROM sketch_projects WHERE id = ?',
      [id]
    );

    console.log('[SketchProjects] Updated:', { id });

    res.json({
      message: '草图项目更新成功',
      sketchProject
    });
  } catch (err) {
    console.error('[SketchProjects Update]', err);
    res.status(500).json({ message: '更新草图项目失败' });
  }
}

/**
 * DELETE /:id
 * 删除草图项目
 */
async function deleteSketchProject(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: '无效的草图项目 ID' });
  }

  try {
    const existing = await getSketchProjectWithAuth(id, userId);

    if (!existing) {
      return res.status(404).json({ message: '草图项目不存在或无权访问' });
    }

    // 删除关联的文件
    if (existing.thumbnail_url) {
      safeDeleteFile(getFilePathFromUrl(existing.thumbnail_url));
    }
    if (existing.sketch_url) {
      safeDeleteFile(getFilePathFromUrl(existing.sketch_url));
    }

    // 删除数据库记录
    await execute(
      'DELETE FROM sketch_projects WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    console.log('[SketchProjects] Deleted:', { id });

    res.json({ success: true, message: '草图项目删除成功' });
  } catch (err) {
    console.error('[SketchProjects Delete]', err);
    res.status(500).json({ message: '删除草图项目失败' });
  }
}

/**
 * POST /:id/thumbnail
 * 上传缩略图
 */
async function uploadThumbnail(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);

  if (!id) {
    if (req.file) safeDeleteFile(req.file.path);
    return res.status(400).json({ message: '无效的草图项目 ID' });
  }

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的缩略图文件' });
  }

  try {
    const existing = await getSketchProjectWithAuth(id, userId);

    if (!existing) {
      safeDeleteFile(req.file.path);
      return res.status(404).json({ message: '草图项目不存在或无权访问' });
    }

    // 创建存储目录: sketches/standalone/{projectId}/
    const sketchDir = path.join(UPLOADS_BASE, 'sketches', 'standalone', String(existing.project_id));
    if (!fs.existsSync(sketchDir)) {
      fs.mkdirSync(sketchDir, { recursive: true });
    }

    // 生成文件名: {sketchId}_{timestamp}.{ext}
    const ext = EXTENSION_MAP[req.file.mimetype] || 'png';
    const fileName = `${id}_thumb_${Date.now()}.${ext}`;
    const finalPath = path.join(sketchDir, fileName);

    // 移动文件到正确目录
    fs.renameSync(req.file.path, finalPath);

    // 删除旧缩略图文件
    if (existing.thumbnail_url) {
      safeDeleteFile(getFilePathFromUrl(existing.thumbnail_url));
    }

    // 生成相对 URL
    const thumbnailUrl = `/uploads/sketches/standalone/${existing.project_id}/${fileName}`;

    // 更新数据库
    await execute(
      'UPDATE sketch_projects SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [thumbnailUrl, id]
    );

    console.log('[SketchProjects] Thumbnail uploaded:', { id, thumbnailUrl });

    res.json({
      message: '缩略图上传成功',
      thumbnail_url: thumbnailUrl
    });
  } catch (err) {
    if (req.file) safeDeleteFile(req.file.path);
    console.error('[SketchProjects Thumbnail]', err);
    res.status(500).json({ message: '缩略图上传失败' });
  }
}

/**
 * POST /:id/export
 * 导出为图片
 */
async function exportSketch(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const { format, imageData } = req.body;

  if (!id) {
    return res.status(400).json({ message: '无效的草图项目 ID' });
  }

  if (!format || !['png', 'svg'].includes(format)) {
    return res.status(400).json({ message: '无效的导出格式，仅支持 png 或 svg' });
  }

  if (!imageData) {
    return res.status(400).json({ message: '缺少 imageData 字段' });
  }

  try {
    const existing = await getSketchProjectWithAuth(id, userId);

    if (!existing) {
      return res.status(404).json({ message: '草图项目不存在或无权访问' });
    }

    // 创建存储目录
    const sketchDir = path.join(UPLOADS_BASE, 'sketches', 'standalone', String(existing.project_id));
    if (!fs.existsSync(sketchDir)) {
      fs.mkdirSync(sketchDir, { recursive: true });
    }

    // 解码 base64 数据
    const commaIndex = imageData.indexOf(',');
    const base64Data = commaIndex !== -1 ? imageData.slice(commaIndex + 1) : imageData;
    const buffer = Buffer.from(base64Data, 'base64');

    // 生成文件名
    const fileName = `${id}_export_${Date.now()}.${format}`;
    const finalPath = path.join(sketchDir, fileName);

    // 写入文件
    fs.writeFileSync(finalPath, buffer);

    // 删除旧导出文件
    if (existing.sketch_url) {
      safeDeleteFile(getFilePathFromUrl(existing.sketch_url));
    }

    // 生成相对 URL
    const sketchUrl = `/uploads/sketches/standalone/${existing.project_id}/${fileName}`;

    // 更新数据库
    await execute(
      'UPDATE sketch_projects SET sketch_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sketchUrl, id]
    );

    console.log('[SketchProjects] Exported:', { id, sketchUrl, format });

    res.json({
      message: '导出成功',
      url: sketchUrl
    });
  } catch (err) {
    console.error('[SketchProjects Export]', err);
    res.status(500).json({ message: '导出失败' });
  }
}

/**
 * 导出路由注册函数
 * @param {import('express').Router} router 
 */
module.exports = function(router) {
  const { authMiddleware } = require('../../middleware');

  // 列表查询
  router.get('/', authMiddleware, listSketchProjects);

  // 新建草图项目
  router.post('/', authMiddleware, createSketchProject);

  // 获取详情
  router.get('/:id', authMiddleware, getSketchProject);

  // 更新草图项目
  router.put('/:id', authMiddleware, updateSketchProject);

  // 删除草图项目
  router.delete('/:id', authMiddleware, deleteSketchProject);

  // 上传缩略图
  router.post('/:id/thumbnail', authMiddleware, upload.single('thumbnail'), uploadThumbnail);

  // 导出为图片
  router.post('/:id/export', authMiddleware, exportSketch);
};
