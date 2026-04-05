/**
 * 任务状态管理模块
 * 负责更新任务和工作流的状态，并通过 WebSocket 推送状态变更
 * 
 * 性能优化：
 * - 通过 Redis CacheService 缓存任务整体进度（减少 DB 查询）
 * - Redis 不可用时自动退回 DB 查询模式
 */

const { execute, queryOne, queryAll } = require('../../dbHelper');
const { pushTaskStatus } = require('../../websocket');

// 尝试加载 Redis 缓存服务（可选）
let CacheService = null;
try {
  CacheService = require('../../redis-service').CacheService;
} catch (e) {
  // Redis 服务不可用时忽略
}

// 尝试加载 Pub/Sub 服务（可选，用于工作流事件异步解耦）
let PubSubService = null;
try {
  PubSubService = require('../../redis-service').PubSubService;
} catch (e) {
  // Redis 服务不可用时忽略
}

const PROGRESS_CACHE_TTL = 30; // 进度缓存 30 秒
const OCC_MAX_RETRIES = 3;  // 乐观锁最大重试次数
const OCC_RETRY_DELAY = 50; // 重试间隔基础毫秒

/**
 * 带乐观锁的工作流状态更新（OCC）
 * 理论基础：Optimistic Concurrency Control
 * 
 * @param {number} jobId - 工作流 ID
 * @param {object} updates - 要更新的字段 { status: 'completed', ... }
 * @param {number} currentVersion - 当前已知的版本号
 * @param {number} maxRetries - 最大重试次数
 * @returns {object} 更新结果
 */
async function updateJobWithVersion(jobId, updates, currentVersion, maxRetries = OCC_MAX_RETRIES) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let version = currentVersion;
    
    // 重试时需要重新获取最新版本号
    if (attempt > 0) {
      const latest = await queryOne('SELECT version FROM workflow_jobs WHERE id = ?', [jobId]);
      if (!latest) throw new Error(`工作流 ${jobId} 不存在`);
      version = latest.version;
      await new Promise(r => setTimeout(r, OCC_RETRY_DELAY * (attempt + 1)));
    }
    
    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values = [...Object.values(updates), jobId, version];
    
    const result = await execute(
      `UPDATE workflow_jobs SET ${setClauses}, version = version + 1 WHERE id = ? AND version = ?`,
      values
    );
    
    if (result.affectedRows > 0) {
      return result;
    }
    
    console.warn(`[OCC] 工作流 ${jobId} 版本冲突 (尝试 ${attempt + 1}/${maxRetries}, 期望版本: ${version})`);
  }
  
  // 所有重试都失败，做最后一次无版本检查的更新（保证业务不被阻塞）
  console.error(`[OCC] 工作流 ${jobId} 连续 ${maxRetries} 次版本冲突，执行强制更新`);
  const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
  const values = [...Object.values(updates), jobId];
  return execute(`UPDATE workflow_jobs SET ${setClauses}, version = version + 1 WHERE id = ?`, values);
}

class JobStatusManager {
  /**
   * 标记任务完成
   */
  async completeTask(taskId, resultData, traceData = null) {
    await execute(
      `UPDATE generation_tasks 
       SET status = 'completed', progress = 100, result_data = ?, work_result = ?, completed_at = NOW() 
       WHERE id = ?`,
      [JSON.stringify(resultData), traceData ? JSON.stringify(traceData) : null, taskId]
    );
    console.log(`[JobStatusManager] 任务完成: taskId=${taskId}`);
    
    // 使进度缓存失效
    await this._invalidateProgressCache(taskId);
    
    // 推送任务状态更新
    await this._pushTaskUpdate(taskId, 'completed', 100, resultData);
  }

