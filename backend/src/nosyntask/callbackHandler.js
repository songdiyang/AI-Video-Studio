/**
 * AI 任务 Webhook 回调处理器
 * 
 * 当 AI 服务（火山引擎 Seedance、可灵等）支持回调机制时，
 * 可以在提交任务时附带 callback_url，AI 服务完成后主动回调此接口，
 * 避免大量轮询请求。
 * 
 * 回调流程：
 * 1. submitAndPoll 提交任务时，在请求参数中附带 callback_url
 * 2. AI 服务处理完成后，POST 回调到 /api/callbacks/ai-task/:callbackId
 * 3. 本模块接收回调，resolve 对应的 Promise，任务立即进入后处理阶段
 * 4. 如果 AI 服务不支持回调或回调超时，自动降级为 PollManager 轮询
 * 
 * 安全机制：
 * - callbackId 使用 UUID v4，不可被猜测
 * - 每个回调只能触发一次（防重放）
 * - 超时自动清理（默认 10 分钟）
 */

const crypto = require('crypto');
const express = require('express');

const router = express.Router();

// 等待回调的任务 Map<callbackId, { resolve, reject, timeout, createdAt, modelName }>
const pendingCallbacks = new Map();

// 回调超时时间（毫秒）
const CALLBACK_TIMEOUT = parseInt(process.env.CALLBACK_TIMEOUT, 10) || 600000; // 10 分钟

// 定期清理过期回调
const CLEANUP_INTERVAL = 60000; // 1 分钟
setInterval(() => {
  const now = Date.now();
  for (const [id, task] of pendingCallbacks) {
    if (now - task.createdAt > CALLBACK_TIMEOUT) {
      console.warn(`[Callback] 回调超时，清理: ${id} (模型: ${task.modelName})`);
      pendingCallbacks.delete(id);
      // 不 reject，让调用方的超时机制处理
    }
  }
}, CLEANUP_INTERVAL);

/**
 * 注册一个回调等待
 * 返回 { callbackId, callbackUrl, promise }
 * 
 * @param {string} modelName - 模型名称
 * @param {string} baseUrl - 服务器基础 URL（如 https://yourdomain.com）
 * @returns {object} { callbackId, callbackUrl, promise }
 */
function registerCallback(modelName, baseUrl) {
  const callbackId = crypto.randomUUID();
  const callbackUrl = `${baseUrl}/api/callbacks/ai-task/${callbackId}`;

  const promise = new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      if (pendingCallbacks.has(callbackId)) {
        pendingCallbacks.delete(callbackId);
        // resolve with null 表示超时，调用方需降级为轮询
        resolve(null);
      }
    }, CALLBACK_TIMEOUT);

    pendingCallbacks.set(callbackId, {
      resolve: (data) => {
        clearTimeout(timeoutTimer);
        pendingCallbacks.delete(callbackId);
        resolve(data);
      },
      reject: (err) => {
        clearTimeout(timeoutTimer);
        pendingCallbacks.delete(callbackId);
        reject(err);
      },
      timeout: timeoutTimer,
      createdAt: Date.now(),
      modelName
    });
  });

  console.log(`[Callback] 注册回调: ${callbackId} (模型: ${modelName})`);

  return { callbackId, callbackUrl, promise };
}

/**
 * 检查回调是否已注册（用于判断是否需要降级轮询）
 */
function isCallbackPending(callbackId) {
  return pendingCallbacks.has(callbackId);
}

/**
 * 获取回调统计
 */
function getCallbackStats() {
  return {
    pendingCount: pendingCallbacks.size,
    pendingModels: Array.from(pendingCallbacks.values()).reduce((acc, task) => {
      acc[task.modelName] = (acc[task.modelName] || 0) + 1;
      return acc;
    }, {})
  };
}

// ============================================
// 回调接收路由
// ============================================

/**
 * POST /api/callbacks/ai-task/:callbackId
 * 
 * AI 服务完成后回调此接口
 * 请求体为 AI 服务返回的原始结果
 */
router.post('/ai-task/:callbackId', (req, res) => {
  const { callbackId } = req.params;
  const callbackData = req.body;

  console.log(`[Callback] 收到回调: ${callbackId}`);

  const pending = pendingCallbacks.get(callbackId);
  if (!pending) {
    console.warn(`[Callback] 未知或已过期的回调: ${callbackId}`);
    return res.status(404).json({ error: '回调不存在或已过期' });
  }

  try {
    // 触发 resolve，让等待中的 Promise 完成
    pending.resolve(callbackData);
    console.log(`[Callback] 回调成功处理: ${callbackId} (模型: ${pending.modelName})`);
    res.json({ status: 'ok', message: '回调已接收' });
  } catch (err) {
    console.error(`[Callback] 回调处理失败: ${callbackId}`, err);
    res.status(500).json({ error: '回调处理失败' });
  }
});

/**
 * GET /api/callbacks/stats
 * 管理端查看回调统计
 */
router.get('/stats', (req, res) => {
  res.json(getCallbackStats());
});

module.exports = {
  router,
  registerCallback,
  isCallbackPending,
  getCallbackStats
};
