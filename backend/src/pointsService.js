/**
 * 积分服务
 * 
 * 核心公式：
 *   积分 = ceil(成本(元) × (1 + 服务费率) / 积分单价)
 * 
 * 其中：
 *   - 成本(元) = token消耗 × 模型单价
 *   - 服务费率 = 后台可配置，默认 50%
 *   - 积分单价 = ¥0.01/积分（固定，1积分=1分钱）
 */

const { queryOne, execute } = require('./dbHelper');

// 积分基础配置（固定）
const POINT_VALUE_CNY = 0.01;  // 1积分 = ¥0.01（1分钱）— 内部成本转换用
const POINT_PURCHASE_PRICE = 0.02;  // 积分充值售价 ¥0.02/积分（2分钱一积分）— 用户购买充值价格

// 缓存服务费率（避免频繁查库）
let cachedServiceFeeRate = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1分钟缓存

/**
 * 获取服务费率（从 system_configs 读取，支持后台调整）
 * @returns {Promise<number>} 服务费率，如 0.5 表示 50%
 */
async function getServiceFeeRate() {
  const now = Date.now();
  if (cachedServiceFeeRate !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedServiceFeeRate;
  }
  
  try {
    const config = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'service_fee_rate' AND is_active = 1"
    );
    
    if (config && config.config_value) {
      const rate = parseFloat(config.config_value);
      if (!isNaN(rate) && rate >= 0 && rate <= 2) {
        cachedServiceFeeRate = rate;
        cacheTimestamp = now;
        return rate;
      }
    }
  } catch (error) {
    console.warn('[PointsService] 读取服务费率失败，使用默认值:', error.message);
  }
  
  // 默认 50%
  cachedServiceFeeRate = 0.5;
  cacheTimestamp = now;
  return 0.5;
}

/**
 * 清除服务费率缓存（后台修改配置后调用）
 */
function clearServiceFeeRateCache() {
  cachedServiceFeeRate = null;
  cacheTimestamp = 0;
}

/**
 * 根据成本(元)计算积分消耗
 * 
 * @param {number} costCNY - 原始成本（元）
 * @param {Object} options - 选项
 * @param {number} options.serviceFeeRate - 服务费率（可选，默认从配置读取）
 * @param {number} options.minPoints - 最小积分（默认1）
 * @returns {Promise<Object>} 计算结果
 */
async function calculatePointsFromCost(costCNY, options = {}) {
  const serviceFeeRate = options.serviceFeeRate ?? await getServiceFeeRate();
  const minPoints = options.minPoints ?? 1;
  
  // 原始成本
  const rawCost = Math.max(0, parseFloat(costCNY) || 0);
  
  // 服务费
  const serviceFee = rawCost * serviceFeeRate;
  
  // 总价（含服务费）
  const totalPrice = rawCost + serviceFee;
  
  // 转换为积分（向上取整，保证不亏）
  // 注意：浮点精度问题，0.15/0.01=15.000000000000002，需要先 round 再 ceil
  const rawPoints = totalPrice / POINT_VALUE_CNY;
  // 如果差值小于 0.000001，视为整数
  const roundedPoints = Math.abs(rawPoints - Math.round(rawPoints)) < 0.000001 
    ? Math.round(rawPoints) 
    : Math.ceil(rawPoints);
  const points = Math.max(minPoints, roundedPoints);
  
  // 实际积分价值
  const pointsValue = points * POINT_VALUE_CNY;
  
  return {
    rawCost: round6(rawCost),           // 原始成本（元）
    serviceFeeRate,                      // 服务费率
    serviceFee: round6(serviceFee),     // 服务费（元）
    totalPrice: round6(totalPrice),     // 总价（元）
    points,                              // 消耗积分
    pointsValue: round6(pointsValue),   // 积分价值（元）
    profitMargin: rawCost > 0 ? round6((pointsValue - rawCost) / pointsValue) : 0  // 毛利率
  };
}

/**
 * 根据消耗量和模型类别计算成本（元）
 * 
 * 这个函数将实际 token/图片/视频 消耗转换为成本
 * 
 * @param {string} category - 模型类别：TEXT, IMAGE, VIDEO
 * @param {Object} usage - 消耗量
 * @param {Object} priceConfig - 价格配置（归一化后）
 * @returns {number} 成本（元）
 */
