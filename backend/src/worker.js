/**
 * 工作流 Worker 进程
 * 
 * 独立的 Worker 进程专门处理工作流任务（AI 生成、轮询、文件持久化等），
 * 与 Master 进程（HTTP/WebSocket 服务）分离，避免阻塞 HTTP 响应。
 * 
 * 启动方式：
 * - 由主服务进程在当前运行模型下拉起
 * 
 * 通信方式：
 * - Redis Pub/Sub（推荐，跨进程/跨机器）
 * - process.send / process.on('message')（cluster 内部）
 */

require('dotenv').config();
const { initializeDatabase } = require('./db');

// Worker 标识
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

async function startWorker() {
  console.log(`[Worker:${WORKER_ID}] 启动中...`);

  // 1. 初始化数据库连接
  await initializeDatabase();

  // 2. 初始化 Redis（Worker 必须使用 Redis 来协调任务）
  try {
    const { initializeRedis, isRedisAvailable } = require('./redis-service');
    await initializeRedis();
    if (isRedisAvailable()) {
      console.log(`[Worker:${WORKER_ID}] Redis 已连接`);
    } else {
      console.log(`[Worker:${WORKER_ID}] Redis 未配置，使用内存模式（仅适合单 Worker）`);
    }
  } catch (err) {
    console.warn(`[Worker:${WORKER_ID}] Redis 初始化失败:`, err.message);
  }

  // 3. 初始化 AI 限流器配置
  try {
    const { ensureConfigLoaded } = require('./nosyntask/utils/aiRateLimiter');
    await ensureConfigLoaded();
    console.log(`[Worker:${WORKER_ID}] AI 限流配置已加载`);
  } catch (err) {
    console.warn(`[Worker:${WORKER_ID}] AI 限流配置加载失败:`, err.message);
  }

  // 4. 启动 PollManager（轮询调度器）
  const pollManager = require('./nosyntask/utils/PollManager');
  pollManager.start();
  console.log(`[Worker:${WORKER_ID}] PollManager 调度器已启动`);

  // 5. 初始化工作流引擎
  const engine = require('./nosyntask/engine/index');
  console.log(`[Worker:${WORKER_ID}] 工作流引擎已初始化`);

  // 6. 监听来自 Master 的消息（cluster 模式）
  if (process.send) {
    process.on('message', async (msg) => {
      if (msg.type === 'execute_workflow') {
        const { jobId } = msg;
        console.log(`[Worker:${WORKER_ID}] 收到工作流任务: jobId=${jobId}`);
        try {
          await engine.executor.runNextStep(jobId);
        } catch (err) {
          console.error(`[Worker:${WORKER_ID}] 工作流执行失败: jobId=${jobId}`, err);
        }
      }

      if (msg.type === 'shutdown') {
        console.log(`[Worker:${WORKER_ID}] 收到关闭信号，优雅退出...`);
        pollManager.stop();
        engine.executor.shutdown();
        process.exit(0);
      }
    });

    // 通知 Master 自己已准备好
    process.send({ type: 'worker_ready', workerId: WORKER_ID, pid: process.pid });
  }

  // 7. 优雅关闭
  process.on('SIGTERM', () => {
    console.log(`[Worker:${WORKER_ID}] 收到 SIGTERM，优雅退出...`);
    pollManager.stop();
    engine.executor.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log(`[Worker:${WORKER_ID}] 收到 SIGINT，优雅退出...`);
    pollManager.stop();
    engine.executor.shutdown();
    process.exit(0);
  });

  console.log(`[Worker:${WORKER_ID}] 已就绪，等待任务...`);
}

startWorker().catch(err => {
  console.error(`[Worker:${WORKER_ID}] 启动失败:`, err);
  process.exit(1);
});
