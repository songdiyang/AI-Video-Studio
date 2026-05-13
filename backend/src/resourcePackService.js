/**
 * 资源包服务
 * 
 * 管理用户资源包的创建、查询、扣减和过期清零。
 * 每个资源包独立有效期1个月，到期后剩余积分清零。
 */

const { queryOne, queryAll, execute } = require('./dbHelper');

/**
 * 计算资源包有效期（自然月模式）
 * 资源包有效期统一为1个自然月：
 *   - 如果当前日期在当月15日及之前，有效期到当月月末
 *   - 如果当前日期在当月15日之后，有效期到下月月末
 * 这样所有资源包都在月末统一到期，方便月度清零
 * @param {Date} startDate - 开始日期，默认当前时间
 * @returns {{ periodStart: Date, periodEnd: Date }}
 */
function calculatePeriod(startDate) {
  startDate = startDate || new Date();
  const periodStart = new Date(startDate);
  // 当月最后一天 23:59:59
  const currentMonthEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59, 0);
  // 下月最后一天 23:59:59
  const nextMonthEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 2, 0, 23, 59, 59, 0);

  // 当月15日及之前 → 到当月月末；16日及之后 → 到下月月末
  const periodEnd = periodStart.getDate() <= 15 ? currentMonthEnd : nextMonthEnd;

  return { periodStart: periodStart, periodEnd: periodEnd };
}

/**
 * 为用户创建资源包
 */
async function createResourcePack(userId, options) {
  var name = options.name;
  var totalPoints = options.totalPoints;
  var sourceType = options.sourceType || 'purchase';
  var sourceId = options.sourceId || null;
  var isGift = options.isGift || false;
  var customStart = options.periodStart;
  var customEnd = options.periodEnd;
  var packType = options.packType || 'points';

  var points = Math.max(1, Math.round(totalPoints));
  var period;
  if (customStart && customEnd) {
    period = { periodStart: customStart, periodEnd: customEnd };
  } else {
    period = calculatePeriod();
  }

  var result = await execute(
    'INSERT INTO user_resource_packs (user_id, name, total_points, remaining_points, source_type, source_id, period_start, period_end, status, is_gift, pack_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'active\', ?, ?)',
    [userId, name, points, points, sourceType, sourceId, period.periodStart, period.periodEnd, isGift ? 1 : 0, packType]
  );

  await syncUserBalance(userId);

  return {
    id: result.insertId,
    userId: userId,
    name: name,
    totalPoints: points,
    remainingPoints: points,
    sourceType: sourceType,
    isGift: isGift,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: 'active'
  };
}

/**
 * 获取用户所有资源包
 */
async function getUserResourcePacks(userId, options) {
  options = options || {};
  var includeExpired = options.includeExpired !== false;

  var sql = 'SELECT * FROM user_resource_packs WHERE user_id = ?';
  var params = [userId];

  if (!includeExpired) {
    sql += " AND status = 'active' AND period_end > NOW()";
  }

  sql += ' ORDER BY period_end ASC';

  var packs = await queryAll(sql, params);

  var activeBalance = 0;
  var formattedPacks = packs.map(function(pack) {
    var remaining = parseInt(pack.remaining_points) || 0;
    var total = parseInt(pack.total_points) || 0;
    var isActive = pack.status === 'active' && new Date(pack.period_end) > new Date();
    if (isActive) {
      activeBalance += remaining;
    }
    // 计算月份展示文本，如 "2026年4月" 或 "2026年4月 ~ 2026年5月"
    var pStart = new Date(pack.period_start);
    var pEnd = new Date(pack.period_end);
    var startMonth = pStart.getFullYear() + '年' + (pStart.getMonth() + 1) + '月';
    var endMonth = pEnd.getFullYear() + '年' + (pEnd.getMonth() + 1) + '月';
    var periodMonth = startMonth === endMonth ? startMonth : startMonth + ' ~ ' + endMonth;
    return {
      id: pack.id,
      name: pack.name,
      totalPoints: total,
      remainingPoints: remaining,
      sourceType: pack.source_type,
      sourceId: pack.source_id,
      isGift: !!pack.is_gift,
      periodStart: pack.period_start,
      periodEnd: pack.period_end,
      periodMonth: periodMonth,
      status: pack.status,
      isActive: isActive,
      createdAt: pack.created_at
    };
  });

  var user = await queryOne('SELECT balance FROM users WHERE id = ?', [userId]);

  return {
    packs: formattedPacks,
    totalBalance: parseInt(user && user.balance) || 0,
    activeBalance: activeBalance
  };
}

