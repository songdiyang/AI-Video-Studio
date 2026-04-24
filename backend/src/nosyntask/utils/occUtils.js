/**
 * 乐观锁 (Optimistic Concurrency Control) 共享工具
 *
 * 通过 version 字段实现无锁并发更新：
 *   UPDATE ... SET ..., version = version + 1 WHERE id = ? AND version = ?
 *   版本不匹配 → 重试（重新读取最新 version）
 *
 * 在 WorkflowExecutor 和 JobStatusManager 中统一复用，
 * 消除之前的逐字重复实现。
 */

const { execute, queryOne } = require('../../dbHelper');

const OCC_MAX_RETRIES = 3;
const OCC_RETRY_DELAY = 50; // 基础毫秒，每次重试递增

/**
 * 带乐观锁的工作流状态更新
 *
 * @param {number} jobId         - 工作流 ID
 * @param {object} updates       - 要更新的字段 { status: 'completed', ... }
 * @param {number} currentVersion - 当前已知的版本号
 * @param {number} [maxRetries]  - 最大重试次数，默认 3
 * @returns {object} execute 返回值
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

module.exports = { updateJobWithVersion };