  /**
   * 标记任务失败
   */
  async failTask(taskId, errorMessage, traceData = null) {
    await execute(
      `UPDATE generation_tasks 
       SET status = 'failed', error_message = ?, work_result = ?, completed_at = NOW() 
       WHERE id = ?`,
      [errorMessage, traceData ? JSON.stringify(traceData) : null, taskId]
    );
    console.log(`[JobStatusManager] 任务失败: taskId=${taskId}, error=${errorMessage}`);
    
    // 使进度缓存失效
    await this._invalidateProgressCache(taskId);
    
    // 推送任务状态更新
    await this._pushTaskUpdate(taskId, 'failed', null, null, errorMessage);
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(taskId, progress) {
    await execute(
      `UPDATE generation_tasks SET progress = ? WHERE id = ?`,
      [progress, taskId]
    );
    
    // 推送进度更新
    await this._pushTaskUpdate(taskId, 'running', progress);
  }

  /**
   * 标记工作流完成
   */
  async completeJob(jobId) {
    // 获取当前版本号
    const job = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
    await updateJobWithVersion(jobId, { status: 'completed', completed_at: new Date() }, job?.version || 0);
    console.log(`[JobStatusManager] 工作流完成: jobId=${jobId}`);
    
    // 获取最后一个任务的结果
    const lastTask = await queryOne(
      `SELECT result_data FROM generation_tasks WHERE job_id = ? ORDER BY id DESC LIMIT 1`,
      [jobId]
    );
    
    // 清除该工作流的进度缓存
    await this._invalidateJobProgressCache(jobId);
    
    // 推送工作流完成状态
    pushTaskStatus(jobId, {
      status: 'completed',
      progress: 100,
      result: lastTask?.result_data ? JSON.parse(lastTask.result_data) : null
    });

    // 异步发布工作流完成事件（不阻塞主流程）
    if (PubSubService && PubSubService.isAvailable()) {
      PubSubService.publish('workflow:completed', {
        jobId: jobId,
        userId: job?.user_id,
        status: 'completed',
        workflowType: job?.workflow_type,
        completedAt: new Date().toISOString()
      }).catch(err => {
        console.warn('[PubSub] 发布工作流完成事件失败:', err.message);
      });
    }
  }

  /**
   * 标记工作流失败
   */
  async failJob(jobId, errorMessage) {
    // 获取当前版本号
    const job = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
    await updateJobWithVersion(jobId, { status: 'failed', error_message: errorMessage }, job?.version || 0);
    console.log(`[JobStatusManager] 工作流失败: jobId=${jobId}, error=${errorMessage}`);
    
    // 清除该工作流的进度缓存
    await this._invalidateJobProgressCache(jobId);
    
    // 推送工作流失败状态
    pushTaskStatus(jobId, {
      status: 'failed',
      error: errorMessage
    });

    // 异步发布工作流失败事件（不阻塞主流程）
    if (PubSubService && PubSubService.isAvailable()) {
      PubSubService.publish('workflow:failed', {
        jobId: jobId,
        userId: job?.user_id,
        status: 'failed',
        workflowType: job?.workflow_type,
        error: errorMessage || '未知错误',
        failedAt: new Date().toISOString()
      }).catch(err => {
        console.warn('[PubSub] 发布工作流失败事件失败:', err.message);
      });
    }
  }

  /**
   * 内部方法：推送单个任务的状态更新（带缓存优化）
   */
  async _pushTaskUpdate(taskId, taskStatus, progress = null, result = null, error = null) {
    try {
      // 获取任务所属的工作流 ID
      const task = await queryOne(
        `SELECT job_id FROM generation_tasks WHERE id = ?`,
        [taskId]
      );
      
      if (!task) return;
      
      const jobId = task.job_id;
      
      // 计算工作流整体进度（优先使用缓存）
      let overallProgress = await this._getCachedProgress(jobId);
      
      if (overallProgress === null) {
        // 缓存未命中，从 DB 计算
        const tasks = await queryAll(
          `SELECT progress FROM generation_tasks WHERE job_id = ?`,
          [jobId]
        );
        
        overallProgress = tasks.length > 0
          ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
          : 0;
        
        // 写入缓存
        await this._setCachedProgress(jobId, overallProgress);
      }
      
      // 推送状态
      pushTaskStatus(jobId, {
        taskId,
        taskStatus,
        progress: overallProgress,
        result,
        error
      });
    } catch (err) {
      console.error('[JobStatusManager] 推送任务状态失败:', err);
    }
  }

  /**
   * 获取缓存的工作流进度
   */
  async _getCachedProgress(jobId) {
    if (!CacheService) return null;
    
    try {
      return await CacheService.get(`workflow:progress:${jobId}`);
    } catch (e) {
      return null;
    }
  }

  /**
   * 设置工作流进度缓存
   */
  async _setCachedProgress(jobId, progress) {
    if (!CacheService) return;
    
    try {
      await CacheService.set(`workflow:progress:${jobId}`, progress, PROGRESS_CACHE_TTL);
    } catch (e) {
      // 静默
    }
  }

  /**
   * 使单个任务的进度缓存失效（通过 taskId 找到 jobId）
   */
  async _invalidateProgressCache(taskId) {
    if (!CacheService) return;
    
    try {
      const task = await queryOne('SELECT job_id FROM generation_tasks WHERE id = ?', [taskId]);
      if (task) {
        await CacheService.del(`workflow:progress:${task.job_id}`);
      }
    } catch (e) {
      // 静默
    }
  }

  /**
   * 使工作流进度缓存失效
   */
  async _invalidateJobProgressCache(jobId) {
    if (!CacheService) return;
    
    try {
      await CacheService.del(`workflow:progress:${jobId}`);
    } catch (e) {
      // 静默
    }
  }
}

module.exports = JobStatusManager;
