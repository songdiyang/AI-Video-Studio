/**
 * ScriptGenerateTab - 剧本创作中心标签页
 * 整合AI生成、上传剧本两大功能
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Progress,
} from '@heroui/react';
import {
  Sparkles, Info, X, Upload, FileText,
  Check, ArrowLeftRight, Save,
  Loader2
} from 'lucide-react';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { getAuthToken } from '../../services/auth';
import type { Project } from '../../services/projects';
import { uploadScriptFile } from '../../services/scripts';
import { useToast } from '../../contexts/ToastContext';

interface AIModel {
  name: string;
  displayName?: string;
  type?: string;
  category?: string;
}

/** 生成完成后回传的剧本信息 */
export interface ScriptGeneratedPayload {
  scriptId: number;
  content: string;
  title: string;
  projectId: number;
  episodeNumber: number;
}

interface ScriptGenerateTabProps {
  projects: Project[];
  aiModels: AIModel[];
  defaultTextModel?: string;
  /** 锁定目标项目 */
  lockProjectId?: number;
  /** 锁定目标集数 */
  lockEpisodeNumber?: number;
  /** 生成成功回调 */
  onSuccess?: (payload?: ScriptGeneratedPayload) => void;
  onError?: (msg: string) => void;
  /** 关闭标签页回调 */
  onClose: () => void;
}

type TabKey = 'generate' | 'upload';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'generate', label: 'AI生成', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'upload', label: '上传剧本', icon: <Upload className="w-4 h-4" /> },
];

// ==================== AI生成子组件 ====================

