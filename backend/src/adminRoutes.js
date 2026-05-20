const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware, requireAdmin, validateAdminAccessRequest, getConfiguredAdminAccessKey } = require('./middleware');
const bcrypt = require('bcryptjs');
const { parseJsonField } = require('./utils/parseJsonField');
const { withAIBillingContext } = require('./aiBillingContext');
const { createResourcePack, deductFromResourcePacks, syncUserBalance } = require('./resourcePackService');
const { getPriceSummary } = require('./aiBillingService');
const { callAIModel, queryAIModel, getTextModels } = require('./aiModelService');
const { mapResponse } = require('./utils/templateRenderer');
const { generationStartService, sendGenerationError } = require('./modules/generation');
const { getRateLimitStats, reloadRateLimitConfigs } = require('./nosyntask/utils/aiRateLimiter');
const { getServerStatus } = require('./index');
const { getSystemErrors, updateSystemErrorStatus, getSystemErrorStats } = require('./systemErrorService');
const { logAdminAction, logAdminLogin, getAdminLogs, getAdminLogActions, getAdminLogTargetTypes } = require('./adminLogService');
const os = require('os');

const router = express.Router();

function stringifyJsonValue(value, { preserveNull = false } = {}) {
  if (value === undefined) return null;
  if (value === null) return preserveNull ? 'null' : null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function serializeModel(model) {
  return {
    ...model,
    price_config: parseJsonField(model.price_config, null),
    headers_template: parseJsonField(model.headers_template, {}),
    body_template: parseJsonField(model.body_template, null),
    default_params: parseJsonField(model.default_params, null),
    response_mapping: parseJsonField(model.response_mapping, {}),
    supported_aspect_ratios: parseJsonField(model.supported_aspect_ratios, []),
    supported_durations: parseJsonField(model.supported_durations, []),
    supported_resolutions: parseJsonField(model.supported_resolutions, []),
    query_headers_template: parseJsonField(model.query_headers_template, null),
    query_body_template: parseJsonField(model.query_body_template, null),
    query_response_mapping: parseJsonField(model.query_response_mapping, null),
    query_success_mapping: parseJsonField(model.query_success_mapping, null),
    query_fail_mapping: parseJsonField(model.query_fail_mapping, null),
    capabilities: parseJsonField(model.capabilities, []),
    priceSummary: getPriceSummary(model.price_config, { modelName: model.name })
  };
}

function runAsAdminTool(req, operationKey, resourceRefs, fn) {
  return withAIBillingContext(
    {
      userId: req.user.id,
      projectId: resourceRefs?.projectId || null,
      sourceType: 'admin_tool',
      operationKey,
      resourceRefs: resourceRefs || {}
    },
    fn
  );
}

router.get('/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await queryOne('SELECT COUNT(*) as count FROM users');
    
    const totalModels = await queryOne('SELECT COUNT(*) as count FROM ai_model_configs');
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRequests = await queryOne(
      'SELECT COUNT(*) as count FROM billing_records WHERE created_at >= ?',
      [todayStart]
    );
    
    const totalScripts = await queryOne('SELECT COUNT(*) as count FROM scripts');
    
    res.json({
      totalUsers: totalUsers?.count || 0,
      totalModels: totalModels?.count || 0,
      todayRequests: todayRequests?.count || 0,
      totalScripts: totalScripts?.count || 0
    });
  } catch (error) {
    console.error('[Admin] Get stats error:', error);
    res.status(500).json({ message: '获取统计数据失败' });
  }
});

// 获取服务器状态信息
// 检查各服务端口健康状态
router.get('/service-ports-status', authMiddleware, requireAdmin, async (_req, res) => {
  const services = [
    {
      name: 'Backend',
      port: process.env.PORT || 4000,
      url: null, // 当前服务，直接返回在线
      description: '主后端服务'
    },
    {
      name: 'Frontend',
      port: parseInt(process.env.HTTP_PORT || '80'),
      url: (process.env.FRONTEND_CHECK_URL || `http://localhost:${process.env.HTTP_PORT || 80}`),
      description: '前端应用'
    },
    {
      name: 'MySQL',
      port: process.env.MYSQL_PORT || 3306,
      url: null, // 通过数据库查询检测
      dbCheck: true,
      description: '关系型数据库'
    },
    {
      name: 'MinIO',
      port: process.env.MINIO_PORT || 9000,
      url: `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`,
      healthPath: '/minio/health/live',
      description: '对象存储服务'
    }
  ];

  const checkService = async (service) => {
    const result = {
      name: service.name,
      port: service.port,
      description: service.description,
      status: 'unknown',
      latency: null,
      error: null
    };

    // 当前服务直接返回在线
    if (!service.url && !service.dbCheck) {
      result.status = 'online';
      result.latency = 0;
      return result;
    }

    // 数据库通过 SELECT 1 检测
    if (service.dbCheck) {
      const dbStart = Date.now();
      try {
        await queryOne('SELECT 1');
        result.latency = Date.now() - dbStart;
        result.status = 'online';
      } catch (dbErr) {
        result.latency = Date.now() - dbStart;
        result.status = 'offline';
        result.error = dbErr.message || '连接失败';
      }
      return result;
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const healthUrl = service.healthPath
        ? `${service.url.replace(/\/+$/, '')}${service.healthPath}`
        : service.url;

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      result.latency = Date.now() - startTime;
      result.status = response.ok ? 'online' : 'degraded';
    } catch (error) {
      result.latency = Date.now() - startTime;
      result.status = 'offline';
      result.error = error.name === 'AbortError' ? '连接超时' : (error.message || '连接失败');
    }

    return result;
  };

  try {
    const results = await Promise.all(services.map(checkService));
    res.json({
      services: results,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin] Get service ports status error:', error);
    res.status(500).json({ message: '检查服务状态失败' });
  }
});

router.get('/server-status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = getServerStatus();
    
    // 获取数据库连接状态
    let dbStatus = { connected: false, error: null };
    try {
      await queryOne('SELECT 1');
      dbStatus.connected = true;
    } catch (dbError) {
      dbStatus.error = dbError.message;
    }
    
    // 获取环境变量配置（隐藏敏感信息）
    const envConfig = {
      MYSQL_HOST: process.env.MYSQL_HOST ? '✓ 已配置' : '✗ 未配置',
      MYSQL_DATABASE: process.env.MYSQL_DATABASE || '未配置',
      JWT_SECRET: process.env.JWT_SECRET ? '✓ 已配置' : '✗ 未配置',
      ADMIN_ACCESS_KEY: process.env.ADMIN_ACCESS_KEY ? '✓ 已配置' : '✗ 未配置',
      MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ? '✓ 已配置' : '✗ 未配置',
      MINIO_BUCKET: process.env.MINIO_BUCKET || '未配置',

    };
    
    res.json({
      server: status,
      database: dbStatus,
      config: envConfig,
    });
  } catch (error) {
    console.error('[Admin] Get server status error:', error);
    res.status(500).json({ message: '获取服务器状态失败' });
  }
});

// ====== 系统资源详细监控 ======
router.get('/system-resources', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    
    // CPU 使用率计算
    let cpuUsage = 0;
    try {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();
      await new Promise(r => setTimeout(r, 100));
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      const usage = process.cpuUsage(startUsage);
      cpuUsage = Number((((usage.user + usage.system) / 1000 / elapsed) * 100).toFixed(1));
    } catch (_) { /* ignore */ }
    
    // 系统整体 CPU 负载
    const loadAvg = os.loadavg();
    
    // 内存信息
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // 数据库连接池统计
    let dbPoolStats = { active: 0, idle: 0, total: 0, waiting: 0 };
    try {
      const { getPoolStats } = require('./db');
      dbPoolStats = getPoolStats();
    } catch (_) { /* ignore */ }
    
    // 获取今日任务统计
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const taskStats = await queryOne(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) as active
      FROM generation_tasks
      WHERE created_at >= ?
    `, [todayStart]);
    
    // 获取实时活跃任务
    const activeTasks = await queryAll(`
      SELECT model_name, COUNT(*) as count
      FROM generation_tasks
      WHERE status IN ('pending', 'running')
      GROUP BY model_name
    `);
    
    // 获取最近24小时的请求趋势（按1小时分组，按模型区分）
    const requestTrendByModel = await queryAll(`
      SELECT 
        DATE_FORMAT(created_at, '%H:00') as time_slot,
        COALESCE(model_name, 'unknown') as model_name,
        COUNT(*) as requests
      FROM billing_records
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY time_slot, model_name
      ORDER BY time_slot ASC, model_name ASC
    `);
    
    // 获取存储使用情况（MinIO桶统计需要额外接口，这里先返回数据库大小）
    let dbSize = { sizeMB: 0 };
    try {
      const sizeResult = await queryOne(`
        SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size_mb
        FROM information_schema.TABLES
        WHERE table_schema = ?
      `, [process.env.MYSQL_DATABASE || 'nanostory']);
      dbSize.sizeMB = sizeResult?.size_mb || 0;
    } catch (_) { /* ignore */ }
    
    res.json({
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        loadAvg: {
          '1m': loadAvg[0]?.toFixed(2),
          '5m': loadAvg[1]?.toFixed(2),
          '15m': loadAvg[2]?.toFixed(2),
        }
      },
      memory: {
        process: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
        system: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          usagePercent: Number(((usedMem / totalMem) * 100).toFixed(1)),
        }
      },
      database: {
        pool: dbPoolStats,
        sizeMB: dbSize.sizeMB,
      },
      tasks: {
        today: {
          total: taskStats?.total || 0,
          completed: taskStats?.completed || 0,
          failed: taskStats?.failed || 0,
          active: taskStats?.active || 0,
        },
        activeByModel: activeTasks,
      },
      requestTrendByModel,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin] Get system resources error:', error);
    res.status(500).json({ message: '获取系统资源失败' });
  }
});

// ====== 历史统计数据（用于趋势图） ======
router.get('/history-stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysInt = Math.min(parseInt(days) || 7, 30);
    
    // 每日任务统计
    const dailyTasks = await queryAll(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(cost) as total_cost
      FROM generation_tasks
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [daysInt]);
    
    // 每日用户活跃统计
    const dailyUsers = await queryAll(`
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT user_id) as active_users
      FROM billing_records
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [daysInt]);
    
    // 每日模型使用分布
    const dailyModels = await queryAll(`
      SELECT 
        DATE(created_at) as date,
        model_name,
        COUNT(*) as calls,
        SUM(cost) as cost
      FROM generation_tasks
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at), model_name
      ORDER BY date ASC, calls DESC
    `, [daysInt]);
    
    // 新用户注册趋势
    const newUsers = await queryAll(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [daysInt]);
    
    // 计算汇总
    const summary = {
      totalTasks: dailyTasks.reduce((sum, d) => sum + d.total, 0),
      totalCompleted: dailyTasks.reduce((sum, d) => sum + d.completed, 0),
      totalFailed: dailyTasks.reduce((sum, d) => sum + d.failed, 0),
      totalCost: dailyTasks.reduce((sum, d) => sum + parseFloat(d.total_cost || 0), 0).toFixed(4),
      avgDailyTasks: dailyTasks.length > 0 
        ? Math.round(dailyTasks.reduce((sum, d) => sum + d.total, 0) / dailyTasks.length) 
        : 0,
      avgDailyUsers: dailyUsers.length > 0
        ? Math.round(dailyUsers.reduce((sum, d) => sum + d.active_users, 0) / dailyUsers.length)
        : 0,
    };
    
    res.json({
      period: `${daysInt}天`,
      summary,
      dailyTasks,
      dailyUsers,
      dailyModels,
      newUsers,
    });
  } catch (error) {
    console.error('[Admin] Get history stats error:', error);
    res.status(500).json({ message: '获取历史统计失败' });
  }
});

