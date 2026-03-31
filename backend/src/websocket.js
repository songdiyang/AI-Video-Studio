const WebSocket = require('ws');
const { queryOne } = require('./dbHelper');
const jwt = require('jsonwebtoken');

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

  console.log('[WebSocket] 已集成到 HTTP 服务器，路径：/ws');

  wss.on('connection', async (ws, req) => {
    const sessionId = generateSessionId();
    let authenticated = false;

    console.log(`[WebSocket] 新连接：${sessionId}`);

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await handleMessage(ws, sessionId, data, authenticated, clients, rooms);
      } catch (error) {
        console.error('[WebSocket] 消息处理失败:', error);
        send(ws, { type: 'error', message: '消息处理失败' });
      }
    });

    ws.on('close', () => {
      handleDisconnect(sessionId, clients, rooms);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] 连接错误:', error);
      handleDisconnect(sessionId, clients, rooms);
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
 * 处理 WebSocket 消息
 */
async function handleMessage(ws, sessionId, data, authenticated, clients, rooms) {
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

    clients.set(sessionId, {
      ws,
      userId: user.id,
      email: user.email,
      username: user.username
    });

    send(ws, { 
      type: 'auth_success', 
      userId: user.id,
      username: user.username 
    });

    console.log(`[WebSocket] 认证成功：${user.username} (${sessionId})`);
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
function handleDisconnect(sessionId, clients, rooms) {
  const client = clients.get(sessionId);
  if (client) {
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

    clients.delete(sessionId);
    console.log(`[WebSocket] 断开连接：${sessionId} (${client.username})`);
  }
}

/**
 * 发送消息
 */
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * 生成会话 ID
 */
function generateSessionId() {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = { setupWebSocket };
