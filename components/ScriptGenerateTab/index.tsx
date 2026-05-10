/**
 * ScriptGenerateTab - 剧本创作中心标签页
 * 整合AI生成、上传剧本、剧本分析、优化完善四大功能
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Progress,
} from '@heroui/react';
import {
  Sparkles, Wand2, Info, X, Upload, FileText, Brain,
  Zap, ChevronRight, Check, ArrowLeftRight, Save,
  Loader2, Lightbulb, Users, Clock, Tag, BookOpen
} from 'lucide-react';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { getAuthToken } from '../../services/auth';
import type { Project } from '../../services/projects';
import {
  uploadScriptFile, analyzeScript, optimizeScript,
  type ScriptAnalysisResult, type UploadScriptResponse
} from '../../services/scripts';
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

type TabKey = 'generate' | 'upload' | 'analyze' | 'optimize';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'generate', label: 'AI生成', icon: <Sparkles className="w-4 h-4" /> },
  { key: 'upload', label: '上传剧本', icon: <Upload className="w-4 h-4" /> },
  { key: 'analyze', label: '剧本分析', icon: <Brain className="w-4 h-4" /> },
  { key: 'optimize', label: '优化完善', icon: <Zap className="w-4 h-4" /> },
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
    setGenerating(true);
    setProgressInfo(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/ai-assistant/execute-tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          tool: 'generate_script',
          params: {
            projectId: targetProjectId,
            title: title || undefined,
            description: description || undefined,
            length,
            episodeNumber: targetEpisode,
            textModel: textModel || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '生成失败');
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

const UploadPanel: React.FC<{
  lockProjectId?: number;
  lockEpisodeNumber?: number;
  onSuccess?: (payload?: ScriptGeneratedPayload) => void;
  onError?: (msg: string) => void;
}> = ({ lockProjectId, lockEpisodeNumber, onSuccess, onError }) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScriptAnalysisResult | null>(null);
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
      setAnalysis(null);
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
    if (!file) {
      showToast('请先选择文件', 'error');
      return;
    }
    if (mode === 'save') {
      setUploading(true);
    } else {
      setAnalyzing(true);
    }
    try {
      const result = await uploadScriptFile({
        file,
        projectId: lockProjectId,
        episodeNumber: lockEpisodeNumber,
        title: file.name.replace(/\.[^.]+$/, ''),
        mode,
      });
      if (mode === 'save') {
        showToast(result.message, 'success');
        onSuccess?.({
          scriptId: result.scriptId,
          content: result.content,
          title: result.title,
          projectId: result.projectId || lockProjectId || 0,
          episodeNumber: result.episodeNumber,
        });
      } else {
        showToast('分析完成', 'success');
        setAnalysis(result.analysis || null);
      }
    } catch (err: any) {
      showToast(err?.message || '操作失败', 'error');
      onError?.(err?.message || '操作失败');
    } finally {
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
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

      {/* 内容预览 */}
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

          <div className="flex gap-3">
            <Button
              color="primary"
              className="flex-1"
              startContent={<Save className="w-4 h-4" />}
              isLoading={uploading}
              isDisabled={analyzing}
              onPress={() => handleUpload('save')}
            >
              {uploading ? '保存中...' : '直接保存'}
            </Button>
            <Button
              color="secondary"
              className="flex-1"
              startContent={<Brain className="w-4 h-4" />}
              isLoading={analyzing}
              isDisabled={uploading}
              onPress={() => handleUpload('analyze')}
            >
              {analyzing ? '分析中...' : 'AI分析参考'}
            </Button>
          </div>
        </div>
      )}

      {/* 分析结果 */}
      {analysis && !analysis.error && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Brain className="w-4 h-4 text-[var(--accent)]" />
            AI 分析结果
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-xs text-[var(--text-muted)]">场景数</span>
              </div>
              <span className="text-lg font-bold text-[var(--text-primary)]">{analysis.sceneCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-xs text-[var(--text-muted)]">角色数</span>
              </div>
              <span className="text-lg font-bold text-[var(--text-primary)]">{analysis.characters?.length || 0}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">风格标签</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.style?.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-[var(--accent)]/10 text-[var(--accent)]">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-xs font-medium text-[var(--text-secondary)]">优化建议</span>
            </div>
            <ul className="space-y-1">
              {analysis.suggestions?.map((s, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                  <ChevronRight className="w-3 h-3 text-[var(--accent)] shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              <span className="font-medium">剧情摘要：</span>{analysis.summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 剧本分析子组件 ====================

const AnalyzePanel: React.FC<{
  lockProjectId?: number;
  onError?: (msg: string) => void;
}> = ({ lockProjectId, onError }) => {
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScriptAnalysisResult | null>(null);

  const handleAnalyze = async () => {
    if (!content.trim()) {
      showToast('请输入剧本内容', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeScript({ content });
      setAnalysis(result.analysis);
      showToast('分析完成', 'success');
    } catch (err: any) {
      showToast(err?.message || '分析失败', 'error');
      onError?.(err?.message || '分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20">
        <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <p>粘贴剧本内容，AI 将分析其结构、角色、节奏等维度。</p>
          <p className="mt-1">分析结果可帮助您了解剧本质量并获取优化建议。</p>
        </div>
      </div>

      <Textarea
        label="剧本内容"
        placeholder="在此粘贴剧本内容..."
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

      <Button
        color="primary"
        className="w-full"
        startContent={!analyzing && <Brain className="w-4 h-4" />}
        isLoading={analyzing}
        isDisabled={!content.trim()}
        onPress={handleAnalyze}
      >
        {analyzing ? '分析中...' : '开始分析'}
      </Button>

      {analysis && !analysis.error && (
        <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Brain className="w-5 h-5 text-[var(--accent)]" />
            分析结果
          </h3>

          {/* 统计卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-center">
              <BookOpen className="w-5 h-5 mx-auto mb-1 text-[var(--accent)]" />
              <div className="text-xl font-bold text-[var(--text-primary)]">{analysis.sceneCount}</div>
              <div className="text-xs text-[var(--text-muted)]">场景</div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-center">
              <Users className="w-5 h-5 mx-auto mb-1 text-[var(--accent)]" />
              <div className="text-xl font-bold text-[var(--text-primary)]">{analysis.characters?.length || 0}</div>
              <div className="text-xs text-[var(--text-muted)]">角色</div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-[var(--accent)]" />
              <div className="text-xl font-bold text-[var(--text-primary)]">{analysis.pacing || '中等'}</div>
              <div className="text-xs text-[var(--text-muted)]">节奏</div>
            </div>
          </div>

          {/* 结构 */}
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">剧情结构</div>
            <div className="text-sm text-[var(--text-primary)]">{analysis.structure}</div>
          </div>

          {/* 风格 */}
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">风格标签</div>
            <div className="flex flex-wrap gap-2">
              {analysis.style?.map((s, i) => (
                <span key={i} className="px-2.5 py-1 rounded-full text-xs bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* 角色列表 */}
          {analysis.characters && analysis.characters.length > 0 && (
            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
              <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">角色分析</div>
              <div className="space-y-2">
                {analysis.characters.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">{c.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)]">{c.importance}</span>
                    <span className="text-[var(--text-secondary)]">{c.trait}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 建议 */}
          <div className="p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)]" />
              优化建议
            </div>
            <ul className="space-y-1.5">
              {analysis.suggestions?.map((s, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                  <ChevronRight className="w-3 h-3 text-[var(--accent)] shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* 摘要 */}
          <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">剧情摘要</div>
            <p className="text-xs text-[var(--text-primary)] leading-relaxed">{analysis.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 优化完善子组件 ====================

const OptimizePanel: React.FC<{
  aiModels: AIModel[];
  defaultTextModel?: string;
  onError?: (msg: string) => void;
}> = ({ aiModels, defaultTextModel, onError }) => {
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [instruction, setInstruction] = useState('');
  const [textModel, setTextModel] = useState(defaultTextModel || '');
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<{
    optimizedContent: string;
    changes: string[];
    originalContent: string;
  } | null>(null);
  const [showOptimized, setShowOptimized] = useState(true);

  const textModels = useMemo(
    () => aiModels.filter((m) => (m.type || m.category || '').toUpperCase() === 'TEXT'),
    [aiModels]
  );

  useEffect(() => {
    if (defaultTextModel && !textModel && textModels.length > 0) {
      setTextModel(defaultTextModel);
    } else if (!textModel && textModels.length > 0) {
      setTextModel(textModels[0].name);
    }
  }, [defaultTextModel, textModels, textModel]);

  const handleOptimize = async () => {
    if (!content.trim()) {
      showToast('请输入剧本内容', 'error');
      return;
    }
    if (!instruction.trim()) {
      showToast('请输入优化指令', 'error');
      return;
    }
    setOptimizing(true);
    try {
      const res = await optimizeScript({
        content,
        instruction,
        textModel,
        saveMode: 'new',
      });
      setResult({
        optimizedContent: res.optimizedContent,
        changes: res.changes,
        originalContent: res.originalContent,
      });
      showToast('优化完成', 'success');
    } catch (err: any) {
      showToast(err?.message || '优化失败', 'error');
      onError?.(err?.message || '优化失败');
    } finally {
      setOptimizing(false);
    }
  };

  const handleAdopt = () => {
    if (result) {
      setContent(result.optimizedContent);
      setResult(null);
      showToast('已采纳优化版本', 'success');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20">
        <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
        <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
          <p>输入剧本内容和优化指令，AI 将帮您改写和完善。</p>
          <p className="mt-1">例如："让对白更口语化"、"增加悬念感"、"精简场景描述"等。</p>
        </div>
      </div>

      {!result ? (
        <>
          <Textarea
            label="原剧本内容"
            placeholder="在此粘贴需要优化的剧本内容..."
            value={content}
            onValueChange={setContent}
            minRows={6}
            maxRows={12}
            classNames={{
              label: "text-[var(--text-secondary)] font-medium",
              input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
            }}
          />

          <Textarea
            label="优化指令"
            placeholder="例如：让对白更口语化、增加冲突、优化节奏..."
            value={instruction}
            onValueChange={setInstruction}
            minRows={2}
            maxRows={4}
            classNames={{
              label: "text-[var(--text-secondary)] font-medium",
              input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50",
            }}
          />

          {textModels.length > 0 && (
            <Select
              label="文本模型"
              placeholder="选择文本模型"
              selectedKeys={[textModel]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) setTextModel(selected);
              }}
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

          <Button
            color="primary"
            className="w-full"
            startContent={!optimizing && <Zap className="w-4 h-4" />}
            isLoading={optimizing}
            isDisabled={!content.trim() || !instruction.trim()}
            onPress={handleOptimize}
          >
            {optimizing ? '优化中...' : '开始优化'}
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          {/* 改动点 */}
          <div className="p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-[var(--accent)]" />
              主要改动
            </div>
            <ul className="space-y-1">
              {result.changes.map((c, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                  <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* 对比视图 */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowOptimized(false)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                !showOptimized
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
              }`}
            >
              原稿
            </button>
            <button
              onClick={() => setShowOptimized(true)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                showOptimized
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
              }`}
            >
              优化稿
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--bg-input)] border-b border-[var(--border-color)] flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {showOptimized ? '优化后内容' : '原稿内容'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {(showOptimized ? result.optimizedContent : result.originalContent).length} 字
              </span>
            </div>
            <div className="p-3 max-h-80 overflow-y-auto">
              <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {showOptimized ? result.optimizedContent : result.originalContent}
              </pre>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              color="primary"
              className="flex-1"
              startContent={<Check className="w-4 h-4" />}
              onPress={handleAdopt}
            >
              采纳优化版本
            </Button>
            <Button
              color="default"
              variant="bordered"
              className="flex-1"
              startContent={<ArrowLeftRight className="w-4 h-4" />}
              onPress={() => setResult(null)}
            >
              重新优化
            </Button>
          </div>
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
      {/* 头部 */}
      <div className="shrink-0 px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">剧本创作中心</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          title="关闭标签页"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="shrink-0 px-4 pt-3 border-b border-[var(--border-color)]">
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
        {activeTab === 'analyze' && (
          <AnalyzePanel
            lockProjectId={lockProjectId}
            onError={onError}
          />
        )}
        {activeTab === 'optimize' && (
          <OptimizePanel
            aiModels={aiModels}
            defaultTextModel={defaultTextModel}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
};

export default ScriptGenerateTab;