/**
 * 从资源包中扣减积分（按到期时间升序，先到期的先扣）
 */
async function deductFromResourcePacks(userId, points) {
  var pointsInt = Math.ceil(points);
  if (pointsInt <= 0) {
    return { success: true, deducted: 0, balanceAfter: null };
  }

  var packs = await queryAll(
    "SELECT id, remaining_points, period_end FROM user_resource_packs WHERE user_id = ? AND status = 'active' AND period_end > NOW() AND remaining_points > 0 ORDER BY period_end ASC",
    [userId]
  );

  var totalAvailable = packs.reduce(function(sum, p) { return sum + (parseInt(p.remaining_points) || 0); }, 0);
  if (totalAvailable < pointsInt) {
    var error = new Error('积分不足');
    error.code = 'INSUFFICIENT_POINTS';
    error.status = 402;
    error.required = pointsInt;
    error.current = totalAvailable;
    throw error;
  }

  var remaining = pointsInt;
  for (var i = 0; i < packs.length; i++) {
    if (remaining <= 0) break;
    var pack = packs[i];
    var packRemaining = parseInt(pack.remaining_points) || 0;
    if (packRemaining <= 0) continue;

    var deductFromPack = Math.min(remaining, packRemaining);
    var newRemaining = packRemaining - deductFromPack;

    await execute(
      'UPDATE user_resource_packs SET remaining_points = ?, status = ? WHERE id = ?',
      [newRemaining, newRemaining === 0 ? 'used_up' : 'active', pack.id]
    );

    remaining -= deductFromPack;
  }

  await syncUserBalance(userId);

  var user = await queryOne('SELECT balance FROM users WHERE id = ?', [userId]);
  return {
    success: true,
    deducted: pointsInt,
    balanceAfter: parseInt(user && user.balance) || 0
  };
}

/**
 * 检查积分余额是否低于用户设置的预警阈值，如果是则发送站内信
 * @param {number} userId - 用户ID
 * @param {number} newBalance - 新的余额
 */
async function checkPointsWarningThreshold(userId, newBalance) {
  try {
    var user = await queryOne(
      'SELECT points_warning_threshold FROM users WHERE id = ?',
      [userId]
    );
    var threshold = user && user.points_warning_threshold;
    // 阈值未设置或为null时不检查
    if (threshold === null || threshold === undefined) return;
    threshold = parseInt(threshold);
    if (isNaN(threshold) || threshold <= 0) return;

    // 余额低于阈值时发送站内信
    if (newBalance < threshold) {
      // 检查最近24小时内是否已经发送过警告，避免重复发送
      var recentMail = await queryOne(
        "SELECT id FROM internal_mail WHERE receiver_id = ? AND title = '积分余额预警' AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1",
        [userId]
      );
      if (recentMail) return; // 24小时内已发送过，跳过

      var mailTitle = '积分余额预警';
      var mailContent = [
        '**积分余额预警**',
        '',
        '您的积分余额已低于设定的预警阈值。',
        '',
        '| 项目 | 详情 |',
        '| --- | --- |',
        '| 当前余额 | ' + newBalance + ' 积分 |',
        '| 预警阈值 | ' + threshold + ' 积分 |',
        '',
        '请及时充值积分，以免影响后续 AI 创作任务的执行。'
      ].join('\n');

      await execute(
        "INSERT INTO internal_mail (sender_type, sender_id, receiver_id, title, content, mail_type) VALUES ('system', 0, ?, ?, ?, 'system')",
        [userId, mailTitle, mailContent]
      );
      console.log('[PointsWarning] 用户 ' + userId + ' 积分余额 ' + newBalance + ' 低于阈值 ' + threshold + '，已发送站内信警告');
    }
  } catch (err) {
    console.warn('[PointsWarning] 检查积分阈值失败:', err.message);
  }
}

