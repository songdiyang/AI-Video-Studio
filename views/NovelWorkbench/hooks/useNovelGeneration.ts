/**
 * 小说AI生成任务管理 Hook
 */

import { useCallback } from 'react';
import { getAuthToken } from '../../../services/auth';
import { useTaskRunner } from '../../../hooks/useTaskRunner';

export interface NovelProject {
  id: number;
  project_id: number;
  world_view?: string;
  plot_summary?: string;
  genre?: string;
  target_word_count?: number;
}

export function useNovelGeneration(projectId: number) {
  const { tasks, runTask, recoverTasks, clearTask, isRunning } = useTaskRunner({
    projectId,
    maxRetries: 1,
  });

  // 生成世界观
  const generateWorldView = useCallback(async (params: {
    description?: string;
    genre?: string;
    modelName?: string;
  }) => {
    const taskKey = `worldview_${projectId}`;
    
    try {
      // 先调用API创建任务
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/worldview/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        throw new Error('生成世界观失败');
      }
    } catch (error: any) {
      throw new Error(error.message || '生成世界观失败');
    }
  }, [projectId]);

  // 生成章节
  const generateChapter = useCallback(async (params: {
    chapterId: number;
    chapterNumber: number;
    chapterTitle: string;
    generationType?: 'full' | 'continuation' | 'revision';
    modelName?: string;
  }) => {
    const { chapterId, chapterNumber, chapterTitle, generationType = 'full', modelName } = params;
    const taskKey = `chapter_${chapterId}`;
    
    // 检查是否已有任务在运行
    if (tasks[taskKey] && (tasks[taskKey].status === 'pending' || tasks[taskKey].status === 'running')) {
      throw new Error('该章节正在生成中，请稍候');
    }

    try {
      // 调用API触发异步任务
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/chapters/${chapterId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          modelName,
          generationType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        const error = await res.json();
        throw new Error(error.message || '生成章节失败');
      }
    } catch (error: any) {
      throw new Error(error.message || '生成章节失败');
    }
  }, [projectId, tasks]);

  // 获取章节生成历史
  const getChapterGenerations = useCallback(async (chapterId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/chapters/${chapterId}/generations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        return data.generations || [];
      } else {
        throw new Error('获取生成历史失败');
      }
    } catch (error: any) {
      throw new Error(error.message || '获取生成历史失败');
    }
  }, [projectId]);

  // 获取小说完整上下文（用于AI生成）
  const getNovelContext = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/novels/${projectId}/context`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        return await res.json();
      } else {
        throw new Error('获取小说上下文失败');
      }
    } catch (error: any) {
      throw new Error(error.message || '获取小说上下文失败');
    }
  }, [projectId]);

  // 获取章节的任务状态
  const getChapterTaskState = useCallback((chapterId: number) => {
    return tasks[`chapter_${chapterId}`] || null;
  }, [tasks]);

  // 清除章节任务状态
  const clearChapterTask = useCallback((chapterId: number) => {
    clearTask(`chapter_${chapterId}`);
  }, [clearTask]);

  // 恢复未完成的章节生成任务
  const recoverChapterTasks = useCallback(() => {
    recoverTasks(
      ['novel_chapter_generation'],
      (job) => {
        const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
        const chapterId = params?.chapterId;
        return chapterId ? `chapter_${chapterId}` : null;
      }
    );
  }, [recoverTasks]);

  return {
    tasks,
    isRunning,
    generateWorldView,
    generateChapter,
    getChapterGenerations,
    getNovelContext,
    getChapterTaskState,
    clearChapterTask,
    recoverChapterTasks,
  };
}
