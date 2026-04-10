const WebSocket = require('ws');
const { queryOne } = require('./dbHelper');
const jwt = require('jsonwebtoken');

// 可选 Redis Pub/Sub 支持
let PubSubService = null;
try {
  const redisMod = require('./redis-service');
  PubSubService = redisMod.PubSubService;
} catch (e) {
  // redis-service 不可用，保持本地模式
}

// 全局引用，供外部模块推送消息
let globalClients = null;
let globalTaskSubscriptions = null;

// 连接数限制
const MAX_CONNECTIONS_PER_USER = parseInt(process.env.WS_MAX_PER_USER, 10) || 5;
const userConnectionCount = new Map(); // userId -> count

// Pub/Sub 频道名
const TASK_STATUS_CHANNEL = 'ws:task_status';

// 连接统计
const wsStats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesReceived: 0,
  messagesSent: 0,
  pubsubEnabled: false
};

/**
 * 获取 WebSocket 统计信息
 */
function getWsStats() {
  return {
    ...wsStats,
    userConnectionCounts: Object.fromEntries(userConnectionCount)
  };
}

/**
 * 将 WebSocket 服务集成到 Express HTTP 服务器中
 * @param {import('express').Express} app - Express 应用
 * @param {import('http').Server} server - HTTP 服务器
 */
function setupWebSocket(app, server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'  // WebSocket 路径
  });

  const clients = new Map(); // sessionId -> { ws, userId, projectId, resourceId }
  const rooms = new Map(); // roomId -> Set<sessionId>
  const taskSubscriptions = new Map(); // jobId -> Set<sessionId> 任务订阅
  
  // 保存全局引用
  globalClients = clients;
  globalTaskSubscriptions = taskSubscriptions;

  // 初始化 Redis Pub/Sub 订阅（跨实例广播）
  _initPubSubSubscriber();

  console.log('[WebSocket] 已集成到 HTTP 服务器，路径：/ws');

  wss.on('connection', async (ws, req) => {
    const sessionId = generateSessionId();
    let authenticated = false;

    wsStats.totalConnections++;
    wsStats.activeConnections++;
    console.log(`[WebSocket] 新连接：${sessionId}`);

    ws.on('message', async (message) => {
      wsStats.messagesReceived++;
      try {
        const data = JSON.parse(message);
        await handleMessage(ws, sessionId, data, authenticated, clients, rooms, taskSubscriptions);
      } catch (error) {
        console.error('[WebSocket] 消息处理失败:', error);
        send(ws, { type: 'error', message: '消息处理失败' });
      }
    });

    ws.on('close', () => {
      wsStats.activeConnections--;
      handleDisconnect(sessionId, clients, rooms, taskSubscriptions);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] 连接错误:', error);
      wsStats.activeConnections--;
      handleDisconnect(sessionId, clients, rooms, taskSubscriptions);
    });

    // 发送连接成功消息
    send(ws, { type: 'connected', sessionId });
  });

  // 定期清理不活跃的连接
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  return wss;
}

/**
 * 初始化 Redis Pub/Sub 订阅（接收跨实例消息）
 */
async function _initPubSubSubscriber() {
  if (!PubSubService) return;

  try {
    if (!PubSubService.isAvailable()) {
      await PubSubService.initialize();
    }

    if (PubSubService.isAvailable()) {
      await PubSubService.subscribe(TASK_STATUS_CHANNEL, (message) => {
        // 收到其他实例的广播消息，本地分发
        _localBroadcastTaskStatus(message.jobId, message.statusData);
      });
      await PubSubService.subscribe(USER_MESSAGE_CHANNEL, (message) => {
        _localPushToUser(message.userId, message.data);
      });
      wsStats.pubsubEnabled = true;
      console.log('[WebSocket] Redis Pub/Sub 跨实例广播已启用');
    }
  } catch (e) {
    console.warn('[WebSocket] Redis Pub/Sub 初始化失败，使用本地模式:', e.message);
  }
}

/**
 * 处理 WebSocket 消息
 */
async function handleMessage(ws, sessionId, data, authenticated, clients, rooms, taskSubscriptions) {
  switch (data.type) {
    case 'auth':
      authenticated = await authenticate(ws, sessionId, data, clients);
      break;
    case 'join_room':
      joinRoom(ws, sessionId, data, clients, rooms);
      break;
    case 'leave_room':
      leaveRoom(sessionId, data, rooms);
      break;
    case 'broadcast':
      broadcastToRoom(sessionId, data, clients, rooms);
      break;
    case 'cursor_update':
      broadcastCursorUpdate(sessionId, data, clients, rooms);
      break;
    case 'subscribe_task':
      subscribeTask(ws, sessionId, data, taskSubscriptions);
      break;
    case 'unsubscribe_task':
      unsubscribeTask(sessionId, data, taskSubscriptions);
      break;
    case 'ping':
      ws.isAlive = true;
      send(ws, { type: 'pong', timestamp: Date.now() });
      break;
    default:
      console.warn('[WebSocket] 未知消息类型:', data.type);
  }
}

