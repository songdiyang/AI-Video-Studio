import { useEffect, useRef, useCallback } from 'react';
import { getAuthToken } from '../services/auth';

interface UseAutoSaveOptions {
  projectId: number;
  resourceId: number;
  resourceType: 'storyboard' | 'scene' | 'character';
  getData: () => any;
  interval?: number; // 保存间隔（毫秒），默认 5 分钟
  enabled?: boolean;
  onAutoSave?: (data: any) => void;
  onError?: (error: any) => void;
}

export function useAutoSave(options: UseAutoSaveOptions) {
  const {
    projectId,
    resourceId,
    resourceType,
    getData,
    interval = 5 * 60 * 1000, // 5 分钟
    enabled = true,
    onAutoSave,
    onError
  } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastDataRef = useRef<any>(null);

  const saveVersion = useCallback(async (data: any, isAutoSave = true) => {
    try {
      const token = getAuthToken();
      
      // 检测数据是否发生变化
      const currentDataStr = JSON.stringify(data);
      if (lastDataRef.current === currentDataStr) {
        console.log('[AutoSave] 数据未变化，跳过保存');
        return;
      }

      const response = await fetch('/api/version/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          resourceType,
          resourceId,
          versionLabel: isAutoSave ? '自动保存' : '手动保存',
          changeSummary: isAutoSave ? '系统自动保存' : '用户手动保存',
          changeDetails: {
            autoSave: isAutoSave,
            timestamp: new Date().toISOString()
          },
          snapshotData: data
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[AutoSave] 保存成功:', result);
        lastDataRef.current = currentDataStr;
        lastSaveTimeRef.current = Date.now();
        onAutoSave?.(result);
      } else {
        const error = await response.json();
        console.error('[AutoSave] 保存失败:', error);
        onError?.(error);
      }
    } catch (error) {
      console.error('[AutoSave] 保存异常:', error);
      onError?.(error);
    }
  }, [projectId, resourceId, resourceType, onAutoSave, onError]);

  const triggerAutoSave = useCallback(() => {
    if (!enabled) return;
    
    const data = getData();
    if (data) {
      saveVersion(data, true);
    }
  }, [enabled, getData, saveVersion]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      return;
    }

    // 立即保存一次
    triggerAutoSave();

    // 定时保存
    timerRef.current = setInterval(triggerAutoSave, interval);

    // 页面关闭前保存
    const handleBeforeUnload = () => {
      const data = getData();
      if (data) {
        // 使用 sendBeacon 确保数据发送成功
        const token = getAuthToken();
        const blob = new Blob([JSON.stringify({
          projectId,
          resourceType,
          resourceId,
          versionLabel: '页面关闭前自动保存',
          changeSummary: '用户离开页面前自动保存',
          snapshotData: data
        })], { type: 'application/json' });
        
        navigator.sendBeacon('/api/version/create', blob);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, interval, triggerAutoSave, getData, projectId, resourceId, resourceType]);

  // 手动触发保存
  const manualSave = useCallback(() => {
    const data = getData();
    if (data) {
      return saveVersion(data, false);
    }
    return Promise.reject(new Error('无数据可保存'));
  }, [getData, saveVersion]);

  // 获取上次保存时间
  const getLastSaveTime = useCallback(() => {
    return lastSaveTimeRef.current;
  }, []);

  return {
    manualSave,
    getLastSaveTime,
    lastSaveTime: lastSaveTimeRef.current
  };
}

export default useAutoSave;