/**
 * 同步 users.balance = 所有活跃资源包的 remaining_points 之和
 */
async function syncUserBalance(userId) {
  var result = await queryOne(
    "SELECT COALESCE(SUM(remaining_points), 0) AS total FROM user_resource_packs WHERE user_id = ? AND status = 'active' AND period_end > NOW()",
    [userId]
  );
  var newBalance = parseInt(result && result.total) || 0;
  await execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);
  // 检查积分预警阈值
  await checkPointsWarningThreshold(userId, newBalance);
  return newBalance;
}

/**
 * 清零过期资源包（定时任务调用）
 * 每月自然月结束后，所有到期资源包的剩余积分清零
 */
async function expireResourcePacks() {
  var expiredPacks = await queryAll(
    "SELECT id, user_id, name, remaining_points, period_end, is_gift FROM user_resource_packs WHERE status = 'active' AND period_end < NOW()"
  );

  if (expiredPacks.length === 0) {
    return { expiredCount: 0, affectedUsers: 0 };
  }

  var affectedUserIds = {};

  for (var i = 0; i < expiredPacks.length; i++) {
    var pack = expiredPacks[i];
    var lostPoints = parseInt(pack.remaining_points) || 0;

    await execute(
      "UPDATE user_resource_packs SET remaining_points = 0, status = 'expired' WHERE id = ?",
      [pack.id]
    );

    affectedUserIds[pack.user_id] = true;

    if (lostPoints > 0) {
      try {
        var periodEndDate = new Date(pack.period_end).toLocaleDateString('zh-CN');
        var giftTag = pack.is_gift ? '（赠送）' : '';
        var mailTitle = '月度积分清零通知';
        var mailContent = [
          '**月度积分清零通知**',
          '',
          '| 项目 | 详情 |',
          '| --- | --- |',
          '| 资源包名称 | ' + pack.name + giftTag + ' |',
          '| 到期时间 | ' + periodEndDate + ' |',
          '| 清零积分 | ' + lostPoints + ' 积分 |',
          '',
          '您的该资源包已到期，剩余积分已月度清零。如需继续使用，请购买新的资源包。'
        ].join('\n');

        await execute(
          "INSERT INTO internal_mail (sender_type, sender_id, receiver_id, title, content, mail_type) VALUES ('system', 0, ?, ?, ?, 'system')",
          [pack.user_id, mailTitle, mailContent]
        );
      } catch (mailErr) {
        console.warn('[ResourcePack] 发送过期通知失败:', mailErr.message);
      }
    }
  }

  var userIds = Object.keys(affectedUserIds);
  for (var j = 0; j < userIds.length; j++) {
    await syncUserBalance(parseInt(userIds[j]));
  }

  console.log('[ResourcePack] 清零完成: ' + expiredPacks.length + ' 个资源包, ' + userIds.length + ' 个用户受影响');
  return {
    expiredCount: expiredPacks.length,
    affectedUsers: userIds.length
  };
}

/**
 * 检查积分是否充足（基于资源包）
 */
async function checkResourcePackBalance(userId, requiredPoints) {
  var user = await queryOne('SELECT role, balance FROM users WHERE id = ?', [userId]);

  if (user && user.role === 'admin') {
    return { sufficient: true, balance: parseInt(user && user.balance) || 0, required: requiredPoints, isAdmin: true };
  }

  var result = await queryOne(
    "SELECT COALESCE(SUM(remaining_points), 0) AS total FROM user_resource_packs WHERE user_id = ? AND status = 'active' AND period_end > NOW()",
    [userId]
  );
  var availableBalance = parseInt(result && result.total) || 0;

  return {
    sufficient: availableBalance >= requiredPoints,
    balance: availableBalance,
    required: requiredPoints,
    isAdmin: false
  };
}

module.exports = {
  calculatePeriod: calculatePeriod,
  createResourcePack: createResourcePack,
  getUserResourcePacks: getUserResourcePacks,
  deductFromResourcePacks: deductFromResourcePacks,
  syncUserBalance: syncUserBalance,
  expireResourcePacks: expireResourcePacks,
  checkResourcePackBalance: checkResourcePackBalance
};
