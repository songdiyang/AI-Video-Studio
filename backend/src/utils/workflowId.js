/**
 * 工作流ID转换工具
 * 
 * 数据库存储使用INT自增ID，API层使用16进制字符串
 * 优点：
 * 1. 保持数据库性能（INT索引更快）
 * 2. API层ID更短（16进制比10进制更短）
 * 3. 隐藏数据库内部ID序列
 */

/**
 * 将十进制数字ID转换为16进制字符串
 * @param {number} id - 十进制ID
 * @returns {string} 16进制字符串（小写，无前缀）
 */
function encodeId(id) {
  if (id === null || id === undefined) return null;
  const num = Number(id);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`Invalid workflow ID: ${id}`);
  }
  return num.toString(16);
}

/**
 * 将16进制字符串转换为十进制数字ID
 * @param {string} hexId - 16进制字符串
 * @returns {number} 十进制ID
 */
function decodeId(hexId) {
  if (hexId === null || hexId === undefined) return null;
  
  // 如果已经是数字，直接返回
  if (typeof hexId === 'number') {
    return hexId;
  }
  
  const str = String(hexId).toLowerCase();
  
  // 兼容旧版纯数字ID（前端可能传入数字或数字字符串）
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  
  // 16进制转换
  if (!/^[0-9a-f]+$/.test(str)) {
    throw new Error(`Invalid hex workflow ID: ${hexId}`);
  }
  
  return parseInt(str, 16);
}

/**
 * 安全转换ID（不抛出异常，返回null）
 * @param {string|number} hexId - 16进制字符串或数字
 * @returns {number|null} 十进制ID或null
 */
function safeDecodeId(hexId) {
  try {
    return decodeId(hexId);
  } catch (e) {
    return null;
  }
}

/**
 * 转换工作流任务对象中的ID字段为16进制
 * @param {object} task - 任务对象
 * @returns {object} 转换后的任务对象
 */
function encodeTaskIds(task) {
  if (!task) return task;
  return {
    ...task,
    id: encodeId(task.id),
    job_id: encodeId(task.job_id)
  };
}

/**
 * 转换工作流Job对象中的ID字段为16进制
 * @param {object} job - 工作流Job对象
 * @returns {object} 转换后的Job对象
 */
function encodeJobIds(job) {
  if (!job) return job;
  return {
    ...job,
    id: encodeId(job.id),
    user_id: job.user_id, // user_id 保持原样，不转换
    project_id: job.project_id, // project_id 保持原样
    tasks: (job.tasks || []).map(encodeTaskIds)
  };
}

module.exports = {
  encodeId,
  decodeId,
  safeDecodeId,
  encodeTaskIds,
  encodeJobIds
};