const GeneratePanel: React.FC<{
  projects: Project[];
  aiModels: AIModel[];
  defaultTextModel?: string;
  lockProjectId?: number;
  lockEpisodeNumber?: number;
  onSuccess?: (payload?: ScriptGeneratedPayload) => void;
  onError?: (msg: string) => void;
}> = ({ projects, aiModels, defaultTextModel, lockProjectId, lockEpisodeNumber, onSuccess, onError }) => {
  const [projectId, setProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [length, setLength] = useState('短篇');
  const [episodeInput, setEpisodeInput] = useState<string>('');
  const [textModel, setTextModel] = useState(defaultTextModel || '');
  const [generating, setGenerating] = useState(false);
  const [generatingScriptId, setGeneratingScriptId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progressInfo, setProgressInfo] = useState<{
    step: number;
    totalSteps: number;
    stepName: string;
    progress: number;
  } | null>(null);

  const textModels = useMemo(
    () => aiModels.filter((m) => (m.type || m.category || '').toUpperCase() === 'TEXT'),
    [aiModels]
  );

  useEffect(() => {
    if (lockProjectId) {
      setProjectId(String(lockProjectId));
    } else if (projects.length > 0 && !projectId) {
      setProjectId(String(projects[0].id));
    }
  }, [lockProjectId, projects, projectId]);

  useEffect(() => {
    if (defaultTextModel && !textModel && textModels.length > 0) {
      setTextModel(defaultTextModel);
    } else if (!textModel && textModels.length > 0) {
      setTextModel(textModels[0].name);
    }
  }, [defaultTextModel, textModels, textModel]);

  useEffect(() => {
    if (lockEpisodeNumber !== undefined) {
      setEpisodeInput(String(lockEpisodeNumber));
    }
  }, [lockEpisodeNumber]);

  const { job, isRunning, isCompleted, isFailed } = useWorkflow(jobId, {
    onProgress: (progressJob) => {
      if (progressJob?.tasks) {
        const currentTask = progressJob.tasks.find((t: any) => t.status === 'processing');
        const completedCount = progressJob.tasks.filter((t: any) => t.status === 'completed').length;
        const totalTasks = progressJob.tasks.length;
        const stepNameMap: Record<string, string> = {
          script_generation: '生成剧本内容',
          style_suggestion: '分析叙事风格',
          context_loading: '加载前情回顾',
        };
        const stepName = currentTask
          ? (stepNameMap[currentTask.task_type] || currentTask.task_type)
          : completedCount === totalTasks
            ? '完成'
            : '准备中';
        const avgProgress =
          progressJob.tasks.reduce((sum: number, t: any) => sum + (t.progress || 0), 0) /
          totalTasks;
        setProgressInfo({
          step: completedCount + (currentTask ? 1 : 0),
          totalSteps: totalTasks,
          stepName,
          progress: Math.round(avgProgress),
        });
      }
    },
    onCompleted: async (completedJob) => {
      if (!generatingScriptId) return;
      try {
        const token = getAuthToken();
        const res = await fetch('/api/scripts/save-from-workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            scriptId: generatingScriptId,
            jobId: completedJob.id,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const payload: ScriptGeneratedPayload = {
            scriptId: generatingScriptId,
            content: data.content || '',
            title: data.title || '',
            projectId: data.project_id || Number(projectId),
            episodeNumber: data.episode_number || Number(episodeInput) || 1,
          };
          onSuccess?.(payload);
        } else {
          onError?.(data.message || '保存剧本失败');
        }
      } catch (err: any) {
        console.error('[ScriptGenerateTab] 保存剧本失败:', err);
        onError?.(err?.message || '保存剧本失败');
      }
    },
  });

  useEffect(() => {
    if (isCompleted && job) {
      consumeWorkflow(job.id);
    }
  }, [isCompleted, job]);

  const handleGenerate = async () => {
    const targetProjectId = Number(projectId);
    if (!targetProjectId) {
      onError?.('请选择项目');
      return;
    }
    const targetEpisode = lockEpisodeNumber || Number(episodeInput);
    if (!targetEpisode || targetEpisode < 1) {
      onError?.('请输入有效的集数');
      return;
    }
    if (!textModel) {
      onError?.('请选择文本模型');
      return;
    }
    setGenerating(true);
    setProgressInfo(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: targetProjectId,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          length,
          textModel,
          ...(targetEpisode ? { episodeNumber: targetEpisode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '生成启动失败');
      }
      setGeneratingScriptId(data.scriptId);
      setJobId(data.jobId);
    } catch (err: any) {
      console.error('[ScriptGenerateTab] 生成失败:', err);
      onError?.(err?.message || '生成失败');
      setGenerating(false);
    }
  };

  const canGenerate = projectId && (lockEpisodeNumber || episodeInput) && textModel && !generating;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20">
        <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <p>AI 将根据您的描述生成剧本内容，生成的剧本会自动保存到当前项目的指定集数。</p>
          <p className="mt-1">生成过程中您可以切换到其他标签页继续工作，完成后会自动通知您。</p>
        </div>
      </div>

      {!lockProjectId && (
        <Select
          label="目标项目"
          placeholder="选择项目"
          selectedKeys={[projectId]}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string;
            if (selected) setProjectId(selected);
          }}
          isRequired
          classNames={{
            label: "text-[var(--text-secondary)] font-medium",
            trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] data-[hover=true]:border-[var(--accent)]/50",
            value: "text-[var(--text-primary)]",
          }}
        >
          {projects.map((project) => (
            <SelectItem key={String(project.id)}>{project.name}</SelectItem>
          ))}
        </Select>
      )}

      {!lockEpisodeNumber && (
        <Input
          label="集数"
          type="number"
          placeholder="输入集数（如：1）"
          value={episodeInput}
          onValueChange={setEpisodeInput}
          min={1}
          isRequired
          classNames={{
            label: "text-[var(--text-secondary)] font-medium",
            input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
          }}
        />
      )}

      <Input
        label="剧本标题（可选）"
        placeholder="输入剧本标题"
        value={title}
        onValueChange={setTitle}
        classNames={{
          label: "text-[var(--text-secondary)] font-medium",
          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
        }}
      />

      <Textarea
        label="剧本描述"
        placeholder="描述你想要生成的剧本内容、风格、情节等..."
        value={description}
        onValueChange={setDescription}
        minRows={4}
        maxRows={8}
        classNames={{
          label: "text-[var(--text-secondary)] font-medium",
          input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
          inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
        }}
      />

      <Select
        label="剧本长度"
        selectedKeys={[length]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          if (selected) setLength(selected);
        }}
        classNames={{
          label: "text-[var(--text-secondary)] font-medium",
          trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] data-[hover=true]:border-[var(--accent)]/50",
          value: "text-[var(--text-primary)]",
        }}
      >
        <SelectItem key="短篇">短篇（1~3分钟）</SelectItem>
        <SelectItem key="中篇">中篇（3~5分钟）</SelectItem>
        <SelectItem key="长篇">长篇（5~10分钟）</SelectItem>
      </Select>

      {textModels.length > 0 && (
        <Select
          label="文本模型"
          placeholder="选择文本模型"
          selectedKeys={[textModel]}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as string;
            if (selected) setTextModel(selected);
          }}
          isRequired
          classNames={{
            label: "text-[var(--text-secondary)] font-medium",
            trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] data-[hover=true]:border-[var(--accent)]/50",
            value: "text-[var(--text-primary)]",
          }}
        >
          {textModels.map((model) => (
            <SelectItem key={model.name}>{model.displayName || model.name}</SelectItem>
          ))}
        </Select>
      )}

      {generating && progressInfo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">{progressInfo.stepName}</span>
            <span className="text-[var(--text-muted)]">{progressInfo.step}/{progressInfo.totalSteps}</span>
          </div>
          <Progress
            value={progressInfo.progress}
            classNames={{
              base: "max-w-full",
              track: "bg-[var(--bg-input)]",
              indicator: "bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70",
            }}
          />
          <p className="text-xs text-[var(--text-muted)] text-center">生成中，请稍候...</p>
        </div>
      )}

      <Button
        color="primary"
        size="lg"
        className="w-full"
        startContent={!generating && <Sparkles className="w-4 h-4" />}
        isLoading={generating}
        isDisabled={!canGenerate}
        onPress={handleGenerate}
      >
        {generating ? `生成中 ${progressInfo ? `(${progressInfo.progress}%)` : '...'}` : '开始生成'}
      </Button>
    </div>
  );
};

