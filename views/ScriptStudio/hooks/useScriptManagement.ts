/**
 * 剧本管理 Hook
 * 负责加载、保存、删除剧本
 */

import { useState } from 'react';
import { getAuthToken } from '../../../services/auth';
import { startWorkflow } from '../../../hooks/useWorkflow';
import type { SplitEpisode } from '../ScriptSplitPreview';

export interface Script {
  id: number;
  episode_number: number;
  title: string;
  content: string;
  draft_description?: string;
  draft_length?: string;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  created_at: string;
}

interface UseScriptManagementOptions {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useScriptManagement(options: UseScriptManagementOptions = {}) {
  const { onSuccess, onError } = options;
  const [scripts, setScripts] = useState<Script[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [nextEpisode, setNextEpisode] = useState(1);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loadingScript, setLoadingScript] = useState(false);
  const [loading, setLoading] = useState(false);

  // 加载项目的所有剧本
  const loadProjectScript = async (projectId: number, episode?: number) => {
    try {
      setLoadingScript(true);
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/project/${projectId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        setScripts(data.scripts || []);
        setNextEpisode(data.nextEpisode || 1);
        
        // 选择指定集或默认第一集
        const targetEpisode = episode || (data.scripts.length > 0 ? data.scripts[0].episode_number : 1);
        setCurrentEpisode(targetEpisode);
        
        const currentScript = data.scripts.find((s: any) => s.episode_number === targetEpisode);
        if (currentScript) {
          setScriptId(currentScript.id);
          setTitle(currentScript.title || '');
          setContent(currentScript.content);
        } else {
          setScriptId(null);
          setTitle('');
          setContent('');
        }
      }
    } catch (error) {
      console.error('加载剧本失败:', error);
    } finally {
      setLoadingScript(false);
    }
  };

  // 切换集数
  const handleEpisodeChange = (episode: number) => {
    const script = scripts.find(s => s.episode_number === episode);
    setCurrentEpisode(episode);
    if (script) {
      setScriptId(script.id);
      setTitle(script.title || '');
      setContent(script.content);
    } else {
      setScriptId(null);
      setTitle('');
      setContent('');
    }
  };

