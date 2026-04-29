import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Progress,
} from '@heroui/react';
import { Sparkles, Wand2, Info } from 'lucide-react';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { getAuthToken } from '../../services/auth';
import type { Project } from '../../services/projects';

interface AIModel {
  name: string;
  displayName?: string;
  type?: string;
  category?: string;
}

/** 生成完成后回传的剧本信息（用于弱绑定参考剧本场景） */
export interface ScriptGeneratedPayload {
  scriptId: number;
  content: string;
  title: string;
  projectId: number;
  episodeNumber: number;
}

interface ScriptGenerateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  aiModels: AIModel[];
  defaultTextModel?: string;
  /** 锁定目标项目（传入后项目选择器不可改，用于已在项目上下文中触发时） */
  lockProjectId?: number;
  /** 锁定目标集数（传入后隐藏集数输入，自动生成该集；用于分镜工作台等已有集数上下文的场景） */
  lockEpisodeNumber?: number;
  /** 生成成功回调，payload 可能为空以兼容旧调用方 */
  onSuccess?: (payload?: ScriptGeneratedPayload) => void;
  onError?: (msg: string) => void;
}

const ScriptGenerateModal: React.FC<ScriptGenerateModalProps> = ({
  isOpen,
  onOpenChange,
  projects,
  aiModels,
  defaultTextModel,
  lockProjectId,
  lockEpisodeNumber,
  onSuccess,
  onError,
}) => {
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

  // 可用文本模型（用 useMemo 稳定引用，避免触发下方 useEffect 预期外重置）
  const textModels = useMemo(
    () => aiModels.filter((m) => (m.type || m.category || '').toUpperCase() === 'TEXT'),
    [aiModels]
  );

  // 检测项目是否已设置叙事风格
  const selectedProjectStyleInfo = useMemo(() => {
    if (!projectId) return null;
    const project = projects.find((p) => String(p.id) === projectId);
    if (!project) return null;
    let hasStoryStyle = false;
    let hasVisualStyle = false;
    try {
      const raw = (project as any).settings_json;
      const settings = typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : (raw || {});
      hasStoryStyle = !!settings?.storyStyle;
      hasVisualStyle = !!settings?.visualStyle;
    } catch {
      hasStoryStyle = false;
      hasVisualStyle = false;
    }
    return { hasStoryStyle, hasVisualStyle, projectName: project.name };
  }, [projectId, projects]);

  // 集数：lockEpisodeNumber 优先，否则走用户输入
  const episodeNumberParsed = useMemo(() => {
    if (lockEpisodeNumber != null) return lockEpisodeNumber;
    if (!episodeInput.trim()) return null;
    const n = Number(episodeInput.trim());
    if (!Number.isInteger(n) || n < 1) return NaN;
    return n;
  }, [episodeInput, lockEpisodeNumber]);

  // 当模态框打开时，重置状态 (只依赖 isOpen，避免中途调用等导致 projectId 被清空)
  useEffect(() => {
    if (isOpen) {
      // 若父组件锁定了项目，直接使用之（不展示项目选择自由度）
      setProjectId(lockProjectId ? String(lockProjectId) : '');
      // 锁定项目场景：默认剧本标题 = 项目名，故事概述 = 项目描述（用户仍可修改）
      const lockedProject = lockProjectId ? projects.find((p) => p.id === lockProjectId) : null;
      setTitle(lockedProject?.name || '');
      setDescription(lockedProject?.description || '');
      setLength('短篇');
      setEpisodeInput('');
      setTextModel(defaultTextModel || textModels[0]?.name || '');
      setGenerating(false);
      setGeneratingScriptId(null);
      setJobId(null);
      setProgressInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 工作流轮询
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
        // 保存工作流结果到剧本
        const token = getAuthToken();
        const res = await fetch('/api/scripts/save-from-workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            scriptId: generatingScriptId,
            jobId: completedJob.id,
          }),
        });

        if (res.status === 402) {
          onError?.('积分不足，请充值');
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || '保存失败');
        }

        // 标记工作流已消费
        await consumeWorkflow(completedJob.id);

        // 若调用方关心 payload（如分镜面板的弱绑定参考剧本），则回拉剧本内容再回传
        let payload: ScriptGeneratedPayload | undefined;
        try {
          const pid = Number(projectId);
          const epi = Number(data.episodeNumber);
          if (pid && epi) {
            const detailRes = await fetch(`/api/scripts/project/${pid}/episode/${epi}`, {
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const script = detailData?.script;
              if (script) {
                payload = {
                  scriptId: Number(data.scriptId || generatingScriptId),
                  content: script.content || '',
                  title: script.title || `第${epi}集`,
                  projectId: pid,
                  episodeNumber: epi,
                };
              }
            }
          }
        } catch (e) {
          console.warn('[ScriptGenerateModal] 回拉剧本内容失败（不影响成功提示）:', e);
        }

        onSuccess?.(payload);
        onOpenChange(false);
      } catch (err: any) {
        console.error('[ScriptGenerateModal] 保存失败:', err);
        onError?.(err.message || '剧本生成完成但保存失败');
      } finally {
        setGenerating(false);
        setJobId(null);
        setProgressInfo(null);
      }
    },
    onFailed: async (failedJob) => {
      // 将生成中的剧本状态回滚为 draft
      if (generatingScriptId) {
        try {
          const token = getAuthToken();
          await fetch(`/api/scripts/${generatingScriptId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ status: 'draft' }),
          });
        } catch (e) {
          console.warn('[ScriptGenerateModal] 状态回滚失败:', e);
        }
      }
      try {
        await consumeWorkflow(failedJob.id);
      } catch (e) {
        console.error('标记工作流消费失败:', e);
      }
      setGenerating(false);
      setJobId(null);
      setProgressInfo(null);
      onError?.('剧本生成失败，请稍后重试');
    },
  });

  const handleGenerate = async () => {
    if (!projectId) {
      onError?.('请选择目标项目');
      return;
    }
    if (!description.trim()) {
      onError?.('请填写故事概述');
      return;
    }
    if (!textModel) {
      onError?.('请选择文本模型');
      return;
    }
    if (Number.isNaN(episodeNumberParsed)) {
      onError?.('目标集数需为大于等于 1 的整数');
      return;
    }

    setGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: Number(projectId),
          title: title.trim() || undefined,
          description: description.trim(),
          length,
          textModel,
          ...(episodeNumberParsed ? { episodeNumber: episodeNumberParsed } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || '生成启动失败');
      }

      setJobId(data.jobId);
      setGeneratingScriptId(data.scriptId);
    } catch (err: any) {
      console.error('[ScriptGenerateModal] 生成启动失败:', err);
      setGenerating(false);
      onError?.(err.message || '生成启动失败');
    }
  };

  const canGenerate =
    !generating &&
    projectId &&
    textModel &&
    description.trim() &&
    !Number.isNaN(episodeNumberParsed);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-(--accent)" />
              <span>AI 生成剧本</span>
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* 项目选择 */}
              <Select
                label="目标项目"
                selectedKeys={projectId ? [projectId] : []}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys)[0] as string;
                  setProjectId(k || '');
                }}
                placeholder="选择要生成剧本的项目"
                isRequired
                isDisabled={generating || !!lockProjectId}
                description={lockProjectId ? (lockEpisodeNumber ? `已锁定到当前项目，将生成第 ${lockEpisodeNumber} 集剧本` : '已锁定到当前项目，新剧本将作为下一集草稿保存') : undefined}
              >
                {projects.map((p) => (
                  <SelectItem key={String(p.id)} textValue={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </Select>

              {/* 风格提示：项目尚未设置叙事风格时提醒自动推荐 */}
              {selectedProjectStyleInfo && !selectedProjectStyleInfo.hasStoryStyle && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    项目「{selectedProjectStyleInfo.projectName}」尚未设置叙事风格，首次生成时将自动调用 AI 推荐并写入项目设置，可能多花 10–30 秒。如需自定义风格，请先在项目设置中配置。
                  </p>
                </div>
              )}

              {/* 标题 */}
              <Input
                label="剧本标题"
                placeholder="输入你的创意标题（可选）"
                value={title}
                onValueChange={setTitle}
                isDisabled={generating}
              />

              {/* 故事概述 */}
              <Textarea
                label="故事概述"
                placeholder="描述你的故事创意、角色设定、剧情走向等..."
                value={description}
                onValueChange={setDescription}
                minRows={4}
                isDisabled={generating}
                isRequired
              />

              {/* 长度 + 模型 */}
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="长度"
                  selectedKeys={[length]}
                  onChange={(e) => setLength(e.target.value)}
                  isDisabled={generating}
                >
                  <SelectItem key="短篇" textValue="短篇 (1-3分钟)">
                    短篇 (1-3分钟)
                  </SelectItem>
                  <SelectItem key="中篇" textValue="中篇 (3-5分钟)">
                    中篇 (3-5分钟)
                  </SelectItem>
                  <SelectItem key="长篇" textValue="长篇 (5-10分钟)">
                    长篇 (5-10分钟)
                  </SelectItem>
                </Select>

                <Select
                  label="文本模型"
                  selectedKeys={textModel ? [textModel] : []}
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as string;
                    setTextModel(k || '');
                  }}
                  placeholder="选择 AI 模型"
                  isDisabled={generating}
                >
                  {textModels.map((m) => (
                    <SelectItem key={m.name} textValue={m.displayName || m.name}>
                      {m.displayName || m.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* 目标集数（lockEpisodeNumber 锁定时隐藏） */}
              {lockEpisodeNumber == null && (
                <Input
                  label="目标集数"
                  placeholder="留空 = 自动生成下一集，或输入整数指定集数（如 1 重写第一集草稿）"
                  value={episodeInput}
                  onValueChange={setEpisodeInput}
                  isDisabled={generating}
                  type="number"
                  min={1}
                  isInvalid={Number.isNaN(episodeNumberParsed)}
                  errorMessage={Number.isNaN(episodeNumberParsed) ? '集数需为大于等于 1 的整数' : undefined}
                  description="如果该集已存在且状态为草稿，将覆盖重生；已完成的集数不能重复生成。"
                />
              )}

              {/* 生成进度 */}
              {generating && progressInfo && (
                <div className="space-y-2 p-3 rounded-lg bg-(--accent)/5 border border-(--accent)/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-(--accent) font-medium">
                      {progressInfo.stepName}
                    </span>
                    <span className="text-(--text-muted)">
                      {progressInfo.step}/{progressInfo.totalSteps}
                    </span>
                  </div>
                  <Progress
                    value={progressInfo.progress}
                    className="h-2"
                    color="primary"
                  />
                  <p className="text-xs text-(--text-muted)">
                    生成需要几分钟，请耐心等待，关闭弹窗不会影响生成进度
                  </p>
                </div>
              )}

              {generating && !progressInfo && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-(--accent)/5 border border-(--accent)/20 text-sm text-(--accent)">
                  <Wand2 className="w-4 h-4 animate-spin" />
                  正在启动生成...
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={generating}>
                取消
              </Button>
              <Button
                color="primary"
                className="bg-(--accent)"
                startContent={!generating && <Sparkles className="w-4 h-4" />}
                isLoading={generating}
                isDisabled={!canGenerate}
                onPress={handleGenerate}
              >
                {generating ? '生成中...' : '开始生成'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ScriptGenerateModal;
