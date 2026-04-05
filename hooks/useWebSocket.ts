import { useEffect, useRef, useCallback, useState } from 'react';
import { getAuthToken } from '../services/auth';

interface UseWebSocketOptions {
  projectId?: number;
  resourceId?: number;
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onTaskStatus?: (data: TaskStatusMessage) => void;
  onError?: (error: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export interface TaskStatusMessage {
  type: 'task_status';
  jobId: number;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  taskId?: number;
  taskStatus?: string;
  timestamp: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sessionId: string | null;
  send: (data: any) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  subscribeTask: (jobId: number) => void;
  unsubscribeTask: (jobId: number) => void;
  broadcastCursor: (cursor: any) => void;
  broadcastEdit: (edits: any[]) => void;
  onlineUsers: Array<{ sessionId: string; userId: number; username: string }>;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    projectId,
    resourceId,
    enabled = true,
    onMessage,
    onTaskStatus,
    onError,
    onConnect,
    onDisconnect
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Array<{ sessionId: string; userId: number; username: string }>>([]);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      const wsUrl = `ws://localhost:4001`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] 已连接');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // 发送认证消息
        const token = getAuthToken();
        if (token) {
          ws.send(JSON.stringify({
            type: 'auth',
            token
          }));
        }

        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'auth_success':
              console.log('[WebSocket] 认证成功:', data.username);
              if (projectId && resourceId) {
                const roomId = `resource_${resourceId}`;
                ws.send(JSON.stringify({
                  type: 'join_room',
                  roomId,
                  projectId,
                  resourceId
                }));
              }
              setSessionId(data.sessionId);
              break;
            case 'room_members':
              setOnlineUsers(data.members);
              break;
            case 'user_joined':
              console.log('[WebSocket] 用户加入:', data.username);
              setOnlineUsers(prev => [...prev, {
                sessionId: data.sessionId,
                userId: data.userId,
                username: data.username
              }]);
              break;
            case 'user_left':
              console.log('[WebSocket] 用户离开:', data.username);
              setOnlineUsers(prev => prev.filter(u => u.sessionId !== data.sessionId));
              break;
            case 'cursor_update':
            case 'resource_edit':
            case 'conflict_detected':
              onMessage?.(data);
              break;
            case 'task_status':
              onTaskStatus?.(data);
              break;
            case 'task_subscribed':
              console.log('[WebSocket] 任务订阅成功:', data.jobId);
              break;
            default:
              onMessage?.(data);
          }
        } catch (error) {
          console.error('[WebSocket] 消息解析失败:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] 错误:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        console.log('[WebSocket] 连接关闭');
        setIsConnected(false);
        setSessionId(null);
        onDisconnect?.();

        // 尝试重连
        if (reconnectAttempts.current < maxReconnectAttempts && enabled) {
          reconnectAttempts.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`[WebSocket] ${delay}ms 后重连 (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error('[WebSocket] 连接失败:', error);
      onError?.(error);
    }
  }, [enabled, projectId, resourceId, onMessage, onError, onConnect, onDisconnect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    send({ type: 'join_room', roomId, projectId, resourceId });
  }, [send, projectId, resourceId]);

  const leaveRoom = useCallback((roomId: string) => {
    send({ type: 'leave_room', roomId });
  }, [send]);

  const broadcastCursor = useCallback((cursor: any) => {
    send({ type: 'cursor_update', cursor });
  }, [send]);

  const broadcastEdit = useCallback((edits: any[]) => {
    send({ type: 'resource_edit', edits });
  }, [send]);

  const subscribeTask = useCallback((jobId: number) => {
    send({ type: 'subscribe_task', jobId });
  }, [send]);

  const unsubscribeTask = useCallback((jobId: number) => {
    send({ type: 'unsubscribe_task', jobId });
  }, [send]);

  return {
    isConnected,
    sessionId,
    send,
    joinRoom,
    leaveRoom,
    subscribeTask,
    unsubscribeTask,
    broadcastCursor,
    broadcastEdit,
    onlineUsers
  };
}

export default useWebSocket;
