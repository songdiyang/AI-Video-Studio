/**
 * 短视频工作台
 * 包含视频脚本、时间轴编辑、特效添加三个功能模块
 * 架构对齐漫剧工作台(ComicDramaWorkbench)
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Spinner, Button, Textarea, Input, Slider } from '@heroui/react';
import { Wand2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { Project, fetchProject } from '../../services/projects';
import { VideoEffect } from '../../types/projectTypes';
import { useAIModels } from '../../hooks/useAIModels';
import { useTaskRunner } from '../../hooks/useTaskRunner';
import type { VideoClip } from './TimelineEditor';

// 懒加载子组件
const TimelineEditor = lazy(() => import('./TimelineEditor'));
const EffectsEditor = lazy(() => import('./EffectsEditor'));

// ==================== 类型定义 ====================

interface ShortVideoWorkbenchProps {
  projectId: number;
  activeTab: string;
}

// ==================== 加载占位组件 ====================

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[300px]">
    <Spinner size="lg" color="primary" />
  </div>
);

// ==================== 视频脚本面板 ====================

interface VideoScriptPanelProps {
  projectId: number;
  onScriptGenerated?: (script: string) => void;
  aiModels?: ReturnType<typeof useAIModels>;
  runTask?: ReturnType<typeof useTaskRunner>['runTask'];
  tasks?: ReturnType<typeof useTaskRunner>['tasks'];
}

const VideoScriptPanel: React.FC<VideoScriptPanelProps> = ({
  projectId,
  onScriptGenerated,
  aiModels,
  runTask,
  tasks,
}) => {
  const { showToast } = useToast();
  const [script, setScript] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const taskKey = `script_${projectId}`;
  const currentTask = tasks?.[taskKey];
  const isTaskRunning = currentTask?.status === 'pending' || currentTask?.status === 'running';

  // 加载脚本
  useEffect(() => {
    const loadScript = async () => {
      setLoading(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/video/script`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setScript(data.content || '');
          setTitle(data.title || '');
          setDuration(data.duration || 60);
        }
      } catch {
        // 静默处理
      } finally {
        setLoading(false);
      }
    };
    loadScript();
  }, [projectId]);

  // 监听任务完成
  useEffect(() => {
    if (currentTask?.status === 'completed' && currentTask.result) {
      setScript(currentTask.result.content || currentTask.result);
      onScriptGenerated?.(currentTask.result.content || currentTask.result);
      showToast('脚本生成成功', 'success');
    } else if (currentTask?.status === 'failed') {
      showToast(currentTask.error || '生成失败', 'error');
    }
  }, [currentTask?.status, currentTask?.result, currentTask?.error, showToast, onScriptGenerated]);

  // AI 生成脚本
  const handleGenerate = async () => {
    if (!title.trim()) {
      showToast('请输入视频标题/主题', 'warning');
      return;
    }

    // 如果有 runTask，使用工作流方式
    if (runTask) {
      try {
        await runTask(taskKey, 'video_script_generation', {
          title,
          duration,
          projectId,
          modelName: aiModels?.selected.text,
        });
      } catch (err: any) {
        showToast(err.message || '启动生成任务失败', 'error');
      }
      return;
    }

    // 降级：直接调用 API
    setGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/video/script/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, duration }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setScript(data.content || '');
        onScriptGenerated?.(data.content);
        showToast('脚本生成成功', 'success');
      } else {
        // 模拟生成
        const mockScript = `【短视频脚本】${title}
时长：${duration}秒

=== 开场 (0-5秒) ===
画面：开场画面描述
旁白/字幕：开场语

=== 正文 (5-${duration - 10}秒) ===
画面：主要内容画面
旁白/字幕：主要内容解说

=== 结尾 (${duration - 10}-${duration}秒) ===
画面：结束画面
旁白/字幕：结束语/行动号召`;
        setScript(mockScript);
        showToast('已生成示例脚本', 'info');
      }
    } catch {
      showToast('生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // 保存脚本
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      await fetch(`/api/projects/${projectId}/video/script`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title, content: script, duration }),
      });
      showToast('保存成功', 'success');
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部配置区 */}
      <div className="p-4 border-b border-[var(--border-color)] space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="视频标题/主题"
            placeholder="输入视频的主题或标题"
            value={title}
            onValueChange={setTitle}
            classNames={{
              input: "bg-transparent text-[var(--text-primary)]",
              inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
            }}
          />
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">
              目标时长: {duration}秒
            </label>
            <Slider
              size="sm"
              step={5}
              minValue={15}
              maxValue={180}
              value={duration}
              onChange={(val) => setDuration(val as number)}
              classNames={{
                track: "bg-[var(--bg-input)]",
                filler: "bg-[var(--accent)]"
              }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            color="primary"
            startContent={<Wand2 className="w-4 h-4" />}
            isLoading={generating || isTaskRunning}
            onPress={handleGenerate}
          >
            {isTaskRunning ? `生成中 ${currentTask?.progress || 0}%` : 'AI 生成脚本'}
          </Button>
          <Button
            variant="flat"
            isLoading={saving}
            onPress={handleSave}
          >
            保存脚本
          </Button>
        </div>
      </div>

      {/* 脚本编辑区 */}
      <div className="flex-1 p-4">
        <Textarea
          value={script}
          onValueChange={setScript}
          placeholder={`【短视频脚本模板】

=== 开场 (0-5秒) ===
画面：...
旁白/字幕：...

=== 正文 ===
画面：...
旁白/字幕：...

=== 结尾 ===
画面：...
旁白/字幕：...`}
          minRows={20}
          classNames={{
            base: "h-full",
            input: "h-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-sm",
            inputWrapper: "h-full bg-[var(--bg-input)] border border-[var(--border-color)]"
          }}
        />
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const ShortVideoWorkbench: React.FC<ShortVideoWorkbenchProps> = ({ projectId, activeTab }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  
  // 项目状态
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [effects, setEffects] = useState<VideoEffect[]>([]);
  const [loading, setLoading] = useState(true);
  
  // AI 模型配置
  const aiModels = useAIModels(projectId);
  
  // 任务运行器
  const { tasks, runTask, recoverTasks, clearTask, isRunning } = useTaskRunner({
    projectId,
    interval: 500,
    maxRetries: 2,
  });

  // 加载项目数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const projectData = await fetchProject(projectId);
        setProject(projectData);
        
        // 加载视频片段
        const token = getAuthToken();
        const res = await fetch(`/api/projects/${projectId}/video/clips`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          // 转换为 VideoClip 格式
          const loadedClips: VideoClip[] = (data.clips || []).map((clip: any) => ({
            id: clip.id || `clip_${Date.now()}_${Math.random()}`,
            type: clip.type || 'video',
            name: clip.name || '未命名片段',
            startTime: clip.startTime || clip.start_time || 0,
            duration: clip.duration || 5,
            track: clip.track || 0,
            thumbnailUrl: clip.thumbnailUrl || clip.thumbnail,
            color: clip.color,
          }));
          setClips(loadedClips);
        }
        
        // 加载特效
        const effectsRes = await fetch(`/api/projects/${projectId}/video/effects`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (effectsRes.ok) {
          const effectsData = await effectsRes.json();
          setEffects(effectsData.effects || []);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);
  
  // 恢复未完成的任务
  useEffect(() => {
    if (!projectId) return;
    
    recoverTasks(
      ['video_script_generation', 'video_generation', 'effects_render'],
      (job) => {
        // 根据工作流参数映射到任务 key
        const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
        if (job.workflow_type === 'video_script_generation') {
          return `script_${projectId}`;
        } else if (job.workflow_type === 'video_generation') {
          return `video_${params?.clipId || projectId}`;
        } else if (job.workflow_type === 'effects_render') {
          return `effects_${params?.effectId || projectId}`;
        }
        return null;
      }
    );
  }, [projectId, recoverTasks]);

  // 处理片段变更
  const handleClipsChange = useCallback((newClips: VideoClip[]) => {
    setClips(newClips);
    
    // 保存到后端（防抖）
    const token = getAuthToken();
    fetch(`/api/projects/${projectId}/video/clips`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ clips: newClips }),
    }).catch(err => console.error('保存片段失败:', err));
  }, [projectId]);
  
  // 处理特效变更
  const handleEffectsChange = useCallback((newEffects: VideoEffect[]) => {
    setEffects(newEffects);
    
    // 保存到后端
    const token = getAuthToken();
    fetch(`/api/projects/${projectId}/video/effects`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ effects: newEffects }),
    }).catch(err => console.error('保存特效失败:', err));
  }, [projectId]);

  // 加载中
  if (loading) {
    return <LoadingFallback />;
  }

  // 根据 activeTab 渲染不同的工作台内容
  const renderContent = () => {
    switch (activeTab) {
      case 'script':
        return (
          <VideoScriptPanel
            projectId={projectId}
            aiModels={aiModels}
            runTask={runTask}
            tasks={tasks}
          />
        );
        
      case 'timeline':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <TimelineEditor
              projectId={projectId}
              clips={clips}
              onClipsChange={handleClipsChange}
              aiModels={aiModels}
            />
          </Suspense>
        );
        
      case 'effects':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EffectsEditor
              projectId={projectId}
              effects={effects}
              onEffectsChange={handleEffectsChange}
              aiModels={aiModels}
              runTask={runTask}
              tasks={tasks}
            />
          </Suspense>
        );
        
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--text-muted)]">未知的工作台标签</p>
          </div>
        );
    }
  };

  return (
    <div className="h-full">
      {renderContent()}
    </div>
  );
};

export default ShortVideoWorkbench;
