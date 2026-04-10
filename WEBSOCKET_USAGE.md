# WebSocket 使用指南

## 服务架构

现在 WebSocket 服务已集成到 HTTP 服务器中：

- **HTTP API**: `http://localhost:4000`
- **WebSocket**: `ws://localhost:4000/ws`

## 前端连接示例

### 1. 使用原生 WebSocket API

```typescript
// 创建 WebSocket 连接
const ws = new WebSocket('ws://localhost:4000/ws');

// 连接成功
ws.onopen = () => {
  console.log('WebSocket 已连接');
  
  // 发送认证（需要 JWT token）
  const token = localStorage.getItem('auth_token');
  ws.send(JSON.stringify({
    type: 'auth',
    token: token
  }));
};

// 接收消息
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到消息:', data);
  
  switch (data.type) {
    case 'connected':
      console.log('连接成功，sessionId:', data.sessionId);
      break;
    case 'auth_success':
      console.log('认证成功，用户:', data.username);
      // 加入房间
      ws.send(JSON.stringify({
        type: 'join_room',
        roomId: 'project_123'
      }));
      break;
    case 'user_joined':
      console.log('用户加入:', data.username);
      break;
    case 'user_left':
      console.log('用户离开:', data.username);
      break;
    case 'broadcast':
      console.log('收到广播:', data);
      break;
    case 'cursor_update':
      // 更新其他用户的光标位置
      updateCursor(data.userId, data.position);
      break;
  }
};

// 错误处理
ws.onerror = (error) => {
  console.error('WebSocket 错误:', error);
};

// 断开连接
ws.onclose = () => {
  console.log('WebSocket 已断开');
  // 可以尝试重连
  setTimeout(connectWebSocket, 3000);
};

// 发送消息
function sendMessage(message: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// 广播消息到房间
function broadcastToRoom(message: any) {
  sendMessage({
    type: 'broadcast',
    ...message
  });
}

// 更新光标位置
function updateCursorPosition(position: { x: number, y: number }) {
  sendMessage({
    type: 'cursor_update',
    position: position
  });
}

// 心跳检测
setInterval(() => {
  sendMessage({ type: 'ping' });
}, 30000);
```