// ==================== 上传剧本子组件 ====================

type UploadMode = 'file' | 'text';

const UploadPanel: React.FC<{
  lockProjectId?: number;
  lockEpisodeNumber?: number;
  onSuccess?: (payload?: ScriptGeneratedPayload) => void;
  onError?: (msg: string) => void;
}> = ({ lockProjectId, lockEpisodeNumber, onSuccess, onError }) => {
  const { showToast } = useToast();
  const [inputMode, setInputMode] = useState<UploadMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.txt') && !selectedFile.name.endsWith('.md')) {
      showToast('仅支持 .txt 和 .md 文件', 'error');
      return;
    }
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string || '';
      setContent(text);
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleUpload = async (mode: 'save' | 'analyze') => {
    if (inputMode === 'file' && !file) {
      showToast('请先选择文件', 'error');
      return;
    }
    if (inputMode === 'text' && !content.trim()) {
      showToast('请输入剧本内容', 'error');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadScriptFile({
        file: inputMode === 'file' ? file : undefined,
        content: inputMode === 'text' ? content : undefined,
        projectId: lockProjectId,
        episodeNumber: lockEpisodeNumber,
        title: inputMode === 'file' && file ? file.name.replace(/\.[^.]+$/, '') : undefined,
        mode,
      });
      showToast(result.message, 'success');
      onSuccess?.({
        scriptId: result.scriptId,
        content: result.content,
        title: result.title,
        projectId: result.projectId || lockProjectId || 0,
        episodeNumber: result.episodeNumber,
      });
    } catch (err: any) {
      showToast(err?.message || '操作失败', 'error');
      onError?.(err?.message || '操作失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 方式切换 */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)]">
        <button
          onClick={() => { setInputMode('file'); setContent(''); setFile(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            inputMode === 'file'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          上传文件
        </button>
        <button
          onClick={() => { setInputMode('text'); setContent(''); setFile(null); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            inputMode === 'text'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          直接输入
        </button>
      </div>

      {inputMode === 'file' ? (
        <>
          {/* 拖拽上传区 */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver
                ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                : 'border-[var(--border-color)] hover:border-[var(--accent)]/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <Upload className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-primary)] font-medium">
              {file ? file.name : '点击或拖拽上传剧本文件'}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              支持 .txt、.md 格式，最大 5MB
            </p>
          </div>
        </>
      ) : (
        <>
          {/* 直接输入文本区 */}
          <Textarea
            label="剧本内容"
            placeholder="在此粘贴或输入剧本内容..."
            value={content}
            onValueChange={setContent}
            minRows={8}
            maxRows={16}
            classNames={{
              label: "text-[var(--text-secondary)] font-medium",
              input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
            }}
          />
        </>
      )}

      {/* 内容预览 / 操作按钮 */}
      {content && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg-input)] border-b border-[var(--border-color)] flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">内容预览</span>
              <span className="text-xs text-[var(--text-muted)]">{content.length} 字</span>
            </div>
            <div className="p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {content.length > 1000 ? content.slice(0, 1000) + '...' : content}
              </pre>
            </div>
          </div>

          <Button
            color="primary"
            className="w-full"
            startContent={<Save className="w-4 h-4" />}
            isLoading={uploading}
            onPress={() => handleUpload('save')}
          >
            {uploading ? '保存中...' : '保存剧本'}
          </Button>
        </div>
      )}


    </div>
  );
};



// ==================== 主组件 ====================

const ScriptGenerateTab: React.FC<ScriptGenerateTabProps> = ({
  projects,
  aiModels,
  defaultTextModel,
  lockProjectId,
  lockEpisodeNumber,
  onSuccess,
  onError,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('generate');

  return (
    <div className="flex flex-col h-full">
      {/* Tab 切换 */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--accent)]/5'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'generate' && (
          <GeneratePanel
            projects={projects}
            aiModels={aiModels}
            defaultTextModel={defaultTextModel}
            lockProjectId={lockProjectId}
            lockEpisodeNumber={lockEpisodeNumber}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
        {activeTab === 'upload' && (
          <UploadPanel
            lockProjectId={lockProjectId}
            lockEpisodeNumber={lockEpisodeNumber}
            onSuccess={onSuccess}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
};

export default ScriptGenerateTab;
