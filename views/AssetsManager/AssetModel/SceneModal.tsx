import React, { useEffect, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem } from '@heroui/react';
import { FolderOpen, Sparkles, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Project } from '../../../services/projects';
import {
  fetchSceneStyled,
  generateSceneStyled,
  SceneStyledImage,
} from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';

interface SceneModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  userProjects?: Project[];
  /** 当前上下文项目ID（用于触发项目画风版渲染） */
  projectId?: number | null;
  /** 图像生成模型 */
  selectedImageModel?: string;
}

const inputClassNames = {
  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
  label: "text-[var(--text-secondary)] font-medium",
  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm"
};

const selectClassNames = {
  trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 shadow-sm data-[hover=true]:bg-[var(--bg-card)]",
  value: "text-[var(--text-primary)]",
  label: "text-[var(--text-secondary)] font-medium",
  popoverContent: "bg-[var(--bg-elevated)] border border-[var(--border-color)]"
};

const SceneModal: React.FC<SceneModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  formData,
  setFormData,
  onSave,
  userProjects = [],
  projectId = null,
  selectedImageModel = ''
}) => {
  const { showToast } = useToast();
  const [styled, setStyled] = useState<SceneStyledImage | null>(null);
  const [styleFingerprint, setStyleFingerprint] = useState<string>('');
  const [stale, setStale] = useState<boolean>(false);
  const [loadingStyled, setLoadingStyled] = useState(false);
  const [generatingStyled, setGeneratingStyled] = useState(false);

  // 项目画风版可用条件：编辑模式 + 已有场景ID + 上下文项目
  const styledAvailable = editMode && !!formData?.id && !!projectId;

  const loadStyled = async () => {
    if (!styledAvailable) return;
    setLoadingStyled(true);
    try {
      const res = await fetchSceneStyled(formData.id, projectId!);
      setStyled(res.styled);
      setStyleFingerprint(res.styleFingerprint || '');
      setStale(!!res.stale);
    } catch (err: any) {
      console.error('读取场景画风版失败:', err);
    } finally {
      setLoadingStyled(false);
    }
  };

  useEffect(() => {
    if (isOpen && styledAvailable) {
      loadStyled();
    } else if (!isOpen) {
      setStyled(null);
      setStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, formData?.id, projectId]);

  const pollStyled = async () => {
    if (!styledAvailable) return;
    const max = 60;
    let n = 0;
    const check = async () => {
      try {
        const res = await fetchSceneStyled(formData.id, projectId!);
        setStyled(res.styled);
        setStyleFingerprint(res.styleFingerprint || '');
        setStale(!!res.stale);
        const st = res.styled?.generation_status;
        if (st === 'completed') {
          setGeneratingStyled(false);
          showToast('场景项目画风版已生成', 'success');
          return;
        }
        if (st === 'failed') {
          setGeneratingStyled(false);
          showToast(res.styled?.generation_error || '场景画风版生成失败', 'error');
          return;
        }
        n++;
        if (n < max) setTimeout(check, 5000);
        else {
          setGeneratingStyled(false);
          showToast('生成超时，请稍后刷新查看', 'warning');
        }
      } catch (err) {
        setGeneratingStyled(false);
        console.error('轮询场景画风状态失败:', err);
      }
    };
    check();
  };

  const handleGenerateStyled = async () => {
    if (!styledAvailable) return;
    if (!selectedImageModel) {
      showToast('请先在顶部选择图像生成模型', 'error');
      return;
    }
    if (!formData.image_url) {
      showToast('请先为场景上传或生成原始图', 'warning');
      return;
    }
    setGeneratingStyled(true);
    try {
      await generateSceneStyled(formData.id, {
        projectId: projectId!,
        imageModel: selectedImageModel,
      });
      showToast('场景项目画风版生成任务已启动', 'success');
      pollStyled();
    } catch (err: any) {
      setGeneratingStyled(false);
      showToast(err?.message || '画风版生成失败', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-[var(--bg-elevated)] backdrop-blur-xl border border-[var(--border-color)] shadow-2xl shadow-black/40",
        header: "border-b border-[var(--border-color)]",
        body: "py-6"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-[var(--text-primary)] font-bold">
              {editMode ? '编辑' : '新建'}场景
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* 所属项目选择器 */}
              <Select
                label="所属项目"
                placeholder="选择所属项目（可选）"
                selectedKeys={formData.project_id ? [String(formData.project_id)] : []}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string;
                  setFormData({ ...formData, project_id: val ? Number(val) : undefined });
                }}
                isDisabled={editMode}
                startContent={<FolderOpen className="w-4 h-4 text-blue-400" />}
                classNames={{
                  ...selectClassNames,
                  label: "text-[var(--text-secondary)] font-medium"
                }}
                description={editMode ? '编辑模式下不可更改所属项目' : '选择后场景可在该项目的分镜中调用'}
              >
                {userProjects.map((p) => (
                  <SelectItem key={String(p.id)} textValue={p.name}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      <span>{p.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </Select>

              {/* 基本信息 */}
              <Input
                label="名称"
                placeholder="输入场景名称"
                value={formData.name}
                onValueChange={(val) => setFormData({ ...formData, name: val })}
                isRequired
                classNames={inputClassNames}
              />
              
              <Textarea
                label="描述"
                placeholder="输入详细描述"
                value={formData.description}
                onValueChange={(val) => setFormData({ ...formData, description: val })}
                minRows={3}
                classNames={inputClassNames}
              />

              <Input
                label="环境"
                placeholder="环境描述（建筑结构、空间布局、物品摆设等）"
                value={formData.environment}
                onValueChange={(val) => setFormData({ ...formData, environment: val })}
                classNames={inputClassNames}
              />

              <Input
                label="光线"
                placeholder="光线效果（光线来源、明暗对比、色调等）"
                value={formData.lighting}
                onValueChange={(val) => setFormData({ ...formData, lighting: val })}
                classNames={inputClassNames}
              />

              <Input
                label="氛围"
                placeholder="氛围感觉（紧张、温馨、诡异等）"
                value={formData.mood}
                onValueChange={(val) => setFormData({ ...formData, mood: val })}
                classNames={inputClassNames}
              />

              <Input
                label="图片URL"
                placeholder="图片地址（选填）"
                value={formData.image_url}
                onValueChange={(val) => setFormData({ ...formData, image_url: val })}
                classNames={inputClassNames}
              />

              <Input
                label="标签"
                placeholder="多个标签用逗号分隔"
                value={formData.tags}
                onValueChange={(val) => setFormData({ ...formData, tags: val })}
                classNames={inputClassNames}
              />

              {/* 项目画风版渲染 */}
              {styledAvailable && (
                <div className="space-y-2 rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      项目画风版
                      {styled?.generation_status === 'completed' && !stale && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">已渲染</span>
                      )}
                      {styled?.generation_status === 'completed' && stale && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">画风已变更</span>
                      )}
                      {(generatingStyled || styled?.generation_status === 'generating') && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />生成中
                        </span>
                      )}
                      {styled?.generation_status === 'failed' && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-400">失败</span>
                      )}
                    </h5>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    以场景原始图为参考，叠加项目画风提示词渲染。只保留该项目有效，不影响其他项目引用。
                  </p>
                  {styled?.generation_status === 'completed' && styled?.image_url && (
                    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                      <img src={styled.image_url} alt="场景画风版" className="w-full object-cover" />
                    </div>
                  )}
                  {styled?.generation_status === 'failed' && styled?.generation_error && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{styled.generation_error}</p>
                  )}
                  {!styled && !loadingStyled && (
                    <div className="rounded-lg p-4 flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}>
                      <ImageIcon className="w-5 h-5 mr-2" style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>尚未生成项目画风版</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="flat"
                    className="w-full bg-linear-to-r from-teal-500/20 to-emerald-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30"
                    startContent={<Sparkles className="w-4 h-4" />}
                    onPress={handleGenerateStyled}
                    isLoading={generatingStyled}
                    isDisabled={generatingStyled}
                  >
                    {styled?.generation_status === 'completed'
                      ? (stale ? '画风已更新，重新渲染' : '重新渲染项目画风版')
                      : '为当前项目渲染画风版'}
                  </Button>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="font-semibold text-[var(--text-secondary)]">
                取消
              </Button>
              <Button 
                className="pro-btn-primary"
                onPress={onSave}
              >
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default SceneModal;