/**
 * 认证 WebSocket 连接
 */
async function authenticate(ws, sessionId, data, clients) {
  try {
    const { token } = data;
    if (!token) {
      send(ws, { type: 'auth_error', message: '缺少令牌' });
      return false;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await queryOne('SELECT id, email, username FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      send(ws, { type: 'auth_error', message: '用户不存在' });
      return false;
    }

    // 检查用户连接数限制
    const currentCount = userConnectionCount.get(user.id) || 0;
    if (currentCount >= MAX_CONNECTIONS_PER_USER) {
      send(ws, { type: 'auth_error', message: `连接数已达上限 (${MAX_CONNECTIONS_PER_USER})` });
      console.warn(`[WebSocket] 用户 ${user.username} 连接数超限: ${currentCount}/${MAX_CONNECTIONS_PER_USER}`);
      return false;
    }

    clients.set(sessionId, {
      ws,
      userId: user.id,
      email: user.email,
      username: user.username
    });

    // 更新用户连接计数
    userConnectionCount.set(user.id, currentCount + 1);

    send(ws, { 
      type: 'auth_success', 
      userId: user.id,
      username: user.username 
    });

    console.log(`[WebSocket] 认证成功：${user.username} (${sessionId})，连接数：${currentCount + 1}`);
    return true;
  } catch (error) {
    console.error('[WebSocket] 认证失败:', error);
    send(ws, { type: 'auth_error', message: '认证失败' });
    return false;
  }
}

/**
 * 加入房间
 */
function joinRoom(ws, sessionId, data, clients, rooms) {
  const { roomId } = data;
  if (!roomId) return;

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(sessionId);

  const client = clients.get(sessionId);
  if (client) {
    client.roomId = roomId;
  }

  // 通知房间内所有人
  broadcastToRoom(sessionId, {
    type: 'user_joined',
    roomId,
    userId: client?.userId,
    username: client?.username
  }, clients, rooms);

  console.log(`[WebSocket] ${sessionId} 加入房间 ${roomId}`);
}

/**
 * 离开房间
 */
function leaveRoom(sessionId, data, rooms) {
  const { roomId } = data;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    room.delete(sessionId);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  console.log(`[WebSocket] ${sessionId} 离开房间 ${roomId}`);
}

/**
 * 广播消息到房间
 */
function broadcastToRoom(sessionId, data, clients, rooms) {
  const client = clients.get(sessionId);
  if (!client || !client.roomId) return;

  const room = rooms.get(client.roomId);
  if (!room) return;

  room.forEach((otherSessionId) => {
    if (otherSessionId !== sessionId) {
      const otherClient = clients.get(otherSessionId);
      if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
        send(otherClient.ws, {
          ...data,
          fromUserId: client.userId,
          fromUsername: client.username
        });
      }
    }
  });
}

/**
 * 广播光标更新
 */
function broadcastCursorUpdate(sessionId, data, clients, rooms) {
  const client = clients.get(sessionId);
  if (!client || !client.roomId) return;

  const room = rooms.get(client.roomId);
  if (!room) return;

  room.forEach((otherSessionId) => {
    if (otherSessionId !== sessionId) {
      const otherClient = clients.get(otherSessionId);
      if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
        send(otherClient.ws, {
          type: 'cursor_update',
          userId: client.userId,
          username: client.username,
          position: data.position
        });
      }
    }
  });
}

/**
 * 处理断开连接
 */
function handleDisconnect(sessionId, clients, rooms, taskSubscriptions) {
  const client = clients.get(sessionId);
  if (client) {
    // 清理任务订阅
    taskSubscriptions.forEach((subscribers, jobId) => {
      subscribers.delete(sessionId);
      if (subscribers.size === 0) {
        taskSubscriptions.delete(jobId);
      }
    });
    
    // 通知房间内的人
    if (client.roomId) {
      const room = rooms.get(client.roomId);
      if (room) {
        room.delete(sessionId);
        if (room.size === 0) {
          rooms.delete(client.roomId);
        } else {
          // 通知其他人
          room.forEach((otherSessionId) => {
            const otherClient = clients.get(otherSessionId);
            if (otherClient && otherClient.ws.readyState === WebSocket.OPEN) {
              send(otherClient.ws, {
                type: 'user_left',
                roomId: client.roomId,
                userId: client.userId,
                username: client.username
              });
            }
          });
        }
      }
    }

    // 更新用户连接计数
    if (client.userId) {
      const count = userConnectionCount.get(client.userId) || 1;
      if (count <= 1) {
        userConnectionCount.delete(client.userId);
      } else {
        userConnectionCount.set(client.userId, count - 1);
      }
    }

    clients.delete(sessionId);
    console.log(`[WebSocket] 断开连接：${sessionId} (${client.username})`);
  }
}

