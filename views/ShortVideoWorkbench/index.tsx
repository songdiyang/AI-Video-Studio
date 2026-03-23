/**
 * 短视频工作台
 * 包含视频脚本、时间轴编辑、特效添加三个功能模块
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Spinner, Button, Textarea, Input, Slider } from '@heroui/react';
import { FileText, Clock, Sparkles, Play, Pause, Upload, Download, Wand2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthToken } from '../../services/auth';
import { Project, fetchProject } from '../../services/projects';
import { VideoEffect, TransitionType, FilterType } from '../../types/projectTypes';

// 懒加载子组件
const EffectsEditor = lazy(() => import('./EffectsEditor'));

// ==================== 类型定义 ====================

interface ShortVideoWorkbenchProps {
  projectId: number;
  activeTab: string;
}

interface VideoClip {
  id: string;
  name: string;
  duration: number;
  thumbnail?: string;
  videoUrl?: string;
  startTime: number;
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
}

const VideoScriptPanel: React.FC<VideoScriptPanelProps> = ({ projectId, onScriptGenerated }) => {
  const { showToast } = useToast();
  const [script, setScript] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // AI 生成脚本
  const handleGenerate = async () => {
    if (!title.trim()) {
      showToast('请输入视频标题/主题', 'warning');
      return;
    }

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
            isLoading={generating}
            onPress={handleGenerate}
          >
            AI 生成脚本
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

// ==================== 时间轴编辑面板 ====================

interface TimelineEditorPanelProps {
  projectId: number;
  clips: VideoClip[];
  onClipsChange: (clips: VideoClip[]) => void;
}

const TimelineEditorPanel: React.FC<TimelineEditorPanelProps> = ({
  projectId,
  clips,
  onClipsChange,
}) => {
  const { showToast } = useToast();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  // 计算总时长
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

  // 添加片段
  const handleAddClip = () => {
    const newClip: VideoClip = {
      id: `clip_${Date.now()}`,
      name: `片段 ${clips.length + 1}`,
      duration: 5,
      startTime: totalDuration,
    };
    onClipsChange([...clips, newClip]);
  };

  // 删除片段
  const handleDeleteClip = (clipId: string) => {
    onClipsChange(clips.filter(c => c.id !== clipId));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  };

  // 播放/暂停
  const togglePlay = () => {
    setPlaying(!playing);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 预览区 */}
      <div className="h-64 bg-black flex items-center justify-center border-b border-[var(--border-color)]">
        <div className="text-center text-white">
          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm opacity-50">视频预览区</p>
        </div>
      </div>

      {/* 控制栏 */}
      <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-nav)]">
        <div className="flex items-center gap-3">
          <Button size="sm" isIconOnly variant="flat" onPress={togglePlay}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <span className="text-sm text-[var(--text-primary)] font-mono">
            {Math.floor(currentTime / 60).toString().padStart(2, '0')}:
            {(currentTime % 60).toString().padStart(2, '0')} / 
            {Math.floor(totalDuration / 60).toString().padStart(2, '0')}:
            {(totalDuration % 60).toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">缩放:</span>
          <Slider
            size="sm"
            step={10}
            minValue={50}
            maxValue={200}
            value={zoom}
            onChange={(val) => setZoom(val as number)}
            className="w-24"
          />
          <span className="text-xs text-[var(--text-muted)]">{zoom}%</span>
        </div>
      </div>

      {/* 时间轴 */}
      <div className="flex-1 overflow-auto bg-[var(--bg-app)]">
        {/* 时间刻度 */}
        <div className="h-6 border-b border-[var(--border-color)] bg-[var(--bg-nav)] flex items-end px-2">
          {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 text-xs text-[var(--text-muted)] border-l border-[var(--border-color)] pl-1"
              style={{ width: `${(5 * zoom) / 100 * 10}px` }}
            >
              {i * 5}s
            </div>
          ))}
        </div>

        {/* 视频轨道 */}
        <div className="p-2 min-h-[100px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-[var(--text-muted)] w-16">视频</span>
            <div className="flex-1 h-16 bg-[var(--bg-input)] rounded-lg relative overflow-hidden">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  onClick={() => setSelectedClipId(clip.id)}
                  className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all ${
                    selectedClipId === clip.id
                      ? 'bg-[var(--accent)] ring-2 ring-[var(--accent)]'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                  style={{
                    left: `${(clip.startTime / (totalDuration || 1)) * 100}%`,
                    width: `${(clip.duration / (totalDuration || 1)) * 100}%`,
                    minWidth: '40px',
                  }}
                >
                  <div className="px-2 py-1 text-xs text-white truncate">
                    {clip.name}
                  </div>
                  {selectedClipId === clip.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClip(clip.id); }}
                      className="absolute top-1 right-1 p-0.5 rounded bg-red-500 hover:bg-red-600"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" isIconOnly variant="flat" onPress={handleAddClip}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* 音频轨道 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] w-16">音频</span>
            <div className="flex-1 h-12 bg-[var(--bg-input)] rounded-lg flex items-center justify-center">
              <span className="text-xs text-[var(--text-muted)]">拖放音频文件或点击添加</span>
            </div>
            <Button size="sm" isIconOnly variant="flat">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const ShortVideoWorkbench: React.FC<ShortVideoWorkbenchProps> = ({ projectId, activeTab }) => {
  const { showToast } = useToast();
  
  // 状态
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [effects, setEffects] = useState<VideoEffect[]>([]);
  const [loading, setLoading] = useState(true);

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
          setClips(data.clips || []);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);

  // 加载中
  if (loading && !project) {
    return <LoadingFallback />;
  }

  // 根据 activeTab 渲染不同的工作台内容
  const renderContent = () => {
    switch (activeTab) {
      case 'script':
        return <VideoScriptPanel projectId={projectId} />;
        
      case 'timeline':
        return (
          <TimelineEditorPanel
            projectId={projectId}
            clips={clips}
            onClipsChange={setClips}
          />
        );
        
      case 'effects':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <EffectsEditor
              projectId={projectId}
              effects={effects}
              onEffectsChange={setEffects}
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