  // 保存剧本
  const handleSaveScript = async () => {
    if (!scriptId || !content) {
      onError?.('没有可保存的内容');
      return;
    }

    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/${scriptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ title, content })
      });

      const data = await res.json();
      if (res.ok) {
        return true;
      } else {
        throw new Error('保存失败');
      }
    } catch (error: any) {
      console.error('保存剧本失败:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 删除某集（分镜+剧本+返回孤立资源）
  interface OrphanResource { id: number; name: string; image_url?: string; }
  interface DeleteEpisodeResult {
    success: boolean;
    message: string;
    orphanCharacters?: OrphanResource[];
    orphanScenes?: OrphanResource[];
  }

  const handleDeleteScript = async (): Promise<DeleteEpisodeResult> => {
    if (!scriptId) return { success: false, message: '没有可删除的剧本' };

    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/${scriptId}/episode`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      if (res.ok) {
        setScriptId(null);
        setTitle('');
        setContent('');
        return {
          success: true,
          message: '',
          orphanCharacters: data.orphanCharacters || [],
          orphanScenes: data.orphanScenes || []
        };
      } else {
        return { success: false, message: '' };
      }
    } catch (error: any) {
      console.error('删除剧本失败:', error);
      return { success: false, message: '删除剧本失败，请稍后重试' };
    } finally {
      setLoading(false);
    }
  };

  // 清理孤立角色/场景
  const handleCleanOrphans = async (characterIds: number[], sceneIds: number[]): Promise<boolean> => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/scripts/clean-orphans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ characterIds, sceneIds })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  // 手动创建剧本
  const handleCreateScript = async (projectId: number, scriptTitle: string, scriptContent: string, episodeNumber: number) => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch('/api/scripts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          title: scriptTitle || `第${episodeNumber}集`,
          content: scriptContent,
          episodeNumber
        })
      });
      const data = await res.json();
      if (res.ok) {
        await loadProjectScript(projectId, data.episodeNumber);
        return { success: true, message: '' };
      } else {
        return { success: false, message: '' };
      }
    } catch (error: any) {
      console.error('手动创建剧本失败:', error);
      return { success: false, message: '保存失败，请稍后重试' };
    } finally {
      setLoading(false);
    }
  };

  // 创建或更新草稿
  const handleCreateDraft = async (projectId: number, episodeNumber: number, draftTitle?: string, description?: string, length?: string, content?: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/scripts/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          episodeNumber,
          title: draftTitle || `第${episodeNumber}集`,
          description: description || '',
          length: length || '短篇',
          content: content || ''
        })
      });
      const data = await res.json();
      if (res.ok) {
        // 重新加载剧本列表以显示草稿
        await loadProjectScript(projectId);
        return { success: true, scriptId: data.scriptId, message: '' };
      } else {
        return { success: false, message: '' };
      }
    } catch (error: any) {
      console.error('创建草稿失败:', error);
      return { success: false, message: '创建草稿失败，请稍后重试' };
    }
  };

  // 保存草稿内容
  const handleSaveDraft = async (draftScriptId: number, draftTitle?: string, draftContent?: string, description?: string, length?: string) => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/draft/${draftScriptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title: draftTitle,
          content: draftContent,
          description,
          length
        })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: '', savedAt: data.savedAt };
      } else {
        return { success: false, message: '' };
      }
    } catch (error: any) {
      console.error('保存草稿失败:', error);
      return { success: false, message: '保存草稿失败，请稍后重试' };
    } finally {
      setLoading(false);
    }
  };

  // 删除草稿
  const handleDeleteDraft = async (draftScriptId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/scripts/draft/${draftScriptId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      return res.ok ? { success: true, message: '' } : { success: false, message: '' };
    } catch (error: any) {
      console.error('删除草稿失败:', error);
      return { success: false, message: '删除草稿失败，请稍后重试' };
    }
  };

  // 智能拆集：调用 script_split 工作流
  const handleScriptSplit = async (
    rawText: string,
    minutesPerEpisode: number,
    projectId: number,
    textModel: string
  ): Promise<SplitEpisode[] | null> => {
    try {
      setLoading(true);
      console.log('[useScriptManagement] 启动智能拆集...', { textLength: rawText.length, minutesPerEpisode });

      const { jobId } = await startWorkflow('script_split', projectId, {
        rawText,
        minutesPerEpisode,
        textModel,
        projectId
      });

      // 轮询工作流结果
      const { getWorkflowStatus } = await import('../../../hooks/useWorkflow');
      const maxAttempts = 120; // 最多等 2 分钟
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;

        try {
          const job = await getWorkflowStatus(jobId);
          if (job.status === 'completed') {
            const taskResult = job.tasks?.[0]?.result_data;
            const episodes = taskResult?.episodes || [];
            console.log('[useScriptManagement] 拆集完成:', episodes.length, '集');
            return episodes;
          } else if (job.status === 'failed' || job.status === 'cancelled') {
            const errMsg = job.tasks?.[0]?.error_message || '拆集失败';
            onError?.(errMsg);
            return null;
          }
        } catch (pollErr: any) {
          console.warn('[useScriptManagement] 轮询拆集结果失败:', pollErr.message);
        }
      }

      onError?.('拆集超时，请重试');
      return null;
    } catch (error: any) {
      console.error('[useScriptManagement] 拆集失败:', error);
      onError?.(error.message || '拆集失败');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 批量创建多集剧本
  const handleBatchCreateEpisodes = async (
    episodes: SplitEpisode[],
    projectId: number
  ): Promise<boolean> => {
    try {
      setLoading(true);
      const token = getAuthToken();
      let successCount = 0;

      for (const episode of episodes) {
        const res = await fetch('/api/scripts/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            projectId,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            content: episode.content,
            status: 'completed'
          })
        });

        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json().catch(() => ({}));
          console.error(`[useScriptManagement] 创建第${episode.episodeNumber}集失败:`, data.message);
        }
      }

      if (successCount === episodes.length) {
        onSuccess?.(`成功创建 ${successCount} 集剧本`);
        return true;
      } else if (successCount > 0) {
        onSuccess?.(`已创建 ${successCount}/${episodes.length} 集`);
        return true;
      } else {
        onError?.('创建剧本失败');
        return false;
      }
    } catch (error: any) {
      console.error('[useScriptManagement] 批量创建失败:', error);
      onError?.(error.message || '批量创建失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    // 状态
    scripts,
    currentEpisode,
    nextEpisode,
    scriptId,
    title,
    content,
    loadingScript,
    loading,
    // Setters
    setTitle,
    setContent,
    setCurrentEpisode,
    setScriptId,
    // 方法
    loadProjectScript,
    handleEpisodeChange,
    handleSaveScript,
    handleCreateScript,
    handleCreateDraft,
    handleSaveDraft,
    handleDeleteDraft,
    handleDeleteScript,
    handleCleanOrphans,
    handleScriptSplit,
    handleBatchCreateEpisodes
  };
}
