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
const projectRoutes = require('./projects');
const workflowRoutes = require('./nosyntask/routes');
const modelRoutes = require('./modelRoutes');
const adminRoutes = require('./adminRoutes');
const fileProxyRoutes = require('./scripts/fileProxy');
const feedbackRoutes = require('./feedback');
const sketchProjectRoutes = require('./scripts/sketchProjects');
const templateRoutes = require('./templates');
const communityRoutes = require('./community');
const subscriptionRoutes = require('./subscriptions');
const collaborationRoutes = require('./collaboration');
const { notificationResponseMiddleware } = require('./notificationResponseMiddleware');

const app = express();

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

// API 速率限制 - 防止暴力攻击和滥用
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: process.env.NODE_ENV === 'production' ? 300 : 2000, // 开发环境放宽限制
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
  skip: () => process.env.NODE_ENV !== 'production' // 开发环境跳过限制
});
app.use('/api/', apiLimiter);

// 登录/注册接口更严格的速率限制
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 每个 IP 每 15 分钟最多 20 次认证请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '认证请求过于频繁，请稍后再试' }
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
app.use(notificationResponseMiddleware);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/storyboards', storyboardRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/scenes', sceneRoutes);
app.use('/api/props', propsRoutes);
app.use('/api', assetsRoutes);  // 参考图路由（/api/reference-images）
app.use('/api/projects', projectRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/ai-models', modelRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/files', fileProxyRoutes);
app.use('/api/sketch-projects', sketchProjectRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api', collaborationRoutes);  // 协作路由（/api/teams, /api/invites, /api/users/search）

// Serve static files for production if needed
const clientBuildPath = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(clientBuildPath));

// Serve uploads directory for sketch files
const uploadsPath = path.join(__dirname, '..', 'uploads');
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

const PORT = process.env.PORT || 4000;

async function start() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Backend server listening on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
