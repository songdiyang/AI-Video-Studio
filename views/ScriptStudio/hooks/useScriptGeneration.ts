/**
 * 剧本生成 Hook
 * 负责剧本生成和工作流轮询
 */

import { useState, useEffect } from 'react';
import { getAuthToken } from '../../../services/auth';
import { useWorkflow, consumeWorkflow } from '../../../hooks/useWorkflow';
import { Project, createProject } from '../../../services/projects';

const LAST_PROJECT_KEY = 'nanostory_last_project_id';

interface UseScriptGenerationProps {
  selectedProject: Project | null;
  setSelectedProject: (project: Project) => void;
  loadProjectScript: (projectId: number, episode?: number) => Promise<void>;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useScriptGeneration({
  selectedProject,
  setSelectedProject,
  loadProjectScript,
  onSuccess,
  onError
}: UseScriptGenerationProps) {
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [generatingScriptId, setGeneratingScriptId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEpisodeModal, setShowEpisodeModal] = useState(false);
  // 生成进度状态
  const [generationProgress, setGenerationProgress] = useState<{
    step: number;
    totalSteps: number;
    stepName: string;
    progress: number;
  } | null>(null);

  // 监听 generatingJobId 变化
  useEffect(() => {
    console.log('[useScriptGeneration] generatingJobId 变化:', generatingJobId);
  }, [generatingJobId]);

  // 检查并恢复下一个活跃工作流（只处理剧本生成类型）
  const checkAndResumeNextWorkflow = async () => {
    if (!selectedProject) return;
    
    try {
      console.log('[useScriptGeneration] 检查项目的剧本生成工作流...');
      const { getActiveWorkflows } = await import('../../../hooks/useWorkflow');
      const { jobs } = await getActiveWorkflows(selectedProject.id);
      
      if (jobs && jobs.length > 0) {
        // 只处理 script_only 类型的工作流
        const scriptJob = jobs.find((j: any) => j.workflow_type === 'script_only');
        
        if (scriptJob) {
          console.log('[useScriptGeneration] 发现剧本生成工作流:', scriptJob);
          
          // 查找对应的 script 记录
          const token = getAuthToken();
          const res = await fetch(`/api/scripts/project/${selectedProject.id}`, {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          });
          
          if (res.ok) {
            const data = await res.json();
            const generatingScript = data.scripts?.find((s: any) => s.status === 'generating');
            
            if (generatingScript) {
              console.log('[useScriptGeneration] 恢复工作流轮询:', scriptJob.id, 'scriptId:', generatingScript.id);
              setGeneratingJobId(scriptJob.id);
              setGeneratingScriptId(generatingScript.id);
            } else {
              // 没有对应的生成中剧本，清空状态
              console.log('[useScriptGeneration] 没有生成中的剧本，清空状态');
              setGeneratingJobId(null);
              setGeneratingScriptId(null);
            }
          }
        } else {
          console.log('[useScriptGeneration] 没有剧本生成工作流（可能是其他类型）');
          setGeneratingJobId(null);
          setGeneratingScriptId(null);
        }
      } else {
        console.log('[useScriptGeneration] 没有活跃工作流');
        setGeneratingJobId(null);
        setGeneratingScriptId(null);
      }
    } catch (error) {
      console.error('[useScriptGeneration] 检查活跃工作流失败:', error);
    }
  };

  // 页面加载时检查是否有未完成的工作流
  useEffect(() => {
    checkAndResumeNextWorkflow();
  }, [selectedProject]);

  // 使用 useWorkflow 轮询工作流状态
  const { job, isRunning, isCompleted, isFailed } = useWorkflow(generatingJobId, {
    onProgress: (progressJob) => {
      // 更新进度信息
      if (progressJob && progressJob.tasks) {
        const currentTask = progressJob.tasks.find((t: any) => t.status === 'processing');
        const completedCount = progressJob.tasks.filter((t: any) => t.status === 'completed').length;
        const totalTasks = progressJob.tasks.length;
        
        // 步骤名称映射
        const stepNameMap: Record<string, string> = {
          'script_generation': '生成剧本内容',
          'style_suggestion': '分析叙事风格',
          'context_loading': '加载前情回顾',
        };
        
        const stepName = currentTask 
          ? (stepNameMap[currentTask.task_type] || currentTask.task_type)
          : (completedCount === totalTasks ? '完成' : '准备中');
        
        const avgProgress = progressJob.tasks.reduce((sum: number, t: any) => sum + (t.progress || 0), 0) / totalTasks;
        
        setGenerationProgress({
          step: completedCount + (currentTask ? 1 : 0),
          totalSteps: totalTasks,
          stepName,
          progress: Math.round(avgProgress)
        });
      }
    },
    onCompleted: async (completedJob) => {
      console.log('[useScriptGeneration] 工作流完成回调触发:', completedJob);
      
      if (!generatingScriptId) {
        console.warn('[useScriptGeneration] generatingScriptId 为空，跳过保存');
        return;
      }
      
      // 保存重试逻辑（最多重试2次）
      const attemptSave = async (attempt: number): Promise<any> => {
        const token = getAuthToken();
        const res = await fetch('/api/scripts/save-from-workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            scriptId: generatingScriptId,
            jobId: completedJob.id
          })
        });

        const data = await res.json();
        console.log(`[useScriptGeneration] 保存响应 (尝试${attempt}):`, data);
        
        if (res.status === 402) {
          return { skip: true };
        }

        if (!res.ok) {
          // 500 错误且还有重试机会时，等待后重试
          if (res.status >= 500 && attempt < 3) {
            console.warn(`[useScriptGeneration] 保存失败 (${res.status})，${attempt}秒后重试...`);
            await new Promise(r => setTimeout(r, attempt * 1000));
            return attemptSave(attempt + 1);
          }
          throw new Error(data.message || data.detail || '保存失败');
        }

        return data;
      };

      try {
        console.log('[useScriptGeneration] 开始保存工作流结果...');
        const data = await attemptSave(1);
        
        if (data?.skip) {
          return;
        }

        console.log('[useScriptGeneration] 保存成功，刷新剧本列表...');
        // 刷新剧本列表
        if (selectedProject) {
          await loadProjectScript(selectedProject.id, data.episodeNumber);
          // 发送事件通知 StoryBoard 刷新剧本列表
          window.dispatchEvent(new CustomEvent('reload-scripts', {
            detail: { projectId: selectedProject.id, episodeNumber: data.episodeNumber }
          }));
        }
        
        // 标记工作流已消费
        await consumeWorkflow(completedJob.id);
        
        // 检查是否还有其他活跃工作流
        await checkAndResumeNextWorkflow();
      } catch (error: any) {
        console.error('保存剧本失败:', error);
        onError?.(`剧本生成完成但保存失败: ${error.message}`);
        // 即使保存失败，也刷新列表（可能状态已被后端重置为 draft）
        if (selectedProject) {
          await loadProjectScript(selectedProject.id);
        }
        // 即使保存失败，也检查下一个工作流
        await checkAndResumeNextWorkflow();
      } finally {
        setLoading(false);
        setGenerationProgress(null);
      }
    },
    onFailed: async (failedJob) => {
      setGenerationProgress(null);
      
      // 将生成中的剧本状态回滚为 draft（防止假死）
      if (generatingScriptId) {
        try {
          const token = getAuthToken();
          await fetch(`/api/scripts/${generatingScriptId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ status: 'draft' })
          });
          console.log('[useScriptGeneration] 剧本状态已回滚为 draft');
        } catch (e) {
          console.warn('[useScriptGeneration] 剧本状态回滚失败:', e);
        }
      }
      
      // 失败的工作流也标记为已消费
      try {
        await consumeWorkflow(failedJob.id);
      } catch (error) {
        console.error('标记工作流消费失败:', error);
      }
      
      // 检查是否还有其他活跃工作流
      console.log('[useScriptGeneration] 检查是否有其他活跃工作流...');
      await checkAndResumeNextWorkflow();
      
      setLoading(false);
    }
  });

  // 打开集数选择对话框
  const handleGenerateClick = (title: string, description: string) => {
    if (!description && !title) {
      onError?.('请至少填写标题或故事概述');
      return;
    }
    setShowEpisodeModal(true);
  };

  // 生成剧本
  const handleGenerate = async (
    episodeNumber: number,
    title: string,
    description: string,
    length: string,
    nextEpisode: number,
    textModel: string
  ) => {
    if (!description && !title) {
      onError?.('请至少填写标题或故事概述');
      return;
    }
    
    // 关闭对话框
    setShowEpisodeModal(false);

    let projectToUse = selectedProject;

    // 如果没有选择工程，自动创建一个
    if (!projectToUse) {
      try {
        const projectName = title || `新工程_${new Date().toLocaleDateString('zh-CN')}`;
        const newProject = await createProject({
          name: projectName,
          description: description || '',
          type: 'comic_drama',
          status: 'draft'
        });
        projectToUse = newProject;
        setSelectedProject(newProject);
        localStorage.setItem(LAST_PROJECT_KEY, newProject.id.toString());
      } catch (error: any) {
        console.error('自动创建工程失败:', error);
        if (error.code === 'PROJECT_LIMIT_REACHED') {
          onError?.(error.message || '项目数量已达上限，请删除不需要的项目后重试');
        } else {
          onError?.(error.message || '创建工程失败');
        }
        return;
      }
    }

    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          projectId: projectToUse.id,
          episodeNumber: episodeNumber || nextEpisode,
          title: title || `第${episodeNumber || nextEpisode}集`, 
          description, 
          length,
          textModel
        })
      });

      const data = await res.json();
      console.log('[useScriptGeneration] 生成API响应:', data);

      if (!res.ok) {
        throw new Error('生成失败');
      }

      console.log('[useScriptGeneration] 设置 generatingJobId:', data.jobId);
      console.log('[useScriptGeneration] 设置 generatingScriptId:', data.scriptId);
      
      // 启动工作流轮询
      setGeneratingJobId(data.jobId);
      setGeneratingScriptId(data.scriptId);
      
      console.log('[useScriptGeneration] 刷新剧本列表...');
      // 刷新剧本列表（显示生成中状态）
      await loadProjectScript(projectToUse.id, data.episodeNumber);
    } catch (error: any) {
      console.error('生成剧本失败:', error);
      setLoading(false);
    }
  };

  return {
    loading,
    showEpisodeModal,
    setShowEpisodeModal,
    handleGenerateClick,
    handleGenerate,
    // 新增：生成进度信息
    generationProgress,
    isGenerating: generatingJobId !== null && isRunning
  };
}
