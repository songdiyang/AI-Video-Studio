import React, { useState, useEffect, useCallback } from 'react';
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
import { Sparkles, Wand2, AlertCircle } from 'lucide-react';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { getAuthToken } from '../../services/auth';
import type { Project } from '../../services/projects';

interface AIModel {
  name: string;
  displayName?: string;
  type?: string;
  category?: string;
}

interface ScriptGenerateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  aiModels: AIModel[];
  defaultTextModel?: string;
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

const ScriptGenerateModal: React.FC<ScriptGenerateModalProps> = ({
  isOpen,
  onOpenChange,
  projects,
  aiModels,
  defaultTextModel,
  onSuccess,
  onError,
}) => {
  const [projectId, setProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [length, setLength] = useState('短篇');
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

  // 可用文本模型
  const textModels = aiModels.filter(
    (m) => (m.type || m.category || '').toUpperCase() === 'TEXT'
  );

  // 当模态框打开时，重置状态
  useEffect(() => {
    if (isOpen) {
      setProjectId('');
      setTitle('');
      setDescription('');
      setLength('短篇');
      setTextModel(defaultTextModel || textModels[0]?.name || '');
      setGenerating(false);
      setGeneratingScriptId(null);
      setJobId(null);
      setProgressInfo(null);
    }
  }, [isOpen, defaultTextModel, textModels]);

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

        onSuccess?.();
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
    if (!description.trim() && !title.trim()) {
      onError?.('请至少填写标题或故事概述');
      return;
    }
    if (!textModel) {
      onError?.('请选择文本模型');
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
    (title.trim() || description.trim());

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
                label="目标项目 *"
                selectedKeys={projectId ? [projectId] : []}
                onSelectionChange={(keys) => {
                  const k = Array.from(keys)[0] as string;
                  setProjectId(k || '');
                }}
                placeholder="选择要生成剧本的项目"
                isRequired
                isDisabled={generating}
              >
                {projects.map((p) => (
                  <SelectItem key={String(p.id)} textValue={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </Select>

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
                label="故事概述 *"
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