// ====== 服务仪表盘 - 直接探测各服务健康状态 ======
router.get('/services', authMiddleware, requireAdmin, async (_req, res) => {
  const probeWithTimeout = async (url, timeoutMs = 3000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const r = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      return { ok: r.ok, latency: Date.now() - start, status: r.status };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, latency: Date.now() - start, error: err.name === 'AbortError' ? '连接超时' : err.message };
    }
  };

  try {
    const serverStatus = getServerStatus();
    const mem = process.memoryUsage();

    // --- 1. Backend（自身） ---
    const backendService = {
      serviceId: 'backend',
      name: 'Backend',
      description: '主后端 API 服务',
      status: 'online',
      latency: 0,
      uptimeSeconds: Math.floor(serverStatus.uptime / 1000),
      metrics: {
        cpuPercent: 0,
        memoryUsage: mem.rss,
        memoryLimit: os.totalmem()
      },
      metadata: {
        nodeVersion: serverStatus.nodeVersion,
        platform: serverStatus.platform,
        port: serverStatus.port,
        env: serverStatus.env
      }
    };
    // 简易 CPU 采样：测量 100ms 内 CPU 占用
    try {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();
      await new Promise(r => setTimeout(r, 100));
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6; // ms
      const usage = process.cpuUsage(startUsage);
      const cpuMs = (usage.user + usage.system) / 1000;
      backendService.metrics.cpuPercent = Number(((cpuMs / elapsed) * 100).toFixed(1));
    } catch (_) { /* ignore */ }

    // --- 2. Frontend（Vite dev server 或 nginx） ---
    const frontendUrl = process.env.FRONTEND_CHECK_URL || `http://localhost:${process.env.HTTP_PORT || 80}`;
    const frontendProbe = await probeWithTimeout(frontendUrl);
    const frontendService = {
      serviceId: 'frontend',
      name: 'Frontend',
      description: '前端应用',
      status: frontendProbe.ok ? 'online' : 'offline',
      latency: frontendProbe.latency,
      error: frontendProbe.error || null,
      metadata: { url: frontendUrl }
    };

    // --- 3. MySQL ---
    let dbService;
    const dbStart = Date.now();
    try {
      await queryOne('SELECT 1');
      dbService = {
        serviceId: 'mysql',
        name: 'MySQL',
        description: '关系型数据库',
        status: 'online',
        latency: Date.now() - dbStart,
        metadata: {
          host: process.env.MYSQL_HOST || 'localhost',
          port: process.env.MYSQL_PORT || '3306',
          database: process.env.MYSQL_DATABASE || 'nanostory'
        }
      };
    } catch (dbErr) {
      dbService = {
        serviceId: 'mysql',
        name: 'MySQL',
        description: '关系型数据库',
        status: 'offline',
        latency: Date.now() - dbStart,
        error: dbErr.message,
        metadata: {
          host: process.env.MYSQL_HOST || 'localhost',
          port: process.env.MYSQL_PORT || '3306',
          database: process.env.MYSQL_DATABASE || 'nanostory'
        }
      };
    }

    // --- 4. MinIO ---
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const minioPort = process.env.MINIO_PORT || '9000';
    const minioUrl = `http://${minioEndpoint}:${minioPort}/minio/health/live`;
    const minioProbe = await probeWithTimeout(minioUrl);
    const minioService = {
      serviceId: 'minio',
      name: 'MinIO',
      description: '对象存储服务',
      status: minioProbe.ok ? 'online' : 'offline',
      latency: minioProbe.latency,
      error: minioProbe.error || null,
      metadata: {
        endpoint: minioEndpoint,
        port: minioPort,
        bucket: process.env.MINIO_BUCKET || 'nanostory'
      }
    };

    res.json({
      services: [backendService, frontendService, dbService, minioService],
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin] Get services error:', error);
    res.status(500).json({ message: '获取服务状态失败' });
  }
});

