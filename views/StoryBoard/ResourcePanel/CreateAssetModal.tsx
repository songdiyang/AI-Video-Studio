/**
 * 资源自由添加弹窗
 * ────────────────────────────────────────────────────────
 * 轻量三合一弹窗（角色 / 场景），支持在项目工作台资源面板
 * 快速添加一个新资产，填入最基础的名称与描述，创建成功后自动刷新列表。
 * 深度编辑（appearance/personality/environment/lighting/mood 等）仍在各自详情弹窗中完成。
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
import { User as UserIcon, MapPin } from 'lucide-react';
import { createCharacter, createScene } from '../../../services/assets';

export type CreateAssetType = 'character' | 'scene';

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
    title: '新建场景',
    icon: <MapPin className="w-4 h-4" />,
    placeholder: '例如：夜晚街道 / 主角家客厅',
  },
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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<'unknown' | 'male' | 'female'>('unknown');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 每次打开时重置
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setGender('unknown');
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, assetType]);

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
          // 后端字段名为 projectId（驼峰）
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
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
          <Input
            label="名称"
            size="sm"
            isRequired
            placeholder={cfg.placeholder}
            value={name}
            onValueChange={setName}
            isDisabled={submitting}
            autoFocus
            maxLength={64}
          />

          <Textarea
            label="简介（可选）"
            size="sm"
            minRows={2}
            maxRows={4}
            placeholder={
              assetType === 'character'
                ? '简单描述角色身份、性格、特征等'
                : '简单描述场景地点、环境、氛围等'
            }
            value={description}
            onValueChange={setDescription}
            isDisabled={submitting}
            maxLength={500}
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
              isDisabled={submitting}
            >
              <SelectItem key="unknown">未定</SelectItem>
              <SelectItem key="male">男</SelectItem>
              <SelectItem key="female">女</SelectItem>
            </Select>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
              {error}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="flat" onPress={onClose} isDisabled={submitting}>
            取消
          </Button>
          <Button
            size="sm"
            color="primary"
            onPress={handleSubmit}
            isLoading={submitting}
            isDisabled={!name.trim()}
          >
            创建
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateAssetModal;
