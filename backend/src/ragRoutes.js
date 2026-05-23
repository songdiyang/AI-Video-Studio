/**
 * RAG（检索增强生成）API 路由
 * 
 * 提供剧本内容的语义检索能力
 * 
 * 路由列表：
 * - POST /api/rag/search          语义检索
 * - POST /api/rag/index-script    为剧本建立索引
 * - DELETE /api/rag/index/:scriptId 删除剧本索引
 * - GET /api/rag/status           获取 RAG 服务状态
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware');
const { getEffectiveProjectRole } = require('./middleware/collaborationAuth');
const ragService = require('./services/ragService');
const { queryOne } = require('./dbHelper');

/**
 * 权限检查中间件：验证用户是否有权访问项目
 */
async function requireProjectAccess(req, res, next) {
  const userId = req.user?.userId || req.user?.id;
  const projectId = req.body.projectId || req.query.projectId;
  
  if (!userId) {
    return res.status(401).json({ message: '未登录' });
  }
  
  if (!projectId) {
    return res.status(400).json({ message: '缺少 projectId' });
  }
  
  // 检查用户是否为项目所有者或协作者
  const role = await getEffectiveProjectRole(userId, projectId);
  if (!role) {
    return res.status(403).json({ message: '无权访问该项目' });
  }
  
  next();
}

/**
 * POST /api/rag/search
 * 语义检索剧本内容
 * 
 * Body: {
 *   query: string,        // 查询内容
 *   projectId: number,    // 项目 ID（必填，用于数据隔离）
 *   episodeNumber?: number, // 限定集数（可选）
 *   topK?: number         // 返回结果数量（默认 3，最大 10）
 * }
 */
router.post('/search', authMiddleware, requireProjectAccess, async (req, res) => {
  try {
    const { query, projectId, episodeNumber, topK } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: '查询内容不能为空' });
    }
    
    if (!ragService.isAvailable()) {
      return res.status(503).json({ 
        message: 'RAG 服务未配置',
        available: false 
      });
    }
    
    const results = await ragService.search(query, projectId, {
      episodeNumber,
      topK: Math.min(topK || 3, 10),
    });
    
    res.json({
      success: true,
      query,
      results,
      resultCount: results.length,
    });
  } catch (error) {
    console.error('[RAG API] 检索失败:', error);
    res.status(500).json({ 
      message: '检索失败', 
      error: error.message 
    });
  }
});

/**
 * POST /api/rag/search-with-context
 * 检索并组装成上下文文本（供 AI 助手直接使用）
 * 
 * Body: {
 *   query: string,
 *   projectId: number,
 *   episodeNumber?: number,
 *   topK?: number
 * }
 */
router.post('/search-with-context', authMiddleware, requireProjectAccess, async (req, res) => {
  try {
    const { query, projectId, episodeNumber, topK } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: '查询内容不能为空' });
    }
    
    if (!ragService.isAvailable()) {
      return res.status(503).json({ 
        message: 'RAG 服务未配置',
        available: false 
      });
    }
    
    const context = await ragService.searchWithContext(query, projectId, {
      episodeNumber,
      topK: Math.min(topK || 5, 10),
    });
    
    res.json({
      success: true,
      query,
      context,
      hasContext: context.length > 0,
    });
  } catch (error) {
    console.error('[RAG API] 上下文检索失败:', error);
    res.status(500).json({ 
      message: '检索失败', 
      error: error.message 
    });
  }
});

/**
 * POST /api/rag/index-script
 * 为指定剧本建立向量索引
 * 
 * Body: {
 *   scriptId: number  // 剧本 ID
 * }
 * 
 * 注意：通常不需要手动调用，剧本创建/更新时会自动触发
 */
router.post('/index-script', authMiddleware, async (req, res) => {
  try {
    const { scriptId } = req.body;
    const userId = req.user?.userId || req.user?.id;
    
    if (!scriptId) {
      return res.status(400).json({ message: '缺少 scriptId' });
    }
    
    // 查询剧本并验证权限
    const script = await queryOne(
      'SELECT id, project_id, episode_number, title, content, user_id FROM scripts WHERE id = ?',
      [scriptId]
    );
    
    if (!script) {
      return res.status(404).json({ message: '剧本不存在' });
    }
    
    // 权限检查
    const role = await getEffectiveProjectRole(userId, script.project_id);
    if (!role && script.user_id !== userId) {
      return res.status(403).json({ message: '无权访问该剧本' });
    }
    
    if (!ragService.isAvailable()) {
      return res.status(503).json({ 
        message: 'RAG 服务未配置',
        available: false 
      });
    }
    
    const result = await ragService.indexScript(script);
    
    res.json({
      success: result.success,
      scriptId,
      chunksCount: result.chunksCount,
      message: result.message,
    });
  } catch (error) {
    console.error('[RAG API] 索引失败:', error);
    res.status(500).json({ 
      message: '索引失败', 
      error: error.message 
    });
  }
});

/**
 * DELETE /api/rag/index/:scriptId
 * 删除剧本的向量索引
 */
router.delete('/index/:scriptId', authMiddleware, async (req, res) => {
  try {
    const { scriptId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    
    // 查询剧本并验证权限
    const script = await queryOne(
      'SELECT id, project_id, user_id FROM scripts WHERE id = ?',
      [scriptId]
    );
    
    if (!script) {
      return res.status(404).json({ message: '剧本不存在' });
    }
    
    // 权限检查
    const role = await getEffectiveProjectRole(userId, script.project_id);
    if (!role && script.user_id !== userId) {
      return res.status(403).json({ message: '无权访问该剧本' });
    }
    
    if (!ragService.isAvailable()) {
      return res.status(503).json({ 
        message: 'RAG 服务未配置',
        available: false 
      });
    }
    
    await ragService.deleteScriptIndex(scriptId);
    
    res.json({
      success: true,
      scriptId,
      message: '索引已删除',
    });
  } catch (error) {
    console.error('[RAG API] 删除索引失败:', error);
    res.status(500).json({ 
      message: '删除索引失败', 
      error: error.message 
    });
  }
});

/**
 * GET /api/rag/status
 * 获取 RAG 服务状态（管理员可用）
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const status = await ragService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('[RAG API] 获取状态失败:', error);
    res.status(500).json({ 
      available: false,
      message: error.message 
    });
  }
});

module.exports = router;