router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await queryAll(
      'SELECT id, email, role, employee_id, balance, is_active, last_login_ip, last_active_at, created_at, updated_at FROM users ORDER BY id DESC'
    );
    res.json({ users });
  } catch (error) {
    console.error('[Admin] Get users error:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

router.get('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const user = await queryOne(
      'SELECT id, email, role, employee_id, balance, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('[Admin] Get user error:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

router.put('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, role } = req.body;
  const adminId = req.user.userId || req.user.id;

  try {
    const user = await queryOne('SELECT id, email FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const updates = [];
    const values = [];

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (role !== undefined && ['user', 'admin'].includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }
    // balance 不再允许直接修改，必须通过 /users/:id/adjust-points 接口

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 记录操作日志
    await logAdminAction({
      adminId,
      action: 'update',
      targetType: 'user',
      targetId: id,
      targetName: email || user.email,
      details: { email, role },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '用户信息已更新' });
  } catch (error) {
    console.error('[Admin] Update user error:', error);
    res.status(500).json({ message: '更新用户信息失败' });
  }
});

/**
 * POST /api/admin/users/:id/adjust-points - 管理员调整用户积分（增加/减少）
 * 必须填写站内信内容，操作后自动发送站内信通知用户
 */
router.post('/users/:id/adjust-points', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { adjustmentType, amount, message } = req.body; // adjustmentType: 'add' | 'subtract'
  const adminId = req.user.userId || req.user.id;

  // 参数校验
  if (!adjustmentType || !['add', 'subtract'].includes(adjustmentType)) {
    return res.status(400).json({ message: '调整类型必须是 add 或 subtract' });
  }
  if (!amount || amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({ message: '调整积分必须为正整数' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ message: '必须填写站内信内容才能调整积分' });
  }

  try {
    // 获取用户当前余额
    const user = await queryOne('SELECT id, balance, email FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 获取管理员信息（含工号）
    const admin = await queryOne('SELECT id, employee_id, email FROM users WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(403).json({ message: '管理员账号不存在' });
    }

    // 如果管理员还没有工号，自动生成一个
    let employeeId = admin.employee_id;
    if (!employeeId) {
      employeeId = 'ADM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await execute('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, adminId]);
      console.log(`[Admin] 自动生成工号: ${employeeId} (admin ID=${adminId})`);
    }

    const balanceBefore = Math.round(user.balance || 0);
    let balanceAfter;
    let resourcePackId = null;

    if (adjustmentType === 'add') {
      // 增加积分 → 创建资源包
      const pack = await createResourcePack(id, {
        name: '管理员调整积分',
        totalPoints: amount,
        sourceType: 'admin',
        sourceId: adminId,
        isGift: false
      });
      resourcePackId = pack.id;
      balanceAfter = await syncUserBalance(id);
    } else {
      // 减少积分 → 从资源包扣减
      try {
        const result = await deductFromResourcePacks(id, amount);
        balanceAfter = result.balanceAfter;
      } catch (err) {
        if (err.code === 'INSUFFICIENT_POINTS') {
          return res.status(400).json({ message: `用户积分不足（当前 ${err.current}），无法减少 ${amount} 积分` });
        }
        throw err;
      }
    }

    // 生成站内信标题和内容（Markdown 格式）
    const isAdd = adjustmentType === 'add';
    const mailTitle = isAdd ? '积分增加通知' : '积分减少通知';
    const colorTag = isAdd ? 'green' : 'red';
    const symbol = isAdd ? '+' : '-';
    const periodInfo = isAdd ? '（有效期1个月）' : '';
    const mailContent = [
      `**${isAdd ? '🎉 积分增加' : '📝 积分减少'}**`,
      '',
      `| 项目 | 详情 |`,
      `| --- | --- |`,
      `| 变动积分 | <span style="color:${colorTag};font-weight:bold">${symbol}${amount} 积分</span>${periodInfo} |`,
      `| 变动前余额 | ${balanceBefore} 积分 |`,
      `| 变动后余额 | **${balanceAfter} 积分** |`,
      `| 操作人工号 | ${employeeId} |`,
      '',
      '---',
      '',
      message.trim()
    ].join('\n');

    // 发送站内信
    const mailResult = await execute(
      `INSERT INTO internal_mail (sender_type, sender_id, receiver_id, title, content, mail_type)
       VALUES ('admin', ?, ?, ?, ?, 'points_change')`,
      [adminId, id, mailTitle, mailContent]
    );
    const mailId = mailResult?.insertId || null;

    // 记录调整日志
    await execute(
      `INSERT INTO points_adjustment_log (user_id, admin_id, admin_employee_id, adjustment_type, amount, balance_before, balance_after, reason, mail_id, resource_pack_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, adminId, employeeId, adjustmentType, amount, balanceBefore, balanceAfter, message.trim(), mailId, resourcePackId]
    );

    console.log(`[Admin] 积分调整: ${adjustmentType === 'add' ? '+' : '-'}${amount}, 用户ID=${id}, 操作人=${employeeId}`);

    // 记录操作日志
    await logAdminAction({
      adminId,
      action: 'adjust_points',
      targetType: 'user',
      targetId: id,
      targetName: user.email,
      details: { adjustmentType, amount, balanceBefore, balanceAfter, message: message.trim() },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({
      message: '积分调整成功',
      balanceBefore,
      balanceAfter,
      adjustmentType,
      amount,
      employeeId
    });
  } catch (error) {
    console.error('[Admin] Adjust points error:', error);
    res.status(500).json({ message: '积分调整失败' });
  }
});

/**
 * GET /api/admin/me/employee-id - 获取当前管理员工号
 */
router.get('/me/employee-id', authMiddleware, requireAdmin, async (req, res) => {
  const adminId = req.user.userId || req.user.id;
  try {
    const admin = await queryOne('SELECT employee_id, email FROM users WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ message: '管理员不存在' });
    }
    // 如果还没有工号，自动生成
    let employeeId = admin.employee_id;
    if (!employeeId) {
      employeeId = 'ADM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await execute('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, adminId]);
    }
    res.json({ employeeId, email: admin.email });
  } catch (error) {
    console.error('[Admin] Get employee ID error:', error);
    res.status(500).json({ message: '获取工号失败' });
  }
});

// ====== 管理员操作日志 API ======

/**
 * GET /api/admin/logs - 查询操作日志
 */
router.get('/logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const adminId = req.query.adminId || null;
    const action = req.query.action || null;
    const targetType = req.query.targetType || null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    const search = req.query.search || null;

    const result = await getAdminLogs({ page, limit, adminId, action, targetType, startDate, endDate, search });
    res.json(result);
  } catch (error) {
    console.error('[Admin] Get logs error:', error);
    res.status(500).json({ message: '获取操作日志失败' });
  }
});

/**
 * GET /api/admin/logs/actions - 获取所有操作类型（用于筛选）
 */
router.get('/logs/actions', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const actions = await getAdminLogActions();
    res.json({ actions });
  } catch (error) {
    console.error('[Admin] Get log actions error:', error);
    res.status(500).json({ message: '获取操作类型失败' });
  }
});

/**
 * GET /api/admin/logs/target-types - 获取所有目标类型（用于筛选）
 */
router.get('/logs/target-types', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const targetTypes = await getAdminLogTargetTypes();
    res.json({ targetTypes });
  } catch (error) {
    console.error('[Admin] Get log target types error:', error);
    res.status(500).json({ message: '获取目标类型失败' });
  }
});

router.delete('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.userId || req.user.id;

  try {
    if (parseInt(id) === adminId) {
      return res.status(400).json({ message: '不能删除自己的账户' });
    }

    const user = await queryOne('SELECT email FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    await execute('DELETE FROM users WHERE id = ?', [id]);

    // 记录操作日志
    await logAdminAction({
      adminId,
      action: 'delete',
      targetType: 'user',
      targetId: id,
      targetName: user.email,
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '用户已删除' });
  } catch (error) {
    console.error('[Admin] Delete user error:', error);
    res.status(500).json({ message: '删除用户失败' });
  }
});

// 切换用户启用/禁用状态
router.patch('/users/:id/toggle-active', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const adminId = req.user.userId || req.user.id;

  try {
    if (parseInt(id) === adminId) {
      return res.status(400).json({ message: '不能禁用自己的账户' });
    }

    const user = await queryOne('SELECT id, email, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const newStatus = is_active ? 1 : 0;
    await execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);

    // 记录操作日志
    await logAdminAction({
      adminId,
      action: 'toggle',
      targetType: 'user',
      targetId: id,
      targetName: user.email,
      details: { field: 'is_active', from: !is_active, to: is_active },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: newStatus ? '账号已启用' : '账号已禁用', is_active: newStatus });
  } catch (error) {
    console.error('[Admin] Toggle user active error:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  const { email, password, role, balance } = req.body;
  const adminId = req.user.userId || req.user.id;

  if (!email || !password) {
    return res.status(400).json({ message: '邮箱和密码不能为空' });
  }

  try {
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ message: '邮箱已被使用' });
    }

    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await execute(
      'INSERT INTO users (email, password_hash, role, balance) VALUES (?, ?, ?, ?)',
      [email, passwordHash, role || 'user', balance || 100]
    );

    // 记录操作日志
    await logAdminAction({
      adminId,
      action: 'create',
      targetType: 'user',
      targetId: result.insertId,
      targetName: email,
      details: { role: role || 'user', balance: balance || 100 },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '用户创建成功' });
  } catch (error) {
    console.error('[Admin] Create user error:', error);
    res.status(500).json({ message: '创建用户失败' });
  }
});

// ============================================================
// 新架构 API：ai_models_v2 模型目录
// ============================================================

router.get('/ai-models', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // 优先从新表获取，如果不存在则回退到旧表
    const newModels = await queryAll(
      `SELECT m.id, m.name, m.provider_id, m.model_id, m.capabilities,
              m.metadata, m.pricing, m.quality_score, m.is_recommended,
              m.is_active, m.is_discovered, m.adapter_name, m.created_at, m.updated_at,
              p.name as provider, p.display_name as provider_display_name
       FROM ai_models_v2 m
       JOIN model_providers p ON m.provider_id = p.id
       ORDER BY m.is_recommended DESC, m.quality_score DESC, m.id DESC`
    );

    if (newModels && newModels.length > 0) {
      res.json({
        models: newModels.map(m => ({
          ...m,
          capabilities: parseJsonField(m.capabilities, []),
          metadata: parseJsonField(m.metadata, {}),
          pricing: parseJsonField(m.pricing, {}),
          _source: 'v2'
        })),
        version: 'v2'
      });
      return;
    }

    // 回退到旧表
    const models = await queryAll(
      `SELECT id, name, category, provider, description, is_active, api_key,
              provider_id, model_id, capabilities,
              price_config, request_method, url_template, headers_template, 
              body_template, default_params, response_mapping,
              supported_aspect_ratios, supported_durations, supported_resolutions,
              query_url_template, query_method, query_headers_template, 
              query_body_template, query_response_mapping,
              query_success_condition, query_fail_condition,
              query_success_mapping, query_fail_mapping,
              custom_handler, custom_query_handler,
              billing_handler, billing_query_handler,
              created_at, updated_at 
       FROM ai_model_configs ORDER BY id DESC`
    );
    res.json({ models: models.map(serializeModel), version: 'v1' });
  } catch (error) {
    console.error('[Admin] Get AI models error:', error);
    res.status(500).json({ message: '获取模型列表失败' });
  }
});

router.get('/ai-models/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const model = await queryOne(
      `SELECT * FROM ai_model_configs WHERE id = ?`,
      [id]
    );

    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    res.json({ model: serializeModel(model) });
  } catch (error) {
    console.error('[Admin] Get AI model error:', error);
    res.status(500).json({ message: '获取模型信息失败' });
  }
});

// 新架构 API：创建模型（v2）
router.post('/ai-models-v2', authMiddleware, requireAdmin, async (req, res) => {
  const {
    name, provider_id, model_id, capabilities,
    metadata, pricing, quality_score, is_recommended, is_active, adapter_name
  } = req.body;

  if (!name || !provider_id || !model_id) {
    return res.status(400).json({ message: '必填字段：name, provider_id, model_id' });
  }

  try {
    const result = await execute(
      `INSERT INTO ai_models_v2 (
        name, provider_id, model_id, capabilities,
        metadata, pricing, quality_score, is_recommended, is_active, adapter_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, provider_id, model_id, stringifyJsonValue(capabilities || []),
        stringifyJsonValue(metadata || {}), stringifyJsonValue(pricing || {}),
        quality_score || 0, is_recommended ?? 0, is_active ?? 1, adapter_name || 'openai_compatible'
      ]
    );

    res.json({ message: '模型创建成功', id: result.insertId });
  } catch (error) {
    console.error('[Admin] Create AI model v2 error:', error);
    res.status(500).json({ message: '创建模型失败' });
  }
});

router.post('/ai-models', authMiddleware, requireAdmin, async (req, res) => {
  const {
    name, category, provider, description, is_active, api_key,
    provider_id, model_id, capabilities,
    price_config, request_method, url_template, headers_template,
    body_template, default_params, response_mapping,
    supported_aspect_ratios, supported_durations, supported_resolutions,
    query_url_template, query_method, query_headers_template,
    query_body_template, query_response_mapping,
    query_success_condition, query_fail_condition,
    query_success_mapping, query_fail_mapping,
    custom_handler, custom_query_handler,
    billing_handler, billing_query_handler
  } = req.body;

  // OpenAI 适配层模式：只要有 provider_id + model_id 即可
  const isOpenAIMode = provider_id && model_id;
  if (!name || !category || !provider || (!isOpenAIMode && (!url_template || !headers_template || !response_mapping))) {
    return res.status(400).json({ message: '必填字段不能为空（OpenAI 适配层模式需填写 provider_id 和 model_id）' });
  }

  try {
    await execute(
      `INSERT INTO ai_model_configs (
        name, category, provider, description, is_active, api_key,
        provider_id, model_id, capabilities,
        price_config, request_method, url_template, headers_template,
        body_template, default_params, response_mapping,
        supported_aspect_ratios, supported_durations, supported_resolutions,
        query_url_template, query_method, query_headers_template,
        query_body_template, query_response_mapping,
        query_success_condition, query_fail_condition,
        query_success_mapping, query_fail_mapping,
        custom_handler, custom_query_handler,
        billing_handler, billing_query_handler
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, category, provider, description, is_active ?? 1, api_key,
        provider_id || null, model_id || null, stringifyJsonValue(capabilities || []),
        stringifyJsonValue(price_config, { preserveNull: true }), request_method || 'POST', url_template || null,
        stringifyJsonValue(headers_template), stringifyJsonValue(body_template),
        stringifyJsonValue(default_params), stringifyJsonValue(response_mapping),
        stringifyJsonValue(supported_aspect_ratios || []),
        stringifyJsonValue(supported_durations || []),
        stringifyJsonValue(supported_resolutions || []),
        query_url_template || null, query_method || 'GET',
        stringifyJsonValue(query_headers_template),
        stringifyJsonValue(query_body_template),
        stringifyJsonValue(query_response_mapping),
        query_success_condition || null, query_fail_condition || null,
        stringifyJsonValue(query_success_mapping),
        stringifyJsonValue(query_fail_mapping),
        custom_handler || null, custom_query_handler || null,
        billing_handler || null, billing_query_handler || null
      ]
    );

    // 记录操作日志
    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'create',
      targetType: 'ai_model',
      targetName: name,
      details: { category, provider, provider_id, model_id, capabilities },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '模型创建成功' });
  } catch (error) {
    console.error('[Admin] Create AI model error:', error);
    res.status(500).json({ message: '创建模型失败' });
  }
});

// 新架构 API：更新模型（v2）
router.put('/ai-models-v2/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, provider_id, model_id, capabilities,
    metadata, pricing, quality_score, is_recommended, is_active, adapter_name
  } = req.body;

  try {
    const model = await queryOne('SELECT id FROM ai_models_v2 WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    await execute(
      `UPDATE ai_models_v2 SET
        name = ?, provider_id = ?, model_id = ?, capabilities = ?,
        metadata = ?, pricing = ?, quality_score = ?, is_recommended = ?,
        is_active = ?, adapter_name = ?
      WHERE id = ?`,
      [
        name, provider_id, model_id, stringifyJsonValue(capabilities || []),
        stringifyJsonValue(metadata || {}), stringifyJsonValue(pricing || {}),
        quality_score, is_recommended, is_active, adapter_name, id
      ]
    );

    res.json({ message: '模型更新成功' });
  } catch (error) {
    console.error('[Admin] Update AI model v2 error:', error);
    res.status(500).json({ message: '更新模型失败' });
  }
});

router.delete('/ai-models-v2/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await execute('DELETE FROM ai_models_v2 WHERE id = ?', [id]);
    res.json({ message: '模型删除成功' });
  } catch (error) {
    console.error('[Admin] Delete AI model v2 error:', error);
    res.status(500).json({ message: '删除模型失败' });
  }
});

router.put('/ai-models/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, category, provider, description, is_active, api_key,
    provider_id, model_id, capabilities,
    price_config, request_method, url_template, headers_template,
    body_template, default_params, response_mapping,
    supported_aspect_ratios, supported_durations, supported_resolutions,
    query_url_template, query_method, query_headers_template,
    query_body_template, query_response_mapping,
    query_success_condition, query_fail_condition,
    query_success_mapping, query_fail_mapping,
    custom_handler, custom_query_handler,
    billing_handler, billing_query_handler
  } = req.body;

  try {
    const model = await queryOne('SELECT id FROM ai_model_configs WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    await execute(
      `UPDATE ai_model_configs SET
        name = ?, category = ?, provider = ?, description = ?, is_active = ?, api_key = ?,
        provider_id = ?, model_id = ?, capabilities = ?,
        price_config = ?, request_method = ?, url_template = ?, headers_template = ?,
        body_template = ?, default_params = ?, response_mapping = ?,
        supported_aspect_ratios = ?, supported_durations = ?, supported_resolutions = ?,
        query_url_template = ?, query_method = ?, query_headers_template = ?,
        query_body_template = ?, query_response_mapping = ?,
        query_success_condition = ?, query_fail_condition = ?,
        query_success_mapping = ?, query_fail_mapping = ?,
        custom_handler = ?, custom_query_handler = ?,
        billing_handler = ?, billing_query_handler = ?
      WHERE id = ?`,
      [
        name, category, provider, description, is_active, api_key,
        provider_id || null, model_id || null, stringifyJsonValue(capabilities || []),
        stringifyJsonValue(price_config, { preserveNull: true }), request_method, url_template,
        stringifyJsonValue(headers_template), stringifyJsonValue(body_template),
        stringifyJsonValue(default_params), stringifyJsonValue(response_mapping),
        stringifyJsonValue(supported_aspect_ratios || []),
        stringifyJsonValue(supported_durations || []),
        stringifyJsonValue(supported_resolutions || []),
        query_url_template, query_method,
        stringifyJsonValue(query_headers_template),
        stringifyJsonValue(query_body_template),
        stringifyJsonValue(query_response_mapping),
        query_success_condition || null, query_fail_condition || null,
        stringifyJsonValue(query_success_mapping),
        stringifyJsonValue(query_fail_mapping),
        custom_handler || null, custom_query_handler || null,
        billing_handler || null, billing_query_handler || null,
        id
      ]
    );

    // 记录操作日志
    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'update',
      targetType: 'ai_model',
      targetId: id,
      targetName: name,
      details: { category, provider, is_active, provider_id, model_id, capabilities },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '模型更新成功' });
  } catch (error) {
    console.error('[Admin] Update AI model error:', error);
    res.status(500).json({ message: '更新模型失败' });
  }
});

router.delete('/ai-models/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const model = await queryOne('SELECT id, name FROM ai_model_configs WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    await execute('DELETE FROM ai_model_configs WHERE id = ?', [id]);

    // 记录操作日志
    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'delete',
      targetType: 'ai_model',
      targetId: id,
      targetName: model.name,
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '模型已删除' });
  } catch (error) {
    console.error('[Admin] Delete AI model error:', error);
    res.status(500).json({ message: '删除模型失败' });
  }
});

router.post('/ai-models/smart-parse', authMiddleware, requireAdmin, async (req, res) => {
  const { apiDoc, textModel, customPrompt } = req.body;

  if (!apiDoc || !textModel) {
    return res.status(400).json({ message: 'API文档和模型名称不能为空' });
  }

  try {
    const userId = req.user.id;

    const result = await generationStartService.start({
      operationKey: 'smart_parse_generate',
      rawInput: { apiDoc, textModel, customPrompt },
      actor: { userId }
    });

    res.json(result.response || {
      jobId: result.jobId,
      tasks: result.tasks,
      message: '解析任务已启动'
    });
  } catch (error) {
    sendGenerationError(res, error, '智能解析失败', '[Admin] Smart parse error:');
  }
});

/**
 * 火山引擎模型分类映射
 * 根据模型ID前缀判断模型类型
 */
function classifyVolcengineModel(modelId) {
  const id = modelId.toLowerCase();
  // 图像生成模型
  if (id.includes('seedream')) {
    return 'IMAGE';
  }
  // 视频生成模型
  if (id.includes('seedance')) {
    return 'VIDEO';
  }
  // 声音/语音生成模型
  if (id.includes('seedtts') || id.includes('speech') || id.includes('voice')) {
    return 'AUDIO';
  }
  // 多模态模型
  if (id.includes('vision') || id.includes('vl') || id.includes('multimodal')) {
    return 'MULTIMODAL';
  }
  // 文本模型（默认）
  return 'TEXT';
}

/**
 * 通用 OpenAI 兼容模型列表获取
 * 支持 /v1/models 标准接口的平台
 */
async function discoverOpenAIModels(provider, category, classifyFn) {
  const baseUrl = (provider.base_url || '').replace(/\/$/, '');
  const apiKey = provider.api_key;

  if (!apiKey) {
    throw new Error(`${provider.display_name || provider.name} 平台未配置 API Key`);
  }

  const url = `${baseUrl}/v1/models`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`${provider.name} API 请求失败: ${response.status} ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const models = data.data || [];

  // 过滤并分类模型
  const result = models.map(m => {
    const modelId = m.id || '';
    const modelCategory = classifyFn ? classifyFn(modelId) : 'TEXT';
    return {
      name: m.id || '未知模型',
      model_id: m.id || '',
      description: `${m.id} ${provider.display_name || provider.name}模型`,
      category: modelCategory,
      input_price_per_million: 0,
      output_price_per_million: 0
    };
  }).filter(m => m.category === category);

  return result;
}

/**
 * 火山引擎模型分类映射
 */
function classifyVolcengineModel(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('seedream')) return 'IMAGE';
  if (id.includes('seedance')) return 'VIDEO';
  if (id.includes('seedtts') || id.includes('speech') || id.includes('voice')) return 'AUDIO';
  if (id.includes('vision') || id.includes('vl')) return 'MULTIMODAL';
  if (id.includes('3d')) return '3D';
  return 'TEXT';
}

/**
 * 百度千帆模型分类映射
 */
function classifyBaiduModel(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('image') || id.includes('绘图') || id.includes('绘画')) return 'IMAGE';
  if (id.includes('video')) return 'VIDEO';
  if (id.includes('audio') || id.includes('语音') || id.includes('tts')) return 'AUDIO';
  if (id.includes('vision') || id.includes('vl') || id.includes('多模态')) return 'MULTIMODAL';
  // 百度文心系列默认文本
  if (id.startsWith('ernie')) return 'TEXT';
  return 'TEXT';
}

/**
 * 通用模型分类（OpenAI / DeepSeek / 智谱等）
 */
function classifyGenericModel(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('dall') || id.includes('image') || id.includes('gpt-4o-image')) return 'IMAGE';
  if (id.includes('sora') || id.includes('video') || id.includes('seedance')) return 'VIDEO';
  if (id.includes('whisper') || id.includes('audio') || id.includes('tts')) return 'AUDIO';
  if (id.includes('vision') || id.includes('vl') || id.includes(' multimodal')) return 'MULTIMODAL';
  return 'TEXT';
}

/**
 * 从火山引擎方舟获取模型列表
 */
async function discoverVolcengineModels(provider, category) {
  return discoverOpenAIModels(provider, category, classifyVolcengineModel);
}

/**
 * 从百度千帆获取模型列表
 */
async function discoverBaiduModels(provider, category) {
  // 百度千帆使用 /v2/models 接口，但格式与 OpenAI 兼容
  const baseUrl = (provider.base_url || 'https://qianfan.baidubce.com').replace(/\/$/, '');
  const apiKey = provider.api_key;

  if (!apiKey) {
    throw new Error('百度千帆平台未配置 API Key');
  }

  const url = `${baseUrl}/v2/models`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`百度千帆 API 请求失败: ${response.status} ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const models = data.data || [];

  const result = models.map(m => {
    const modelId = m.id || '';
    const modelCategory = classifyBaiduModel(modelId);
    return {
      name: m.id || '未知模型',
      model_id: m.id || '',
      description: `${m.id} 百度千帆模型`,
      category: modelCategory,
      input_price_per_million: 0,
      output_price_per_million: 0
    };
  }).filter(m => m.category === category);

  return result;
}

/**
 * 通过 DeepSeek AI 发现模型（通用 fallback）
 * 对阿里云启用联网搜索获取最新模型信息
 */
async function discoverModelsByAI(provider, category) {
  const categoryMap = {
    TEXT: '文本生成/对话',
    IMAGE: '图像生成',
    VIDEO: '视频生成',
    AUDIO: '音频模型',
    MULTIMODAL: '多模态理解',
    '3D': '3D 生成',
  };

  const providerName = (provider.display_name || provider.name).toLowerCase();
  const isAliyun = providerName.includes('aliyun') || providerName.includes('阿里云') || providerName.includes('dashscope') || providerName.includes('百炼');

  // 阿里云启用联网搜索，获取最新模型列表
  const searchHint = isAliyun
    ? `\n\n重要：请使用联网搜索功能查询阿里云百炼平台官方文档获取最新、最准确的模型信息。确保 model_id 是官方当前可用的准确值。`
    : '';

  const prompt = `请查询 ${provider.display_name || provider.name} 平台当前所有可用的 ${categoryMap[category] || category} 类型模型。

要求：
1. 返回严格合法的 JSON 数组格式，不要包含任何 markdown 代码块标记
2. 每个模型对象包含以下字段：
   - name: 模型显示名称（中文或英文）
   - model_id: 平台官方模型ID（用于API调用）
   - description: 模型能力描述（50字以内）
   - category: 必须是 "${category}"
   - input_price_per_million: 输入价格，单位元/百万tokens（数字，不知道填0）
   - output_price_per_million: 输出价格，单位元/百万tokens（数字，不知道填0）
3. 尽量返回完整的模型列表，不要遗漏主流模型
4. model_id 必须是平台官方实际使用的值，不能编造${searchHint}

示例输出格式：
[
  {
    "name": "DeepSeek-V3",
    "model_id": "deepseek-chat",
    "description": "128K上下文，高性价比文本生成",
    "category": "TEXT",
    "input_price_per_million": 2,
    "output_price_per_million": 8
  }
]

如果该平台没有此类模型，返回空数组 []。`;

  const response = await callAIModel('Doubao-pro-256k', {
    prompt,
    max_tokens: 4096,
    temperature: 0.3
  });

  const content = response?.content || '';

  let models = [];
  const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (jsonMatch) {
    models = JSON.parse(jsonMatch[0]);
  } else {
    models = JSON.parse(content);
  }

  return models.filter(m => m.category === category);
}

/**
 * 智能发现模型
 * POST /api/admin/ai-models/discover
 * Body: { providerId: number, category: string }
 */
router.post('/ai-models/discover', authMiddleware, requireAdmin, async (req, res) => {
  const { providerId, category } = req.body;

  if (!providerId || !category) {
    return res.status(400).json({ message: '平台ID和模型分类不能为空' });
  }

  try {
    // 查询平台信息
    const provider = await queryOne(
      'SELECT id, name, display_name, base_url, api_key FROM model_providers WHERE id = ? AND is_active = 1',
      [providerId]
    );

    if (!provider) {
      return res.status(404).json({ message: '平台不存在或未启用' });
    }

    let models = [];
    const providerName = (provider.name || '').toLowerCase();

    // 平台适配器映射
    const officialAdapters = {
      'volcengine': discoverVolcengineModels,
      '火山引擎': discoverVolcengineModels,
      'openai': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'azure': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'azure_openai': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'deepseek': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'zhipu': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      '智谱': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'glm': (p, c) => discoverOpenAIModels(p, c, classifyGenericModel),
      'baidu': discoverBaiduModels,
      '百度': discoverBaiduModels,
      'qianfan': discoverBaiduModels,
    };

    const adapter = officialAdapters[providerName];

    if (adapter) {
      // 使用官方 API 获取模型列表
      try {
        models = await adapter(provider, category);
        console.log(`[Admin] ${provider.name} 官方 API 发现 ${models.length} 个 ${category} 模型`);
      } catch (apiErr) {
        console.warn(`[Admin] ${provider.name} 官方 API 发现失败，降级到 AI 发现:`, apiErr.message);
        // fallback 到 AI 发现
        models = await runAsAdminTool(req, 'model_discover', null, async () => {
          return await discoverModelsByAI(provider, category);
        });
      }
    } else {
      // 其他平台使用 DeepSeek AI 发现
      models = await runAsAdminTool(req, 'model_discover', null, async () => {
        return await discoverModelsByAI(provider, category);
      });
    }

    // 补充平台信息
    models = models.map(m => ({
      ...m,
      provider_id: provider.id,
      provider_name: provider.name
    }));

    res.json({
      success: true,
      provider: { id: provider.id, name: provider.name, display_name: provider.display_name },
      models
    });
  } catch (error) {
    console.error('[Admin] Discover models error:', error);
    res.status(500).json({ message: '发现模型失败: ' + (error.message || '未知错误') });
  }
});

/**
 * 批量创建模型
 * POST /api/admin/ai-models/batch
 * Body: { models: [{ name, category, provider, provider_id, model_id, description, price_config? }] }
 */
router.post('/ai-models/batch', authMiddleware, requireAdmin, async (req, res) => {
  const { models } = req.body;

  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ message: '模型列表不能为空' });
  }

  const results = [];
  const errors = [];
  const adminId = req.user.userId || req.user.id;

  for (const model of models) {
    const {
      name, category, provider, description,
      provider_id, model_id,
      input_price_per_million, output_price_per_million
    } = model;

    if (!name || !category || !provider || !provider_id || !model_id) {
      errors.push({ name: name || '(未命名)', error: '缺少必填字段' });
      continue;
    }

    try {
      // 构建默认价格配置
      let priceConfig = null;
      if (typeof input_price_per_million === 'number' || typeof output_price_per_million === 'number') {
        const components = [];
        if (typeof input_price_per_million === 'number' && input_price_per_million > 0) {
          components.push({ type: 'input_tokens', unit: 'per_million_tokens', price: input_price_per_million });
        }
        if (typeof output_price_per_million === 'number' && output_price_per_million > 0) {
          components.push({ type: 'output_tokens', unit: 'per_million_tokens', price: output_price_per_million });
        }
        if (components.length === 0) {
          components.push({ type: 'total_tokens', unit: 'per_million_tokens', price: 2 });
        }
        priceConfig = JSON.stringify({
          currency: 'CNY',
          charge_on_failure: false,
          components
        });
      }

      await execute(
        `INSERT INTO ai_model_configs (
          name, category, provider, description, is_active,
          provider_id, model_id, capabilities,
          price_config, request_method, url_template, headers_template,
          body_template, default_params, response_mapping,
          supported_aspect_ratios, supported_durations, supported_resolutions,
          query_url_template, query_method, query_headers_template,
          query_body_template, query_response_mapping,
          query_success_condition, query_fail_condition,
          query_success_mapping, query_fail_mapping,
          custom_handler, custom_query_handler,
          billing_handler, billing_query_handler
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, category, provider, description || '', 1,
          provider_id, model_id, '[]',
          priceConfig, 'POST', null,
          '{}', '{}', '{}', '{}',
          '[]', '[]', '[]',
          null, 'GET',
          '{}',
          '{}',
          '{}', null, null,
          '{}',
          '{}',
          null, null,
          null, null
        ]
      );

      results.push(name);

      // 记录操作日志
      await logAdminAction({
        adminId,
        action: 'create',
        targetType: 'ai_model',
        targetName: name,
        details: { category, provider, provider_id, model_id, source: 'batch_discover' },
        ipAddress: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers?.['user-agent'] || ''
      });
    } catch (error) {
      console.error(`[Admin] Batch create model "${name}" error:`, error);
      errors.push({ name: name || '(未命名)', error: error.message || '创建失败' });
    }
  }

  res.json({
    success: true,
    created: results.length,
    createdModels: results,
    errors
  });
});

