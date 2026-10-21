/**
 * 资源自由添加弹窗
 * ────────────────────────────────────────────────────────
 * 支持「手动填写」与「AI 智能生成」双模式：
 *   - 手动：基础字段（name/description/gender）
 *   - AI：输入简短描述 → 调用后端草稿接口 → 回填字段（可编辑后再创建）
 * 深度编辑（外貌/光线/氛围等）仍在各自详情弹窗中完成。
 */
import React, { useEffect, useState } from 'react';
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
} from '@heroui/react';
import { User as UserIcon, MapPin, Sparkles, Edit3 } from 'lucide-react';
import {
  createCharacter,
  createScene,
  aiGenerateCharacterDraft,
  aiGenerateSceneDraft,
} from '../../../services/assets';

export type CreateAssetType = 'character' | 'scene';
type CreateMode = 'manual' | 'ai';

interface CreateAssetModalProps {
  isOpen: boolean;
  assetType: CreateAssetType;
  projectId: number | null;
  scriptId?: number | null;
  onClose: () => void;
  onCreated: () => void; // 创建成功后的回调（用于刷新列表）
}

const TYPE_CONFIG: Record<CreateAssetType, { title: string; icon: React.ReactNode; placeholder: string }> = {
  character: {
    title: '新建角色',
    icon: <UserIcon className="w-4 h-4" />,
    placeholder: '例如：男主 / 李明 / 神秘访客',
  },
  scene: {
    title: '新建影棚',
    icon: <MapPin className="w-4 h-4" />,
    placeholder: '例如：夜晚街道 / 主角家客厅',
  },
};

const AI_PLACEHOLDER: Record<CreateAssetType, string> = {
  character: '用一段话描述角色：性别、年龄、身份、性格、外貌特征、着装风格等。例如：25 岁的都市职场女性，干练短发，一袭黑色西装，冷静果断但内心柔软。',
  scene: '用一段话描述影棚：地点、时代、氛围、光线、关键物件等。例如：民国时期的昏黄茶馆，木质桌椅，煤油灯光，烟雾缭绕，略带压抑的市井气息。',
};

