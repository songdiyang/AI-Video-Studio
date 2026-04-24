require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const { initializeDatabase } = require('./db');

// 记录服务启动时间
const SERVER_START_TIME = Date.now();

// 导出服务器状态信息
module.exports.getServerStatus = () => ({
  startTime: SERVER_START_TIME,
  uptime: Date.now() - SERVER_START_TIME,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  hostname: os.hostname(),
  cpuCores: os.cpus().length,
  totalMemory: os.totalmem(),
  freeMemory: os.freemem(),
  processMemory: process.memoryUsage(),
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 4000,
});

const authRoutes = require('./auth');
const scriptRoutes = require('./scripts');
const storyboardRoutes = require('./scripts/storyboard');
const billingRoutes = require('./billing');
const userRoutes = require('./users');
const characterRoutes = require('./scripts/Characters');
const sceneRoutes = require('./scripts/Scenes');
const propsRoutes = require('./scripts/Props');
const assetsRoutes = require('./scripts/Assets');
const costumeRoutes = require('./scripts/Costumes');
const projectRoutes = require('./projects');
const workflowRoutes = require('./nosyntask/routes');
const modelRoutes = require('./modelRoutes');
const aiAssistantRoutes = require('./aiAssistantRoutes');
const adminRoutes = require('./adminRoutes');
const fileProxyRoutes = require('./scripts/fileProxy');
const feedbackModule = require('./feedback');
const feedbackRoutes = feedbackModule.router;
const internalMailModule = require('./internalMail');
const internalMailRoutes = internalMailModule.router;
const sketchProjectRoutes = require('./scripts/sketchProjects');
const templateRoutes = require('./templates');
const communityRoutes = require('./community');
const marketplaceRoutes = require('./marketplace');
const subscriptionRoutes = require('./subscriptions');
const collaborationRoutes = require('./scripts/collaboration');
const collaborationApiRoutes = require('./collaboration');
const versionControlRoutes = require('./scripts/versionControl');
const approvalsRoutes = require('./scripts/approvals');
const systemConfigRoutes = require('./systemConfigRoutes');
const teamsRoutes = require('./teams');
const taskAssignmentRoutes = require('./taskAssignment');
const novelRoutes = require('./novelRoutes');
const statsRoutes = require('./statsRoutes');
const { setupWebSocket } = require('./websocket');
const { errorHandlerMiddleware, initGlobalErrorHandlers } = require('./globalErrorHandler');
const callbackHandler = require('./nosyntask/callbackHandler');
const { getUploadsBase } = require('./utils/uploadsBase');

const app = express();
const http = require('http');
const server = http.createServer(app);

// 信任 Nginx 反代的 X-Forwarded-For 头
app.set('trust proxy', 1);

// Helmet - 设置安全 HTTP 响应头
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https:", "blob:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "data:"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // 允许加载跨域图片资源
}));

// API 速率限制（已禁用）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: Number.MAX_SAFE_INTEGER, // 无限制
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
  skip: () => true // 跳过所有限制
});
app.use('/api/', apiLimiter);

// 登录/注册接口速率限制（已禁用）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.MAX_SAFE_INTEGER, // 无限制
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '认证请求过于频繁，请稍后再试' },
  skip: () => true // 跳过所有限制
});