// ====== 模型平台管理 API ======

/**
 * 获取所有模型平台
 * GET /api/admin/model-providers
 */
router.get('/model-providers', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const providers = await queryAll(
      'SELECT id, name, display_name, base_url, api_key, headers_template, is_active, created_at, updated_at FROM model_providers ORDER BY id ASC'
    );
    res.json({
      providers: providers.map(p => ({
        ...p,
        headers_template: parseJsonField(p.headers_template, {})
      }))
    });
  } catch (error) {
    console.error('[Admin] Get model providers error:', error);
    res.status(500).json({ message: '获取模型平台列表失败' });
  }
});

/**
 * 获取单个模型平台
 * GET /api/admin/model-providers/:id
 */
router.get('/model-providers/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const provider = await queryOne(
      'SELECT * FROM model_providers WHERE id = ?',
      [req.params.id]
    );
    if (!provider) {
      return res.status(404).json({ message: '平台不存在' });
    }
    res.json({
      provider: {
        ...provider,
        headers_template: parseJsonField(provider.headers_template, {})
      }
    });
  } catch (error) {
    console.error('[Admin] Get model provider error:', error);
    res.status(500).json({ message: '获取平台信息失败' });
  }
});

/**
 * 创建模型平台
 * POST /api/admin/model-providers
 */