/**
 * 订阅任务状态
 */
function subscribeTask(ws, sessionId, data, taskSubscriptions) {
  const { jobId } = data;
  if (!jobId) return;

  if (!taskSubscriptions.has(jobId)) {
    taskSubscriptions.set(jobId, new Set());
  }
  taskSubscriptions.get(jobId).add(sessionId);
  
  send(ws, { type: 'task_subscribed', jobId });
  console.log(`[WebSocket] ${sessionId} 订阅任务 ${jobId}`);
}

/**
 * 取消订阅任务状态
 */
function unsubscribeTask(sessionId, data, taskSubscriptions) {
  const { jobId } = data;
  if (!jobId) return;

  const subscribers = taskSubscriptions.get(jobId);
  if (subscribers) {
    subscribers.delete(sessionId);
    if (subscribers.size === 0) {
      taskSubscriptions.delete(jobId);
    }
  }
  console.log(`[WebSocket] ${sessionId} 取消订阅任务 ${jobId}`);
}

/**
 * 推送任务状态更新（供外部模块调用）
 * 当 Redis Pub/Sub 可用时，通过 Redis 广播到所有实例
 * 否则直接在本实例分发
 * @param {number} jobId - 工作流 ID
 * @param {object} statusData - 状态数据 { status, progress, result, error, taskId, taskStatus }
 */
function pushTaskStatus(jobId, statusData) {
  // 通过 Redis Pub/Sub 广播到所有实例
  if (PubSubService && PubSubService.isAvailable()) {
    PubSubService.publish(TASK_STATUS_CHANNEL, { jobId, statusData }).catch(() => {
      // 发布失败，降级为本地分发
      _localBroadcastTaskStatus(jobId, statusData);
    });
    // 本地也分发（发布者自己的订阅者不通过 subscribe 收到自己发的消息时需要）
    _localBroadcastTaskStatus(jobId, statusData);
    return;
  }

  // 无 Redis，直接本地分发
  _localBroadcastTaskStatus(jobId, statusData);
}

/**
 * 本地实例内的任务状态分发
 */
function _localBroadcastTaskStatus(jobId, statusData) {
  if (!globalClients || !globalTaskSubscriptions) {
    return; // WebSocket 未初始化
  }

  const subscribers = globalTaskSubscriptions.get(jobId);
  if (!subscribers || subscribers.size === 0) {
    return; // 没有订阅者
  }

  const message = {
    type: 'task_status',
    jobId,
    ...statusData,
    timestamp: Date.now()
  };

  subscribers.forEach((sessionId) => {
    const client = globalClients.get(sessionId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      send(client.ws, message);
    }
  });
  
  // 任务完成或失败时自动清理订阅
  if (statusData.status === 'completed' || statusData.status === 'failed') {
    globalTaskSubscriptions.delete(jobId);
  }
}

/**
 * 发送消息
 */
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    wsStats.messagesSent++;
  }
}

/**
 * 生成会话 ID
 */
function generateSessionId() {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 向指定用户的所有连接推送消息
 * 支持 Redis Pub/Sub 跨实例广播
 * @param {number} userId - 用户 ID
 * @param {object} data - 要推送的数据
 */
const USER_MESSAGE_CHANNEL = 'ws:user_message';

function pushToUser(userId, data) {
  // 通过 Redis Pub/Sub 广播到所有实例
  if (PubSubService && PubSubService.isAvailable()) {
    PubSubService.publish(USER_MESSAGE_CHANNEL, { userId, data }).catch(() => {
      _localPushToUser(userId, data);
    });
    _localPushToUser(userId, data);
    return;
  }
  _localPushToUser(userId, data);
}

function _localPushToUser(userId, data) {
  if (!globalClients) return;

  const message = { ...data, timestamp: Date.now() };

  globalClients.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      send(client.ws, message);
    }
  });
}

module.exports = { setupWebSocket, pushTaskStatus, pushToUser, getWsStats };