function calculateCostFromUsage(category, usage, priceConfig) {
  let cost = 0;
  
  if (!priceConfig || !priceConfig.components) {
    return 0;
  }
  
  for (const component of priceConfig.components) {
    const type = component.type;
    const price = parseFloat(component.price) || 0;
    const unit = component.unit || 'per_million_tokens';
    
    let quantity = 0;
    
    switch (type) {
      case 'input_tokens':
        quantity = usage.inputTokens || 0;
        break;
      case 'output_tokens':
        quantity = usage.outputTokens || 0;
        break;
      case 'total_tokens':
        quantity = usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0);
        break;
      case 'duration_seconds':
        quantity = usage.durationSeconds || 0;
        break;
      case 'item_count':
        quantity = usage.itemCount || 1;
        break;
      case 'request_count':
        quantity = usage.requestCount || 1;
        break;
    }
    
    // 根据单位计算
    if (unit === 'per_million_tokens') {
      cost += (quantity / 1_000_000) * price;
    } else if (unit === 'per_token') {
      cost += quantity * price;
    } else {
      // per_second, per_item, per_request 等
      cost += quantity * price;
    }
  }
  
  return cost;
}

/**
 * 完整的积分计算：从消耗量到积分
 * 
 * @param {string} category - 模型类别
 * @param {Object} usage - 消耗量
 * @param {Object} priceConfig - 价格配置
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 积分计算结果
 */
async function calculatePoints(category, usage, priceConfig, options = {}) {
  const cost = calculateCostFromUsage(category, usage, priceConfig);
  const result = await calculatePointsFromCost(cost, options);
  
  return {
    ...result,
    category,
    usage: { ...usage }
  };
}

/**
 * 检查积分是否充足
 * 
 * @param {number} userId - 用户ID
 * @param {number} requiredPoints - 需要的积分
 * @returns {Promise<Object>} { sufficient, balance, required }
 */
async function checkPointsBalance(userId, requiredPoints) {
  const user = await queryOne('SELECT balance, role FROM users WHERE id = ?', [userId]);
  const balance = parseInt(user?.balance) || 0;
  
  // 管理员跳过检查
  if (user?.role === 'admin') {
    return { sufficient: true, balance, required: requiredPoints, isAdmin: true };
  }
  
  return {
    sufficient: balance >= requiredPoints,
    balance,
    required: requiredPoints,
    isAdmin: false
  };
}

/**
 * 扣除积分
 * 
 * @param {number} userId - 用户ID
 * @param {number} points - 扣除积分数
 * @returns {Promise<Object>} { success, balanceAfter }
 */
async function deductPoints(userId, points) {
  const pointsInt = Math.ceil(points);
  if (pointsInt <= 0) {
    return { success: true, balanceAfter: null, deducted: 0 };
  }
  
  // 管理员跳过扣费
  const user = await queryOne('SELECT role, balance FROM users WHERE id = ?', [userId]);
  if (user?.role === 'admin') {
    return { success: true, balanceAfter: user.balance, deducted: 0, isAdmin: true };
  }
  
  const result = await execute(
    'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?',
    [pointsInt, userId, pointsInt]
  );
  
  if (!result?.affectedRows) {
    const error = new Error('积分不足');
    error.code = 'INSUFFICIENT_POINTS';
    error.status = 402;
    error.required = pointsInt;
    error.current = user?.balance || 0;
    throw error;
  }
  
  // 获取扣除后余额
  const updated = await queryOne('SELECT balance FROM users WHERE id = ?', [userId]);
  
  return {
    success: true,
    balanceAfter: updated?.balance || 0,
    deducted: pointsInt
  };
}

/**
 * 精度处理：保留6位小数
 */
function round6(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

/**
 * 格式化积分显示（给前端用）
 * 
 * @param {number} points - 积分数
 * @returns {Object} 格式化结果
 */
function formatPointsDisplay(points) {
  const costValue = points * POINT_VALUE_CNY;
  const purchaseValue = points * POINT_PURCHASE_PRICE;
  return {
    points,
    pointsLabel: `${points} 积分`,
    valueLabel: `≈ ¥${purchaseValue.toFixed(2)}`,
    valueCNY: round6(costValue),
    purchaseValueCNY: round6(purchaseValue),
    purchasePricePerPoint: POINT_PURCHASE_PRICE
  };
}

module.exports = {
  POINT_VALUE_CNY,
  POINT_PURCHASE_PRICE,
  getServiceFeeRate,
  clearServiceFeeRateCache,
  calculatePointsFromCost,
  calculateCostFromUsage,
  calculatePoints,
  checkPointsBalance,
  deductPoints,
  formatPointsDisplay
};