router.post('/model-providers', authMiddleware, requireAdmin, async (req, res) => {
  const { name, display_name, base_url, api_key, headers_template, is_active } = req.body;

  if (!name || !display_name || !base_url) {
    return res.status(400).json({ message: '名称、显示名称和 Base URL 不能为空' });
  }

  try {
    const existing = await queryOne('SELECT id FROM model_providers WHERE name = ?', [name]);
    if (existing) {
      return res.status(409).json({ message: '平台标识已存在' });
    }

    await execute(
      'INSERT INTO model_providers (name, display_name, base_url, api_key, headers_template, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, display_name, base_url, api_key || null, stringifyJsonValue(headers_template), is_active ?? 1]
    );

    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'create',
      targetType: 'model_provider',
      targetName: name,
      details: { display_name, base_url },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '平台创建成功' });
  } catch (error) {
    console.error('[Admin] Create model provider error:', error);
    res.status(500).json({ message: '创建平台失败' });
  }
});

/**
 * 更新模型平台
 * PUT /api/admin/model-providers/:id
 */
router.put('/model-providers/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, display_name, base_url, api_key, headers_template, is_active } = req.body;

  try {
    const provider = await queryOne('SELECT id FROM model_providers WHERE id = ?', [id]);
    if (!provider) {
      return res.status(404).json({ message: '平台不存在' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name); }
    if (base_url !== undefined) { updates.push('base_url = ?'); values.push(base_url); }
    if (api_key !== undefined) { updates.push('api_key = ?'); values.push(api_key); }
    if (headers_template !== undefined) { updates.push('headers_template = ?'); values.push(stringifyJsonValue(headers_template)); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE model_providers SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'update',
      targetType: 'model_provider',
      targetId: id,
      targetName: name,
      details: { display_name, base_url, is_active },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '平台更新成功' });
  } catch (error) {
    console.error('[Admin] Update model provider error:', error);
    res.status(500).json({ message: '更新平台失败' });
  }
});

/**
 * 删除模型平台
 * DELETE /api/admin/model-providers/:id
 */