const CreateAssetModal: React.FC<CreateAssetModalProps> = ({
  isOpen,
  assetType,
  projectId,
  scriptId,
  onClose,
  onCreated,
}) => {
  const cfg = TYPE_CONFIG[assetType];

  const [mode, setMode] = useState<CreateMode>('manual');
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<'unknown' | 'male' | 'female'>('unknown');
  // 场景详细字段（AI 生成时填入，提交时一并落库）
  const [environment, setEnvironment] = useState('');
  const [lighting, setLighting] = useState('');
  const [mood, setMood] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次打开或切换类型时重置
  useEffect(() => {
    if (isOpen) {
      setMode('manual');
      setAiDescription('');
      setAiGenerating(false);
      setName('');
      setDescription('');
      setGender('unknown');
      setEnvironment('');
      setLighting('');
      setMood('');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, assetType]);

  const handleAIGenerate = async () => {
    const trimmed = aiDescription.trim();
    if (!trimmed) {
      setError('请先输入简短的描述');
      return;
    }
    if (!projectId) {
      setError('缺少项目上下文，请先选择项目');
      return;
    }
    setAiGenerating(true);
    setError(null);
    try {
      if (assetType === 'character') {
        const res = await aiGenerateCharacterDraft({ projectId, userDescription: trimmed });
        const d = res.draft || ({} as any);
        setName(d.name || '');
        // 角色草稿的 base_appearance/outfit_appearance/personality/description 合并成一段展示给用户
        const parts = [
          d.description,
          d.personality ? `【性格】${d.personality}` : '',
          d.base_appearance ? `【外貌】${d.base_appearance}` : '',
          d.outfit_appearance ? `【着装】${d.outfit_appearance}` : '',
        ].filter(Boolean);
        setDescription(parts.join('\n'));
        if (d.gender === 'male' || d.gender === 'female' || d.gender === 'unknown') {
          setGender(d.gender);
        }
      } else {
        const res = await aiGenerateSceneDraft({ projectId, userDescription: trimmed });
        const d = res.draft || ({} as any);
        setName(d.name || '');
        setDescription(d.description || '');
        setEnvironment(d.environment || '');
        setLighting(d.lighting || '');
        setMood(d.mood || '');
      }
      setMode('manual'); // 切回手动编辑
    } catch (e: any) {
      setError(e?.message || 'AI 生成失败，请稍后重试');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请输入名称');
      return;
    }
    if (!projectId) {
      setError('缺少项目上下文，请先选择项目');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (assetType === 'character') {
        await createCharacter({
          projectId,
          name: trimmedName,
          description: description.trim(),
          gender,
        } as any);
      } else {
        await createScene({
          project_id: projectId,
          script_id: scriptId ?? null,
          name: trimmedName,
          description: description.trim(),
          environment: environment.trim(),
          lighting: lighting.trim(),
          mood: mood.trim(),
          source: 'manual',
        } as any);
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || aiGenerating;

  return (
    <Modal
      isOpen={isOpen}
      onClose={disabled ? undefined : onClose}
      size="md"
      placement="center"
      backdrop="opaque"
      classNames={{
        base: 'bg-(--bg-card) text-(--text-primary)',
        closeButton: 'text-(--text-muted) hover:text-(--text-primary)',
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-(--accent)/15 text-(--accent)">
            {cfg.icon}
          </span>
          {cfg.title}
        </ModalHeader>
        <ModalBody className="space-y-3">
          {/* 模式切换 */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-(--bg-input) border border-(--border-color)">
            <button
              type="button"
              onClick={() => setMode('manual')}
              disabled={disabled}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors ${
                mode === 'manual'
                  ? 'bg-(--bg-card) text-(--text-primary) shadow-sm'
                  : 'text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>手动填写</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('ai')}
              disabled={disabled}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors ${
                mode === 'ai'
                  ? 'bg-(--accent)/15 text-(--accent) shadow-sm'
                  : 'text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 智能生成</span>
            </button>
          </div>

          {mode === 'ai' ? (
            /* AI 模式：简短描述 + 生成按钮 */
            <div className="space-y-3">
              <Textarea
                label="简短描述"
                size="sm"
                minRows={4}
                maxRows={8}
                placeholder={AI_PLACEHOLDER[assetType]}
                value={aiDescription}
                onValueChange={setAiDescription}
                isDisabled={disabled}
                autoFocus
                maxLength={800}
              />
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={<Sparkles className="w-3.5 h-3.5" />}
                onPress={handleAIGenerate}
                isLoading={aiGenerating}
                isDisabled={disabled || !aiDescription.trim()}
                className="w-full"
              >
                {aiGenerating ? '生成中…' : 'AI 生成草稿'}
              </Button>
              <p className="text-[11px] text-(--text-muted) leading-relaxed">
                AI 会根据描述生成 {assetType === 'character' ? '名称 / 外貌 / 性格 / 性别' : '名称 / 环境 / 光线 / 氛围'} 等字段，
                生成后可自由编辑，再点击「创建」落库。
              </p>
            </div>
          ) : (
            /* 手动模式：常规表单 */
            <>
              <Input
                label="名称"
                size="sm"
                isRequired
                placeholder={cfg.placeholder}
                value={name}
                onValueChange={setName}
                isDisabled={disabled}
                autoFocus
                maxLength={64}
              />

              <Textarea
                label="简介（可选）"
                size="sm"
                minRows={2}
                maxRows={6}
                placeholder={
                  assetType === 'character'
                    ? '简单描述角色身份、性格、特征等'
                    : '简单描述影棚地点、环境、氛围等'
                }
                value={description}
                onValueChange={setDescription}
                isDisabled={disabled}
                maxLength={1200}
              />

              {assetType === 'character' && (
                <Select
                  label="性别"
                  size="sm"
                  selectedKeys={[gender]}
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as 'unknown' | 'male' | 'female';
                    if (k) setGender(k);
                  }}
                  isDisabled={disabled}
                >
                  <SelectItem key="unknown">未定</SelectItem>
                  <SelectItem key="male">男</SelectItem>
                  <SelectItem key="female">女</SelectItem>
                </Select>
              )}

              {/* 场景 AI 生成的详细字段（生成后显示；若空则隐藏） */}
              {assetType === 'scene' && (environment || lighting || mood) && (
                <div className="space-y-2 p-2 rounded-md bg-(--bg-input) border border-(--border-color)">
                  <div className="text-[11px] text-(--text-muted)">AI 生成的细节（可继续编辑，将一并存入）</div>
                  <Textarea
                    label="环境"
                    size="sm"
                    minRows={2}
                    maxRows={4}
                    value={environment}
                    onValueChange={setEnvironment}
                    isDisabled={disabled}
                    maxLength={500}
                  />
                  <Textarea
                    label="光线"
                    size="sm"
                    minRows={2}
                    maxRows={4}
                    value={lighting}
                    onValueChange={setLighting}
                    isDisabled={disabled}
                    maxLength={500}
                  />
                  <Textarea
                    label="氛围"
                    size="sm"
                    minRows={2}
                    maxRows={4}
                    value={mood}
                    onValueChange={setMood}
                    isDisabled={disabled}
                    maxLength={500}
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="flat" onPress={onClose} isDisabled={disabled}>
            取消
          </Button>
          {mode === 'manual' && (
            <Button
              size="sm"
              color="primary"
              onPress={handleSubmit}
              isLoading={submitting}
              isDisabled={disabled || !name.trim()}
            >
              创建
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateAssetModal;
