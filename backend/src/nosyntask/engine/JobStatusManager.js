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

const PROGRESS_CACHE_TTL = 30; // 进度缓存 30 秒

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
    await execute(
      `UPDATE workflow_jobs SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [jobId]
    );
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
  }

  /**
   * 标记工作流失败
   */
  async failJob(jobId, errorMessage) {
    await execute(
      `UPDATE workflow_jobs SET status = 'failed', error_message = ? WHERE id = ?`,
      [errorMessage, jobId]
    );
    console.log(`[JobStatusManager] 工作流失败: jobId=${jobId}, error=${errorMessage}`);
    
    // 清除该工作流的进度缓存
    await this._invalidateJobProgressCache(jobId);
    
    // 推送工作流失败状态
    pushTaskStatus(jobId, {
      status: 'failed',
      error: errorMessage
    });
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
