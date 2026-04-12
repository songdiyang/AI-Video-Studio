require('dotenv').config();
const WebSocket = require('ws');
const { queryOne, execute } = require('./dbHelper');
const jwt = require('jsonwebtoken');

class CollaborationServer {
  constructor(port = 4001) {
    this.wss = new WebSocket.Server({ port });
    this.clients = new Map(); // sessionId -> { ws, userId, projectId, resourceId }
    this.rooms = new Map(); // roomId -> Set<sessionId>
    
    this.setup();
    console.log(`[WebSocket] 协作服务器启动在端口 ${port}`);
  }

  setup() {
    this.wss.on('connection', (ws, req) => {
      const sessionId = this.generateSessionId();
      let authenticated = false;

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, sessionId, data, authenticated);
        } catch (error) {
          console.error('[WebSocket] 消息处理失败:', error);
          this.send(ws, { type: 'error', message: '消息处理失败' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(sessionId);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] 连接错误:', error);
        this.handleDisconnect(sessionId);
      });

      // 发送连接成功消息
      this.send(ws, { type: 'connected', sessionId });
    });
  }

  async handleMessage(ws, sessionId, data, authenticated) {
    switch (data.type) {
      case 'auth':
        authenticated = await this.authenticate(ws, sessionId, data);
        break;
      case 'join_room':
        this.joinRoom(ws, sessionId, data);
        break;
      case 'leave_room':
        this.leaveRoom(sessionId, data.roomId);
        break;
      case 'cursor_update':
        this.broadcastCursor(sessionId, data);
        break;
      case 'resource_edit':
        this.broadcastEdit(sessionId, data);
        break;
      case 'conflict_detect':
        this.handleConflictDetection(sessionId, data);
        break;
      default:
        console.warn('[WebSocket] 未知消息类型:', data.type);
    }
  }

  async authenticate(ws, sessionId, data) {
    try {
      const { token } = data;
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await queryOne(`SELECT id, email, IFNULL(NULLIF(nickname, ''), email) as username FROM users WHERE id = ?`, [decoded.userId]);
      
      if (!user) return false;

      this.clients.set(sessionId, {
        ws,
        userId: user.id,
        username: user.username,
        email: user.email,
        projectId: null,
        resourceId: null
      });

      this.send(ws, { 
        type: 'auth_success', 
        userId: user.id,
        username: user.username 
      });
      return true;
    } catch (error) {
      console.error('[WebSocket] 认证失败:', error);
      this.send(ws, { type: 'auth_failed', message: '认证失败' });
      return false;
    }
  }

  joinRoom(ws, sessionId, data) {
    const { roomId, projectId, resourceId } = data;
    const client = this.clients.get(sessionId);
    
    if (!client) return;

    client.projectId = projectId;
    client.resourceId = resourceId;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(sessionId);

    // 通知房间内其他人有新成员加入
    this.broadcast(roomId, {
      type: 'user_joined',
      userId: client.userId,
      username: client.username,
      sessionId
    }, sessionId);

    // 发送当前房间成员列表
    const members = Array.from(this.rooms.get(roomId)).map(id => {
      const c = this.clients.get(id);
      return {
        sessionId: id,
        userId: c?.userId,
        username: c?.username
      };
    });

    this.send(ws, { type: 'room_members', members });
  }

  leaveRoom(sessionId, roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(sessionId);
      this.broadcast(roomId, {
        type: 'user_left',
        sessionId
      });
    }
  }

  broadcastCursor(sessionId, data) {
    const client = this.clients.get(sessionId);
    if (!client || !client.resourceId) return;

    const roomId = `resource_${client.resourceId}`;
    this.broadcast(roomId, {
      type: 'cursor_update',
      sessionId,
      username: client.username,
      cursor: data.cursor,
      selection: data.selection
    }, sessionId);
  }

  broadcastEdit(sessionId, data) {
    const client = this.clients.get(sessionId);
    if (!client || !client.resourceId) return;

    const roomId = `resource_${client.resourceId}`;
    this.broadcast(roomId, {
      type: 'resource_edit',
      sessionId,
      username: client.username,
      edits: data.edits,
      timestamp: Date.now()
    }, sessionId);
  }

  handleConflictDetection(sessionId, data) {
    const client = this.clients.get(sessionId);
    if (!client) return;

    const roomId = `resource_${client.resourceId}`;
    const room = this.rooms.get(roomId);
    
    if (!room) return;

    // 检测是否有其他用户正在编辑同一资源
    const conflicts = [];
    room.forEach(id => {
      if (id !== sessionId) {
        const c = this.clients.get(id);
        if (c && c.resourceId === client.resourceId) {
          conflicts.push({
            sessionId: id,
            username: c.username,
            userId: c.userId
          });
        }
      }
    });

    if (conflicts.length > 0) {
      this.send(this.clients.get(sessionId).ws, {
        type: 'conflict_detected',
        conflicts
      });
    }
  }

  handleDisconnect(sessionId) {
    const client = this.clients.get(sessionId);
    if (client) {
      // 通知所有房间
      this.rooms.forEach((members, roomId) => {
        if (members.has(sessionId)) {
          this.broadcast(roomId, {
            type: 'user_left',
            sessionId,
            username: client.username
          });
          members.delete(sessionId);
        }
      });
      this.clients.delete(sessionId);
    }
  }

  broadcast(roomId, message, excludeSessionId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.forEach(sessionId => {
      if (sessionId !== excludeSessionId) {
        const client = this.clients.get(sessionId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
          this.send(client.ws, message);
        }
      }
    });
  }

  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 启动协作服务器
const COLLAB_PORT = process.env.COLLAB_PORT || 4001;
new CollaborationServer(COLLAB_PORT);

module.exports = CollaborationServer;