### 2. 使用 React Hook（推荐）

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
  projectId: string;
  resourceId?: string;
  onMessage?: (data: any) => void;
  autoReconnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  const connect = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.warn('缺少认证令牌');
      return;
    }

    const ws = new WebSocket('ws://localhost:4000/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket 已连接');
      setIsConnected(true);
      
      // 发送认证
      ws.send(JSON.stringify({
        type: 'auth',
        token
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'auth_success':
          console.log('认证成功');
          // 加入项目房间
          ws.send(JSON.stringify({
            type: 'join_room',
            roomId: `project_${options.projectId}`
          }));
          break;
        
        case 'user_joined':
          setOnlineUsers(prev => [...prev, { 
            id: data.userId, 
            username: data.username 
          }]);
          break;
        
        case 'user_left':
          setOnlineUsers(prev => prev.filter(u => u.id !== data.userId));
          break;
        
        case 'cursor_update':
          // 处理光标更新
          break;
        
        case 'broadcast':
          // 处理广播消息
          options.onMessage?.(data);
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket 断开连接');
      
      if (options.autoReconnect !== false) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };
  }, [options.projectId, options.resourceId, options.onMessage]);

  useEffect(() => {
    connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const broadcast = useCallback((data: any) => {
    sendMessage({
      type: 'broadcast',
      ...data
    });
  }, [sendMessage]);

  const updateCursor = useCallback((position: { x: number, y: number }) => {
    sendMessage({
      type: 'cursor_update',
      position
    });
  }, [sendMessage]);

  return {
    isConnected,
    onlineUsers,
    sendMessage,
    broadcast,
    updateCursor
  };
}
```

### 3. 在组件中使用

```typescript
import React from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

function StoryboardEditor({ projectId, storyboardId }: Props) {
  const { isConnected, onlineUsers, broadcast, updateCursor } = useWebSocket({
    projectId,
    resourceId: storyboardId,
    onMessage: (data) => {
      console.log('收到协作消息:', data);
      // 处理实时协作更新
    }
  });

  return (
    <div>
      {/* 在线用户列表 */}
      <div className="online-users">
        <span>在线：{onlineUsers.length} 人</span>
        {onlineUsers.map(user => (
          <div key={user.id}>{user.username}</div>
        ))}
      </div>

      {/* 连接状态 */}
      {!isConnected && (
        <div className="connection-lost">
          连接断开，正在重连...
        </div>
      )}

      {/* 编辑区域 */}
      <div 
        onMouseMove={(e) => {
          // 实时上报光标位置
          updateCursor({
            x: e.clientX,
            y: e.clientY
          });
        }}
      >
        {/* 分镜编辑内容 */}
      </div>

      {/* 广播按钮 */}
      <button onClick={() => {
        broadcast({
          type: 'notification',
          message: '我完成了一个修改'
        });
      }}>
        通知团队成员
      </button>
    </div>
  );
}
```

## 消息类型说明

### 客户端 → 服务端

| 类型 | 说明 | 数据格式 |
|------|------|----------|
| `auth` | 认证 | `{ type: 'auth', token: string }` |
| `join_room` | 加入房间 | `{ type: 'join_room', roomId: string }` |
| `leave_room` | 离开房间 | `{ type: 'leave_room', roomId: string }` |
| `broadcast` | 广播消息 | `{ type: 'broadcast', ...data }` |
| `cursor_update` | 光标更新 | `{ type: 'cursor_update', position: { x, y } }` |
| `ping` | 心跳检测 | `{ type: 'ping' }` |

### 服务端 → 客户端

| 类型 | 说明 | 数据格式 |
|------|------|----------|
| `connected` | 连接成功 | `{ type: 'connected', sessionId: string }` |
| `auth_success` | 认证成功 | `{ type: 'auth_success', userId, username }` |
| `auth_error` | 认证失败 | `{ type: 'auth_error', message: string }` |
| `user_joined` | 用户加入房间 | `{ type: 'user_joined', roomId, userId, username }` |
| `user_left` | 用户离开房间 | `{ type: 'user_left', roomId, userId, username }` |
| `broadcast` | 广播消息 | `{ type: 'broadcast', fromUserId, fromUsername, ...data }` |
| `cursor_update` | 光标更新 | `{ type: 'cursor_update', userId, username, position }` |
| `pong` | 心跳响应 | `{ type: 'pong', timestamp }` |

## 使用场景

### 1. 实时协作编辑

```typescript
// 当用户编辑分镜时，实时同步给其他协作者
function handleFrameEdit(frameId: string, changes: any) {
  broadcast({
    type: 'frame_edit',
    frameId,
    changes,
    timestamp: Date.now()
  });
}
```

### 2. 在线状态显示

```typescript
// 显示当前在线的协作者
function OnlineUsersList({ projectId }: { projectId: string }) {
  const { onlineUsers } = useWebSocket({ projectId });
  
  return (
    <div>
      <h3>在线成员 ({onlineUsers.length})</h3>
      {onlineUsers.map(user => (
        <div key={user.id} className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span>{user.username}</span>
        </div>
      ))}
    </div>
  );
}
```

### 3. 实时通知

```typescript
// 当有其他协作者加入或离开时显示通知
function CollaborationNotifications() {
  const { isConnected } = useWebSocket({ projectId: '123' });
  
  useEffect(() => {
    if (isConnected) {
      toast.success('已连接到协作服务器');
    }
  }, [isConnected]);
  
  return null;
}
```

### 4. 自动保存同步

```typescript
// 当自动保存时，通知其他协作者
function useAutoSaveWithSync(options: AutoSaveOptions) {
  const { broadcast } = useWebSocket(options);
  
  const save = useCallback(async (data: any) => {
    // 保存到服务器
    await api.save(data);
    
    // 通知其他协作者
    broadcast({
      type: 'autosave',
      timestamp: Date.now(),
      savedBy: currentUser.username
    });
  }, [broadcast]);
  
  return { save };
}
```

## 注意事项

1. **认证优先**：连接后必须先认证才能使用其他功能
2. **心跳检测**：每 30 秒发送一次 ping 保持连接
3. **自动重连**：断开后 3 秒自动重连
4. **错误处理**：始终检查 `readyState` 再发送消息
5. **资源清理**：组件卸载时关闭连接

## 测试工具

可以使用浏览器控制台测试：

```javascript
// 1. 连接
const ws = new WebSocket('ws://localhost:4000/ws');

// 2. 认证（替换为你的 token）
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};

// 3. 监听消息
ws.onmessage = (e) => {
  console.log('收到:', JSON.parse(e.data));
};

// 4. 加入房间
setTimeout(() => {
  ws.send(JSON.stringify({
    type: 'join_room',
    roomId: 'project_1'
  }));
}, 1000);
```