router.delete('/model-providers/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const provider = await queryOne('SELECT id, name FROM model_providers WHERE id = ?', [id]);
    if (!provider) {
      return res.status(404).json({ message: '平台不存在' });
    }

    // 检查是否有模型使用此平台
    const usedBy = await queryOne('SELECT COUNT(*) as count FROM ai_model_configs WHERE provider_id = ?', [id]);
    if (usedBy?.count > 0) {
      return res.status(400).json({ message: `该平台已被 ${usedBy.count} 个模型使用，无法删除` });
    }

    await execute('DELETE FROM model_providers WHERE id = ?', [id]);

    const adminId = req.user.userId || req.user.id;
    await logAdminAction({
      adminId,
      action: 'delete',
      targetType: 'model_provider',
      targetId: id,
      targetName: provider.name,
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '平台已删除' });
  } catch (error) {
    console.error('[Admin] Delete model provider error:', error);
    res.status(500).json({ message: '删除平台失败' });
  }
});

router.get('/text-models', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const models = await getTextModels();
    res.json({ models });
  } catch (error) {
    console.error('[Admin] Get text models error:', error);
    res.status(500).json({ message: '获取文本模型列表失败' });
  }
});

/**
 * 模型调试 - 发送测试请求
 * Text 模型：直接返回结果
 * Image/Video/Audio 模型：返回提交结果（含 taskId 等）
 */
router.post('/ai-models/:id/test', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { params } = req.body; // 用户自定义的调用参数

  try {
    const model = await queryOne('SELECT * FROM ai_model_configs WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    const startTime = Date.now();
    const result = await runAsAdminTool(
      req,
      'admin_model_test',
      {},
      () => callAIModel(model.name, params || {})
    );
    const elapsed = Date.now() - startTime;

    res.json({
      success: true,
      category: model.category,
      elapsed,
      result,
      hasQueryConfig: !!(model.query_url_template)
    });
  } catch (error) {
    console.error('[Admin] Test model error:', error);
    res.status(error.status || 500).json({ 
      success: false, 
      message: error.message || '调用失败',
      error: error.message
    });
  }
});

/**
 * 模型调试 - 查询异步任务状态（Image/Video 等需要轮询的模型）
 * 前端传入 submitResult：提交接口经 response_mapping 映射后的字段
 * 这些字段自动作为查询模板的占位符参数
 */
router.post('/ai-models/:id/query', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { submitResult } = req.body;

  if (!submitResult || typeof submitResult !== 'object') {
    return res.status(400).json({ message: '缺少 submitResult（提交接口的映射结果）' });
  }

  try {
    const model = await queryOne('SELECT name FROM ai_model_configs WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }

    // 剥离 _raw/_model，剩余映射字段作为查询参数
    const { _raw, _model, ...mappedFields } = submitResult;
    const result = await runAsAdminTool(
      req,
      'admin_model_query',
      {},
      () => queryAIModel(model.name, mappedFields)
    );

    res.json({
      success: true,
      result,
      raw: result._raw || result
    });
  } catch (error) {
    console.error('[Admin] Query model error:', error);
    res.status(error.status || 500).json({ 
      success: false, 
      message: error.message || '查询失败' 
    });
  }
});

/**
 * 模型调试 - 使用 base handler 直接测试（含完整 submit+poll 流程）
 * TEXT  → baseTextModelCall
 * IMAGE → imageGeneration
 * VIDEO → baseVideoModelCall
 * 
 * 请求会阻塞直到 handler 完成（图片/视频可能需要数分钟）
 */
router.post('/ai-models/:id/test-handler', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { params } = req.body;

  try {
    // 优先查 V2 表（避免 V1/V2 ID 冲突，如 id=10 在旧表是图片模型、在 V2 表是视频模型）
    let model = null;
    const v2Model = await queryOne(
      `SELECT m.id, m.name, m.capabilities 
       FROM ai_models_v2 m WHERE m.id = ?`,
      [id]
    );
    if (v2Model) {
      const caps = parseJsonField(v2Model.capabilities, []);
      const category = caps.includes('video_gen') ? 'VIDEO'
        : caps.includes('image_gen') ? 'IMAGE'
        : caps.includes('audio_gen') ? 'AUDIO'
        : caps.includes('vision') ? 'MULTIMODAL'
        : 'TEXT';
      model = { id: v2Model.id, name: v2Model.name, category };
    }

    // V2 表没有时，再回退到旧表
    if (!model) {
      model = await queryOne('SELECT id, name, category FROM ai_model_configs WHERE id = ?', [id]);
    }
    
    if (!model) {
      return res.status(404).json({ success: false, message: '模型不存在' });
    }

    const startTime = Date.now();
    const result = await runAsAdminTool(req, 'admin_model_test_handler', {}, async () => {
      switch (model.category) {
        case 'TEXT': {
          const handleBaseTextModelCall = require('./nosyntask/tasks/base/baseTextModelCall');
          return handleBaseTextModelCall({
            prompt: params?.prompt || '你好，请简单介绍一下自己。',
            textModel: model.name,
            maxTokens: params?.maxTokens || 8192,
            temperature: params?.temperature || 0.7
          });
        }
        case 'IMAGE': {
          const handleImageGeneration = require('./nosyntask/tasks/base/imageGeneration');
          // Seedream 版本区分
          const isSeedream45 = /seedream[-_]?(4[-_]?5|4\.5)/i.test(model.name);
          const isSeedream50 = /seedream[-_]?(5[-_]?0|5\.0)/i.test(model.name);
          
          const imageParams = {
            prompt: params?.prompt || 'A cute cat sitting on a windowsill, watercolor style',
            imageModel: model.name,
            imageUrl: params?.imageUrl || undefined,
            imageUrls: params?.imageUrls || undefined
          };
          
          // 前端直接传 size 参数时优先使用
          if (params?.size) {
            imageParams.size = params.size;
          } else if (isSeedream50) {
            // Seedream 5.0 系列使用 '2k' 预设
            imageParams.size = '2k';
          } else if (isSeedream45) {
            // Seedream 4.5 使用大尺寸
            imageParams.width = params?.width || 1920;
            imageParams.height = params?.height || 1920;
          } else {
            // 其他模型使用默认尺寸
            imageParams.width = params?.width || 1024;
            imageParams.height = params?.height || 1024;
          }
          
          return handleImageGeneration(imageParams);
        }
        case 'VIDEO': {
          const handleBaseVideoModelCall = require('./nosyntask/tasks/base/baseVideoModelCall');
          return handleBaseVideoModelCall({
            prompt: params?.prompt || 'A cat walking slowly',
            videoModel: model.name,
            duration: params?.duration || 5,
            imageUrl: params?.imageUrl || undefined,
            imageUrls: params?.imageUrls || undefined,
            aspectRatio: params?.aspectRatio || undefined
          });
        }
        case 'MULTIMODAL': {
          // 获取完整模型配置（含 provider_id, model_id 等）
          const fullModel = await queryOne('SELECT * FROM ai_model_configs WHERE id = ?', [id]);
          if (!fullModel) {
            throw new Error('模型配置不存在');
          }

          // OpenAI 适配层模式：使用 callAIModel 统一调用
          if (fullModel.provider_id && fullModel.model_id) {
            const { callAIModel } = require('./aiModelService');
            const callParams = {
              prompt: params?.prompt || '请描述这张图片的内容',
              temperature: params?.temperature ?? 0.7,
              max_tokens: params?.max_output_tokens ?? params?.max_tokens ?? 4096
            };
            // 如果有图片URL，作为多模态输入
            if (params?.imageUrl || params?.imageUrls) {
              callParams.imageUrl = params?.imageUrl;
              callParams.imageUrls = params?.imageUrls;
            }
            return await callAIModel(fullModel.name, callParams);
          }

          // 传统模式：使用 custom handler
          const handler = require('./customHandlers/doubao_multimodal');
          const rawResult = await handler.call(fullModel, {
            text: params?.prompt || '请描述这张图片的内容',
            temperature: params?.temperature ?? 0.7,
            max_output_tokens: params?.max_output_tokens ?? params?.max_tokens ?? 4096
          }, {});
          // 执行 response_mapping，提取 content / usage 等标准字段
          let mapping = {};
          try {
            mapping = fullModel.response_mapping ? JSON.parse(fullModel.response_mapping) : {};
          } catch { /* ignore */ }
          const mapped = mapping && Object.keys(mapping).length > 0
            ? mapResponse(rawResult, mapping)
            : {};
          return {
            ...mapped,
            _raw: rawResult,
            _model: { name: fullModel.name, provider: fullModel.provider, category: fullModel.category }
          };
        }
        default:
          throw new Error(`不支持的模型类别: ${model.category}`);
      }
    });

    const elapsed = Date.now() - startTime;
    res.json({
      success: true,
      category: model.category,
      elapsed,
      result
    });
  } catch (error) {
    console.error('[Admin] Test handler error:', error);
    // 如果错误是 API Key 未配置，返回 400 而非 500，并给出友好提示
    const isConfigError = error.message && (
      error.message.includes('API Key 未配置') ||
      error.message.includes('未配置')
    );
    res.status(isConfigError ? 400 : (error.status || 500)).json({
      success: false,
      message: error.message || '测试失败',
      error: error.message,
      code: isConfigError ? 'API_KEY_MISSING' : undefined
    });
  }
});

// ========================================
// 限流配置管理 API
// ========================================

/**
 * 获取所有限流配置
 * GET /api/admin/rate-limit-configs
 */
router.get('/rate-limit-configs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const configs = await queryAll(
      'SELECT * FROM rate_limit_configs ORDER BY role'
    );
    res.json({ configs });
  } catch (error) {
    console.error('[Admin] Get rate limit configs error:', error);
    res.status(500).json({ message: '获取限流配置失败' });
  }
});

/**
 * 获取限流统计信息
 * GET /api/admin/rate-limit-stats
 */
router.get('/rate-limit-stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const stats = getRateLimitStats();
    res.json(stats);
  } catch (error) {
    console.error('[Admin] Get rate limit stats error:', error);
    res.status(500).json({ message: '获取限流统计失败' });
  }
});

/**
 * 创建限流配置
 * POST /api/admin/rate-limit-configs
 */