// CORS 配置 - 限制允许的来源
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如移动应用、Postman）
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// 限制请求体大小，防止 DoS
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/storyboards', storyboardRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/props', propsRoutes);
app.use('/api/costumes', costumeRoutes);
app.use('/api', assetsRoutes);  // 参考图路由（/api/reference-images）
app.use('/api/projects', projectRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/ai-models', modelRoutes);
app.use('/api/ai-assistant', aiAssistantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/mail', internalMailRoutes);
app.use('/api/files', fileProxyRoutes);
app.use('/api/sketch-projects', sketchProjectRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/teams', teamsRoutes);  // 团队管理路由
app.use('/api/tasks', taskAssignmentRoutes);  // 任务指派路由
app.use('/api/novels', novelRoutes);  // 小说工作台路由
app.use('/api/stats', statsRoutes);  // 仪表盘统计路由
// 协作路由
const collaborationRouter = express.Router();
collaborationRoutes(collaborationRouter);
app.use('/api', collaborationRouter);
app.use('/api', collaborationApiRoutes);  // 团队协作API（邀请、审核等）
// 版本控制路由
const versionControlRouter = express.Router();
versionControlRoutes(versionControlRouter);
app.use('/api', versionControlRouter);
// 审批流程路由
const approvalsRouter = express.Router();
approvalsRoutes(approvalsRouter);
app.use('/api', approvalsRouter);
app.use('/api/system-configs', systemConfigRoutes);
// AI 任务回调接口（不需要认证，AI 服务直接回调）
app.use('/api/callbacks', callbackHandler.router);

// Serve static files for production if needed
const clientBuildPath = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(clientBuildPath));

// Serve uploads directory for sketch files
const uploadsPath = getUploadsBase();
app.use('/uploads', express.static(uploadsPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      next();
    }
  });
});

// 全局错误处理中间件（必须放在所有路由之后）
app.use(errorHandlerMiddleware);

const PORT = process.env.PORT || 4001;

