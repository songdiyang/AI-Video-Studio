const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware, requireAdmin } = require('./middleware');
const { parseJsonField } = require('./utils/parseJsonField');
const { withAIBillingContext } = require('./aiBillingContext');
const { getPriceSummary } = require('./aiBillingService');
const { callAIModel, queryAIModel, getTextModels } = require('./aiModelService');
const { generationStartService, sendGenerationError } = require('./modules/generation');
const { getRateLimitStats, reloadRateLimitConfigs } = require('./nosyntask/utils/aiRateLimiter');
const { getServerStatus } = require('./index');
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
      port: 3000,
      url: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')[0].trim(),
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
    const frontendUrl = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')[0].trim();
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
      'SELECT id, email, role, balance, is_active, last_login_ip, last_active_at, created_at, updated_at FROM users ORDER BY id DESC'
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
      'SELECT id, email, role, balance, created_at, updated_at FROM users WHERE id = ?',
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
  const { email, role, balance } = req.body;
  
  try {
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
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
    if (balance !== undefined) {
      updates.push('balance = ?');
      values.push(balance);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }
    
    values.push(id);
    await execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({ message: '用户信息已更新' });
  } catch (error) {
    console.error('[Admin] Update user error:', error);
    res.status(500).json({ message: '更新用户信息失败' });
  }
});

router.delete('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ message: '不能删除自己的账户' });
    }
    
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    await execute('DELETE FROM users WHERE id = ?', [id]);
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
  
  try {
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ message: '不能禁用自己的账户' });
    }
    
    const user = await queryOne('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    const newStatus = is_active ? 1 : 0;
    await execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);
    res.json({ message: newStatus ? '账号已启用' : '账号已禁用', is_active: newStatus });
  } catch (error) {
    console.error('[Admin] Toggle user active error:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  const { email, password, role, balance } = req.body;
  
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
    
    await execute(
      'INSERT INTO users (email, password_hash, role, balance) VALUES (?, ?, ?, ?)',
      [email, passwordHash, role || 'user', balance || 100]
    );
    
    res.json({ message: '用户创建成功' });
  } catch (error) {
    console.error('[Admin] Create user error:', error);
    res.status(500).json({ message: '创建用户失败' });
  }
});

router.get('/ai-models', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const models = await queryAll(
      `SELECT id, name, category, provider, description, is_active, api_key,
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
    res.json({ models: models.map(serializeModel) });
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

router.post('/ai-models', authMiddleware, requireAdmin, async (req, res) => {
  const {
    name, category, provider, description, is_active, api_key,
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
  
  if (!name || !category || !provider || !url_template || !headers_template || !response_mapping) {
    return res.status(400).json({ message: '必填字段不能为空' });
  }
  
  try {
    await execute(
      `INSERT INTO ai_model_configs (
        name, category, provider, description, is_active, api_key,
        price_config, request_method, url_template, headers_template,
        body_template, default_params, response_mapping,
        supported_aspect_ratios, supported_durations, supported_resolutions,
        query_url_template, query_method, query_headers_template,
        query_body_template, query_response_mapping,
        query_success_condition, query_fail_condition,
        query_success_mapping, query_fail_mapping,
        custom_handler, custom_query_handler,
        billing_handler, billing_query_handler
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, category, provider, description, is_active ?? 1, api_key,
        stringifyJsonValue(price_config, { preserveNull: true }), request_method || 'POST', url_template,
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
    
    res.json({ message: '模型创建成功' });
  } catch (error) {
    console.error('[Admin] Create AI model error:', error);
    res.status(500).json({ message: '创建模型失败' });
  }
});

router.put('/ai-models/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, category, provider, description, is_active, api_key,
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
    
    res.json({ message: '模型更新成功' });
  } catch (error) {
    console.error('[Admin] Update AI model error:', error);
    res.status(500).json({ message: '更新模型失败' });
  }
});

router.delete('/ai-models/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    const model = await queryOne('SELECT id FROM ai_model_configs WHERE id = ?', [id]);
    if (!model) {
      return res.status(404).json({ message: '模型不存在' });
    }
    
    await execute('DELETE FROM ai_model_configs WHERE id = ?', [id]);
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
    const model = await queryOne('SELECT id, name, category FROM ai_model_configs WHERE id = ?', [id]);
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
          return handleImageGeneration({
            prompt: params?.prompt || 'A cute cat sitting on a windowsill, watercolor style',
            imageModel: model.name,
            width: params?.width || 1024,
            height: params?.height || 1024,
            imageUrl: params?.imageUrl || undefined,
            imageUrls: params?.imageUrls || undefined
          });
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
    res.status(error.status || 500).json({
      success: false,
      message: error.message || '测试失败',
      error: error.message
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
 * 获取所有订阅计划（包括未激活的）
 * GET /api/admin/subscription-plans
 */
router.get('/subscription-plans', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const plans = await queryAll(
      `SELECT id, name, display_name, price_monthly, price_yearly,
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
    max_projects, max_api_calls_monthly, max_team_members,
    features, is_active, sort_order
  } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ message: '套餐名称不能为空' });
  }

  try {
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
         max_projects, max_api_calls_monthly, max_team_members,
         features_json, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        display_name,
        price_monthly || 0,
        price_yearly || 0,
        max_projects || 5,
        max_api_calls_monthly || 1000,
        max_team_members || 1,
        stringifyJsonValue(features || []),
        is_active ?? 1,
        sort_order ?? 0
      ]
    );

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

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

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
    const plan = await queryOne('SELECT id FROM subscription_plans WHERE id = ?', [id]);
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

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (status) {
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
       FROM user_subscriptions us 
       ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // 查询订阅列表
    const subscriptions = await queryAll(
      `SELECT 
        us.id,
        us.user_id,
        us.plan_id,
        us.status,
        us.billing_cycle,
        us.current_period_start,
        us.current_period_end,
        us.api_calls_used,
        us.created_at,
        u.email as user_email,
        sp.name as plan_name,
        sp.display_name as plan_display_name
       FROM user_subscriptions us
       LEFT JOIN users u ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       ${whereClause}
       ORDER BY us.created_at DESC
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

module.exports = router;