router.post('/rate-limit-configs', authMiddleware, requireAdmin, async (req, res) => {
  const {
    role, max_concurrent_text, max_concurrent_image, max_concurrent_video,
    timeout_seconds, retry_delay_ms, max_retries, description, is_active
  } = req.body;

  if (!role) {
    return res.status(400).json({ message: '角色名称不能为空' });
  }

  try {
    const existing = await queryOne('SELECT id FROM rate_limit_configs WHERE role = ?', [role]);
    if (existing) {
      return res.status(409).json({ message: '该角色配置已存在' });
    }

    await execute(
      `INSERT INTO rate_limit_configs 
        (role, max_concurrent_text, max_concurrent_image, max_concurrent_video,
         timeout_seconds, retry_delay_ms, max_retries, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role,
        max_concurrent_text ?? 10,
        max_concurrent_image ?? 5,
        max_concurrent_video ?? 3,
        timeout_seconds ?? 300,
        retry_delay_ms ?? 60000,
        max_retries ?? 3,
        description || null,
        is_active ?? 1
      ]
    );

    // 重新加载限流配置
    await reloadRateLimitConfigs();

    res.json({ message: '限流配置创建成功' });
  } catch (error) {
    console.error('[Admin] Create rate limit config error:', error);
    res.status(500).json({ message: '创建限流配置失败' });
  }
});

/**
 * 更新限流配置
 * PUT /api/admin/rate-limit-configs/:id
 */
router.put('/rate-limit-configs/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    role, max_concurrent_text, max_concurrent_image, max_concurrent_video,
    timeout_seconds, retry_delay_ms, max_retries, description, is_active
  } = req.body;

  try {
    const existing = await queryOne('SELECT id FROM rate_limit_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: '配置不存在' });
    }

    const updates = [];
    const values = [];

    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (max_concurrent_text !== undefined) {
      updates.push('max_concurrent_text = ?');
      values.push(max_concurrent_text);
    }
    if (max_concurrent_image !== undefined) {
      updates.push('max_concurrent_image = ?');
      values.push(max_concurrent_image);
    }
    if (max_concurrent_video !== undefined) {
      updates.push('max_concurrent_video = ?');
      values.push(max_concurrent_video);
    }
    if (timeout_seconds !== undefined) {
      updates.push('timeout_seconds = ?');
      values.push(timeout_seconds);
    }
    if (retry_delay_ms !== undefined) {
      updates.push('retry_delay_ms = ?');
      values.push(retry_delay_ms);
    }
    if (max_retries !== undefined) {
      updates.push('max_retries = ?');
      values.push(max_retries);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE rate_limit_configs SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 重新加载限流配置
    await reloadRateLimitConfigs();

    res.json({ message: '限流配置更新成功' });
  } catch (error) {
    console.error('[Admin] Update rate limit config error:', error);
    res.status(500).json({ message: '更新限流配置失败' });
  }
});

/**
 * 删除限流配置
 * DELETE /api/admin/rate-limit-configs/:id
 */
router.delete('/rate-limit-configs/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const config = await queryOne('SELECT role FROM rate_limit_configs WHERE id = ?', [id]);
    if (!config) {
      return res.status(404).json({ message: '配置不存在' });
    }

    // 不允许删除 default 配置
    if (config.role === 'default') {
      return res.status(400).json({ message: '不能删除默认配置' });
    }

    await execute('DELETE FROM rate_limit_configs WHERE id = ?', [id]);

    // 重新加载限流配置
    await reloadRateLimitConfigs();

    res.json({ message: '限流配置已删除' });
  } catch (error) {
    console.error('[Admin] Delete rate limit config error:', error);
    res.status(500).json({ message: '删除限流配置失败' });
  }
});

// ========================================
// 订阅计划管理 API
// ========================================

/**
 * 获取套餐锁定状态
 * GET /api/admin/subscription-plans/lock-status
 */
router.get('/subscription-plans/lock-status', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const config = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'subscription_plans_locked' AND is_active = 1"
    );
    const isLocked = config ? JSON.parse(config.config_value) === true : true;
    res.json({ locked: isLocked });
  } catch (error) {
    console.error('[Admin] Get lock status error:', error);
    res.status(500).json({ message: '获取锁定状态失败' });
  }
});

/**
 * 解锁套餐数量限制（需要二次验证：账号密码 + 后台密钥）
 * POST /api/admin/subscription-plans/unlock
 */
router.post('/subscription-plans/unlock', authMiddleware, requireAdmin, async (req, res) => {
  const { email, password, adminAccessKey } = req.body;
  const adminId = req.user.userId;

  if (!email || !password || !adminAccessKey) {
    return res.status(400).json({ message: '请提供账号、密码和后台密钥' });
  }

  try {
    // 1. 验证当前管理员身份（重新验证账号密码）
    const admin = await queryOne('SELECT id, password_hash, role, email FROM users WHERE email = ?', [email]);
    if (!admin || admin.id !== adminId) {
      return res.status(401).json({ message: '账号验证失败' });
    }

    const isValidPassword = bcrypt.compareSync(password, admin.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: '密码错误' });
    }

    // 2. 验证后台密钥（根据角色类型）
    const role = admin.role || 'admin';
    const configuredKey = getConfiguredAdminAccessKey(role);
    if (!configuredKey) {
      return res.status(503).json({ message: `后台访问策略未配置，请设置 ${role === 'ops' ? 'OPS_ACCESS_KEY' : 'ADMIN_ACCESS_KEY'}` });
    }

    const providedKey = String(adminAccessKey).trim();
    const crypto = require('crypto');
    const leftBuffer = Buffer.from(providedKey);
    const rightBuffer = Buffer.from(configuredKey);
    if (leftBuffer.length !== rightBuffer.length || !crypto.timingSafeEqual(leftBuffer, rightBuffer)) {
      return res.status(401).json({ message: '后台密钥错误' });
    }

    // 3. 解除锁定
    await execute(
      `INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
       VALUES ('subscription_plans_locked', '套餐数量锁定', 'boolean', 'false', '锁定后禁止新增、删除套餐，编辑套餐不受影响。需要管理员二次验证解锁。', 1)
       ON DUPLICATE KEY UPDATE config_value = 'false', updated_at = NOW()`
    );

    // 4. 记录操作日志
    await logAdminAction({
      adminId,
      action: 'unlock_subscription_plans',
      targetType: 'system_config',
      targetName: '套餐数量锁定',
      details: { action: '解除套餐数量锁定', email: admin.email },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '套餐数量锁定已解除', unlocked: true });
  } catch (error) {
    console.error('[Admin] Unlock subscription plans error:', error);
    res.status(500).json({ message: '解锁失败' });
  }
});

/**
 * 重新锁定套餐数量
 * POST /api/admin/subscription-plans/lock
 */
router.post('/subscription-plans/lock', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await execute(
      `INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
       VALUES ('subscription_plans_locked', '套餐数量锁定', 'boolean', 'true', '锁定后禁止新增、删除套餐，编辑套餐不受影响。需要管理员二次验证解锁。', 1)
       ON DUPLICATE KEY UPDATE config_value = 'true', updated_at = NOW()`
    );

    await logAdminAction({
      adminId: req.user.userId,
      action: 'lock_subscription_plans',
      targetType: 'system_config',
      targetName: '套餐数量锁定',
      details: { action: '启用套餐数量锁定' },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '套餐数量已锁定', locked: true });
  } catch (error) {
    console.error('[Admin] Lock subscription plans error:', error);
    res.status(500).json({ message: '锁定失败' });
  }
});

/**
 * 获取所有订阅计划（包括未激活的）
 * GET /api/admin/subscription-plans
 */
router.get('/subscription-plans', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const plans = await queryAll(
      `SELECT id, name, display_name, price_monthly, price_yearly,
              first_month_price, first_year_price,
              max_projects, max_api_calls_monthly, max_team_members,
              features_json, is_active, sort_order, created_at, updated_at
       FROM subscription_plans
       ORDER BY sort_order ASC, id ASC`
    );

    // 解析 features_json
    const parsedPlans = plans.map(plan => ({
      ...plan,
      features: parseJsonField(plan.features_json, [])
    }));

    res.json({ plans: parsedPlans });
  } catch (error) {
    console.error('[Admin] Get subscription plans error:', error);
    res.status(500).json({ message: '获取订阅计划失败' });
  }
});

/**
 * 创建新订阅计划
 * POST /api/admin/subscription-plans
 */
router.post('/subscription-plans', authMiddleware, requireAdmin, async (req, res) => {
  const {
    name, display_name, price_monthly, price_yearly,
    first_month_price, first_year_price,
    max_projects, max_api_calls_monthly, max_team_members,
    features, is_active, sort_order
  } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ message: '套餐名称不能为空' });
  }

  try {
    // 检查套餐数量是否被锁定
    const lockConfig = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'subscription_plans_locked' AND is_active = 1"
    );
    if (lockConfig && JSON.parse(lockConfig.config_value) === true) {
      return res.status(403).json({ message: '套餐数量已锁定，禁止新增套餐。如需修改请先解锁。', locked: true });
    }

    // 检查名称是否已存在
    const existing = await queryOne(
      'SELECT id FROM subscription_plans WHERE name = ?',
      [name]
    );
    if (existing) {
      return res.status(409).json({ message: '套餐名称已存在' });
    }

    const result = await execute(
      `INSERT INTO subscription_plans 
        (name, display_name, price_monthly, price_yearly,
         first_month_price, first_year_price,
         max_projects, max_api_calls_monthly, max_team_members,
         features_json, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        display_name,
        price_monthly || 0,
        price_yearly || 0,
        first_month_price || null,
        first_year_price || null,
        max_projects || 5,
        max_api_calls_monthly || 1000,
        max_team_members || 1,
        stringifyJsonValue(features || []),
        is_active ?? 1,
        sort_order ?? 0
      ]
    );

    // 记录操作日志
    await logAdminAction({
      adminId: req.user.userId,
      action: 'create',
      targetType: 'subscription_plan',
      targetId: result.insertId,
      targetName: display_name,
      details: { name, display_name, price_monthly, price_yearly },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({
      message: '订阅计划创建成功',
      planId: result.insertId
    });
  } catch (error) {
    console.error('[Admin] Create subscription plan error:', error);
    res.status(500).json({ message: '创建订阅计划失败' });
  }
});

/**
 * 更新订阅计划
 * PUT /api/admin/subscription-plans/:id
 */
router.put('/subscription-plans/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, display_name, price_monthly, price_yearly,
    first_month_price, first_year_price,
    max_projects, max_api_calls_monthly, max_team_members,
    features, is_active, sort_order
  } = req.body;

  try {
    const plan = await queryOne('SELECT id FROM subscription_plans WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ message: '订阅计划不存在' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      // 检查名称是否被其他套餐使用
      const nameExists = await queryOne(
        'SELECT id FROM subscription_plans WHERE name = ? AND id != ?',
        [name, id]
      );
      if (nameExists) {
        return res.status(409).json({ message: '套餐名称已被使用' });
      }
      updates.push('name = ?');
      values.push(name);
    }
    if (display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(display_name);
    }
    if (price_monthly !== undefined) {
      updates.push('price_monthly = ?');
      values.push(price_monthly);
    }
    if (price_yearly !== undefined) {
      updates.push('price_yearly = ?');
      values.push(price_yearly);
    }
    if (max_projects !== undefined) {
      updates.push('max_projects = ?');
      values.push(max_projects);
    }
    if (max_api_calls_monthly !== undefined) {
      updates.push('max_api_calls_monthly = ?');
      values.push(max_api_calls_monthly);
    }
    if (max_team_members !== undefined) {
      updates.push('max_team_members = ?');
      values.push(max_team_members);
    }
    if (features !== undefined) {
      updates.push('features_json = ?');
      values.push(stringifyJsonValue(features));
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(sort_order);
    }
    if (first_month_price !== undefined) {
      updates.push('first_month_price = ?');
      values.push(first_month_price === '' || first_month_price === null ? null : first_month_price);
    }
    if (first_year_price !== undefined) {
      updates.push('first_year_price = ?');
      values.push(first_year_price === '' || first_year_price === null ? null : first_year_price);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 记录操作日志
    await logAdminAction({
      adminId: req.user.userId,
      action: 'update',
      targetType: 'subscription_plan',
      targetId: id,
      targetName: display_name || name,
      details: req.body,
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '订阅计划更新成功' });
  } catch (error) {
    console.error('[Admin] Update subscription plan error:', error);
    res.status(500).json({ message: '更新订阅计划失败' });
  }
});

/**
 * 删除订阅计划
 * DELETE /api/admin/subscription-plans/:id
 */
router.delete('/subscription-plans/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // 检查套餐数量是否被锁定
    const lockConfig = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'subscription_plans_locked' AND is_active = 1"
    );
    if (lockConfig && JSON.parse(lockConfig.config_value) === true) {
      return res.status(403).json({ message: '套餐数量已锁定，禁止删除套餐。如需修改请先解锁。', locked: true });
    }

    const plan = await queryOne('SELECT id, display_name, name FROM subscription_plans WHERE id = ?', [id]);
    if (!plan) {
      return res.status(404).json({ message: '订阅计划不存在' });
    }

    // 检查是否有用户正在使用此套餐
    const activeSubscriptions = await queryOne(
      `SELECT COUNT(*) as count FROM user_subscriptions 
       WHERE plan_id = ? AND status IN ('active', 'trial')`,
      [id]
    );
    if (activeSubscriptions?.count > 0) {
      return res.status(400).json({
        message: '无法删除：有用户正在使用此套餐',
        activeCount: activeSubscriptions.count
      });
    }

    await execute('DELETE FROM subscription_plans WHERE id = ?', [id]);

    // 记录操作日志
    await logAdminAction({
      adminId: req.user.userId,
      action: 'delete',
      targetType: 'subscription_plan',
      targetId: id,
      targetName: plan.display_name || plan.name,
      details: { deletedPlan: plan },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent'] || ''
    });

    res.json({ message: '订阅计划已删除' });
  } catch (error) {
    console.error('[Admin] Delete subscription plan error:', error);
    res.status(500).json({ message: '删除订阅计划失败' });
  }
});

