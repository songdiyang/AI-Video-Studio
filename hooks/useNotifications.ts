import { useEffect, useState, useCallback } from 'react';
import { getAuthToken } from '../services/auth';

interface Notification {
  id: number;
  user_id: number;
  notification_type: 'comment' | 'mention' | 'version_change' | 'invite' | 'conflict';
  title: string;
  message: string;
  payload?: any;
  is_read: boolean;
  created_at: string;
}

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  subscribe: (type: Notification['notification_type'], options?: any) => Promise<void>;
  unsubscribe: (type: Notification['notification_type']) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/notifications', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('[Notifications] 加载通知失败:', error);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('[Notifications] 标记已读失败:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('[Notifications] 标记全部已读失败:', error);
    }
  }, []);

  const subscribe = useCallback(async (type: Notification['notification_type'], options?: any) => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          notificationType: type,
          ...options
        })
      });

      if (res.ok) {
        console.log('[Notifications] 订阅成功:', type);
      }
    } catch (error) {
      console.error('[Notifications] 订阅失败:', error);
    }
  }, []);

  const unsubscribe = useCallback(async (type: Notification['notification_type']) => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          notificationType: type
        })
      });

      if (res.ok) {
        console.log('[Notifications] 取消订阅成功:', type);
      }
    } catch (error) {
      console.error('[Notifications] 取消订阅失败:', error);
    }
  }, []);

  useEffect(() => {
    loadNotifications();

    // 轮询新通知（每 30 秒）
    const interval = setInterval(loadNotifications, 30000);

    return () => clearInterval(interval);
  }, [loadNotifications]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    subscribe,
    unsubscribe,
    refresh: loadNotifications
  };
}

export default useNotifications;