async function start() {
  // 初始化全局错误处理器
  initGlobalErrorHandlers();
  
  await initializeDatabase();

  // 初始化 Redis 缓存（可选，不可用时自动降级为内存模式）
  try {
    const { initializeRedis, isRedisAvailable, CacheService } = require('./redis-service');
    await initializeRedis();
    if (isRedisAvailable()) {
      console.log('  \x1b[32m✔\x1b[0m Redis 缓存已启用');

      // 缓存预热：加载高频访问数据
      try {
        const { queryAll: dbQueryAll } = require('./dbHelper');
        await CacheService.warmup([
          {
            key: 'config:rate_limits',
            fetchFn: () => dbQueryAll('SELECT * FROM rate_limit_configs'),
            ttl: 3600
          },
          {
            key: 'config:ai_models',
            fetchFn: () => dbQueryAll('SELECT * FROM ai_models WHERE status = "active"'),
            ttl: 3600
          },
          {
            key: 'config:system',
            fetchFn: () => dbQueryAll('SELECT * FROM system_configs'),
            ttl: 3600
          }
        ]);
        console.log('  \x1b[32m✔\x1b[0m 缓存预热完成');
      } catch (err) {
        console.warn('[Startup] 缓存预热失败（非致命）:', err.message);
      }

      // 初始化 Pub/Sub 服务（用于工作流事件异步解耦）
      try {
        const { PubSubService } = require('./redis-service');
        const initialized = await PubSubService.initialize();
        if (initialized) {
          // 订阅工作流完成事件
          await PubSubService.subscribe('workflow:completed', async (data) => {
            console.log(`[PubSub] 工作流完成: job=${data.jobId}, user=${data.userId}, type=${data.workflowType}`);
            // 未来可扩展：通过 WebSocket 推送通知给前端
          });
          // 订阅工作流失败事件
          await PubSubService.subscribe('workflow:failed', async (data) => {
            console.log(`[PubSub] 工作流失败: job=${data.jobId}, user=${data.userId}, error=${data.error}`);
            // 未来可扩展：通过 WebSocket 推送错误通知
          });
          console.log('  \x1b[32m✔\x1b[0m Pub/Sub 事件订阅已启用');
        }
      } catch (err) {
        console.warn('[Startup] PubSub 初始化失败（非致命）:', err.message);
      }
    } else {
      console.log('  \x1b[33m⚠\x1b[0m Redis 未配置，使用内存缓存模式');
    }
  } catch (err) {
    console.warn('[Startup] Redis 模块加载失败（可选）:', err.message);
  }

  // 初始化依赖数据库的表
  if (feedbackModule.ensureFeedbackTable) {
    try {
      await feedbackModule.ensureFeedbackTable();
    } catch (err) {
      console.warn('[Startup] 初始化 feedback 表失败:', err.message);
    }
  }

  if (internalMailModule.ensureInternalMailTable) {
    try {
      await internalMailModule.ensureInternalMailTable();
    } catch (err) {
      console.warn('[Startup] 初始化 internal_mail 表失败:', err.message);
    }
  }

  // 设置 WebSocket 服务（集成到 HTTP 服务器）
  setupWebSocket(app, server);

  // 清理因服务重启而中断的工作流任务
  // 注意：有执行快照（execution_snapshot）的任务由 WorkflowExecutor._recoverInterruptedJobs() 自动恢复
  // 这里只处理没有快照的旧任务（兼容老数据）
  try {
    const { execute: dbExec } = require('./dbHelper');
    const staleResult = await dbExec(
      `UPDATE workflow_jobs SET status = 'failed', error_message = '服务重启导致任务中断（缺少快照），请重新发起', updated_at = NOW()
       WHERE status IN ('pending', 'running') AND execution_snapshot IS NULL`
    );
    const staleCount = staleResult?.affectedRows || 0;
    if (staleCount > 0) {
      console.log(`  \x1b[33m⚠\x1b[0m 清理了 ${staleCount} 个无快照的旧任务（新任务具备快照可自动恢复）`);
      await dbExec(
        `UPDATE generation_tasks SET status = 'failed', error_message = '服务重启导致任务中断（缺少快照）', updated_at = NOW()
         WHERE status IN ('pending', 'processing')`
      );
    }
  } catch (err) {
    console.warn('[Startup] 清理中断任务失败（非致命）:', err.message);
  }

  // 注册优雅关闭：引擎保存快照 + 刷新日志
  const gracefulShutdown = async (signal) => {
    console.log(`\n\x1b[33m[Shutdown]\x1b[0m 收到 ${signal}，正在优雅退出...`);
    try {
      const engine = require('./nosyntask/engine');
      if (engine && typeof engine.shutdown === 'function') {
        console.log('[Shutdown] 保存执行快照...');
        await engine.shutdown();
        console.log('[Shutdown] 快照已保存');
      }
    } catch (err) {
      console.warn('[Shutdown] 保存快照失败:', err.message);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 资源包过期清零定时任务：每小时执行一次
  try {
    const { expireResourcePacks } = require('./resourcePackService');
    // 启动时立即执行一次
    expireResourcePacks().catch(err => console.warn('[Cron] 启动时资源包清零失败:', err.message));
    // 每小时执行一次
    setInterval(async () => {
      try {
        const result = await expireResourcePacks();
        if (result.expiredCount > 0) {
          console.log(`[Cron] 资源包过期清零: ${result.expiredCount} 个资源包, ${result.affectedUsers} 个用户受影响`);
        }
      } catch (err) {
        console.warn('[Cron] 资源包过期清零失败:', err.message);
      }
    }, 60 * 60 * 1000);
    console.log('  \x1b[32m✔\x1b[0m 资源包过期清零定时任务已启用（每小时）');
  } catch (err) {
    console.warn('[Startup] 资源包定时任务初始化失败:', err.message);
  }

  server.listen(PORT, () => {
    console.log('\n' +
      '  ~(=^\u30FB\u03C9\u30FB^)\uFF8D >\uFF9F)))\u5F61\n' +
      '\n' +
      '  \x1b[36m\u2728 \u997a\u5b50\u52a8\u6f2b Backend \u542F\u52A8\u6210\u529F!\x1b[0m\n' +
      `  \x1b[32m\u2714\x1b[0m \u670D\u52A1\u5730\u5740: http://localhost:${PORT}\n` +
      `  \x1b[32m\u2714\x1b[0m \u8FD0\u884C\u73AF\u5883: ${process.env.NODE_ENV || 'development'}\n` +
      `  \x1b[32m\u2714\x1b[0m \u542F\u52A8\u65F6\u95F4: ${new Date().toLocaleString('zh-CN')}\n`
    );
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