/**
 * 获取所有用户订阅（支持分页、筛选）
 * GET /api/admin/subscriptions
 * 
 * Query params:
 *   - page: 页码（从1开始，默认1）
 *   - limit: 每页数量（默认20，最大100）
 *   - status: 筛选状态（active/expired/cancelled/trial）
 *   - planId: 筛选套餐
 */
router.get('/subscriptions', authMiddleware, requireAdmin, async (req, res) => {
  const {
    page: rawPage = 1,
    limit: rawLimit = 20,
    status,
    planId
  } = req.query;

  try {
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
    const offset = (page - 1) * limit;

    // 构建查询条件（以 users 表为主，LEFT JOIN 订阅表，显示所有用户包括免费用户）
    const conditions = [];
    const params = [];

    if (status === 'free') {
      // 筛选无订阅记录的免费用户
      conditions.push('us.id IS NULL');
    } else if (status) {
      conditions.push('us.status = ?');
      params.push(status);
    }
    if (planId) {
      conditions.push('us.plan_id = ?');
      params.push(planId);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // 查询总数
    const countResult = await queryOne(
      `SELECT COUNT(*) as total 
       FROM users u
       LEFT JOIN user_subscriptions us ON u.id = us.user_id
       ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // 查询用户列表（含订阅信息）
    const subscriptions = await queryAll(
      `SELECT 
        us.id,
        u.id as user_id,
        us.plan_id,
        us.status,
        us.billing_cycle,
        us.current_period_start,
        us.current_period_end,
        us.api_calls_used,
        COALESCE(us.created_at, u.created_at) as created_at,
        u.email as user_email,
        sp.name as plan_name,
        sp.display_name as plan_display_name
       FROM users u
       LEFT JOIN user_subscriptions us ON u.id = us.user_id
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       ${whereClause}
       ORDER BY COALESCE(us.created_at, u.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Admin] Get subscriptions error:', error);
    res.status(500).json({ message: '获取订阅列表失败' });
  }
});

/**
 * 为用户创建订阅（管理员给免费用户开通会员）
 * POST /api/admin/subscriptions
 */
router.post('/subscriptions', authMiddleware, requireAdmin, async (req, res) => {
  const { user_id, plan_id, status, billing_cycle, current_period_end } = req.body;

  try {
    if (!user_id || !plan_id) {
      return res.status(400).json({ message: '用户ID和套餐ID为必填' });
    }

    // 验证用户存在
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 验证套餐存在并获取价格
    const plan = await queryOne('SELECT id, price_monthly, price_yearly FROM subscription_plans WHERE id = ?', [plan_id]);
    if (!plan) {
      return res.status(400).json({ message: '指定的套餐不存在' });
    }

    // 检查是否已有订阅记录
    const existing = await queryOne('SELECT id FROM user_subscriptions WHERE user_id = ?', [user_id]);
    if (existing) {
      return res.status(409).json({ message: '该用户已有订阅记录，请使用编辑功能' });
    }

    const validStatus = ['active', 'trial', 'expired', 'cancelled'].includes(status) ? status : 'active';
    const validCycle = ['monthly', 'yearly'].includes(billing_cycle) ? billing_cycle : 'monthly';
    const periodEnd = current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const periodStart = new Date().toISOString().split('T')[0];

    const result = await execute(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, api_calls_used)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [user_id, plan_id, validStatus, validCycle, periodStart, periodEnd]
    );

    // 赠送积分：为购买套餐的钱购买积分的两倍
    // 公式：gift = plan_price / POINT_PURCHASE_PRICE(¥0.02) * 2 = plan_price * 100
    const planPrice = validCycle === 'yearly' 
      ? (parseFloat(plan.price_yearly) || 0) 
      : (parseFloat(plan.price_monthly) || 0);
    let giftPoints = 0;
    if (planPrice > 0) {
      giftPoints = Math.ceil(planPrice * 100);
      // 创建赠送资源包（有效期1个自然月，与订阅周期无关）
      await createResourcePack(user_id, {
        name: '订阅赠送资源包',
        totalPoints: giftPoints,
        sourceType: 'subscription',
        sourceId: result.insertId,
        isGift: true
      });
    }

    res.json({ 
      message: '订阅已创建', 
      id: result.insertId,
      gift_points: giftPoints,
      plan_price: planPrice
    });
  } catch (error) {
    console.error('[Admin] Create subscription error:', error);
    res.status(500).json({ message: '创建订阅失败' });
  }
});

/**
 * 手动调整用户订阅（管理员操作）
 * PUT /api/admin/subscriptions/:id
 */
router.put('/subscriptions/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, plan_id, current_period_end, api_calls_used } = req.body;

  try {
    const subscription = await queryOne(
      'SELECT id FROM user_subscriptions WHERE id = ?',
      [id]
    );
    if (!subscription) {
      return res.status(404).json({ message: '订阅记录不存在' });
    }

    const updates = [];
    const values = [];

    if (status !== undefined) {
      if (!['active', 'expired', 'cancelled', 'trial'].includes(status)) {
        return res.status(400).json({ message: '无效的订阅状态' });
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (plan_id !== undefined) {
      // 验证套餐是否存在
      if (plan_id !== null) {
        const plan = await queryOne(
          'SELECT id FROM subscription_plans WHERE id = ?',
          [plan_id]
        );
        if (!plan) {
          return res.status(400).json({ message: '指定的套餐不存在' });
        }
      }
      updates.push('plan_id = ?');
      values.push(plan_id);
    }
    if (current_period_end !== undefined) {
      updates.push('current_period_end = ?');
      values.push(current_period_end);
    }
    if (api_calls_used !== undefined) {
      updates.push('api_calls_used = ?');
      values.push(api_calls_used);
    }
    if (req.body.billing_cycle !== undefined) {
      if (!['monthly', 'yearly'].includes(req.body.billing_cycle)) {
        return res.status(400).json({ message: '无效的计费周期' });
      }
      updates.push('billing_cycle = ?');
      values.push(req.body.billing_cycle);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE user_subscriptions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: '订阅信息已更新' });
  } catch (error) {
    console.error('[Admin] Update subscription error:', error);
    res.status(500).json({ message: '更新订阅信息失败' });
  }
});

// ============ 系统错误日志管理 ============

/**
 * 获取系统错误列表
 */
router.get('/system-errors', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const errorType = req.query.errorType || null;
    const search = req.query.search || null;
    const isResolved = req.query.isResolved !== undefined 
      ? req.query.isResolved === 'true' 
      : null;

    const result = await getSystemErrors({ page, limit, errorType, isResolved, search });
    res.json(result);
  } catch (error) {
    console.error('[Admin] Get system errors error:', error);
    res.status(500).json({ message: '获取系统错误列表失败' });
  }
});

/**
 * 获取系统错误统计
 */
router.get('/system-errors/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const stats = await getSystemErrorStats();
    res.json({ stats });
  } catch (error) {
    console.error('[Admin] Get system error stats error:', error);
    res.status(500).json({ message: '获取系统错误统计失败' });
  }
});

/**
 * 更新系统错误状态
 */
router.patch('/system-errors/:id/status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_resolved } = req.body;
    const resolvedBy = req.user?.email || 'admin';

    await updateSystemErrorStatus(parseInt(id), !!is_resolved, resolvedBy);
    res.json({ 
      success: true, 
      message: is_resolved ? '已标记为已解决' : '已标记为待处理' 
    });
  } catch (error) {
    console.error('[Admin] Update system error status error:', error);
    res.status(500).json({ message: '更新状态失败' });
  }
});

module.exports = router;
