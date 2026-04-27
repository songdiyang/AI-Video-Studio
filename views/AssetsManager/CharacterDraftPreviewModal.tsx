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
  Chip,
} from '@heroui/react';
import { Sparkles, Wand2, User, Shirt, Image as ImageIcon, Palette, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  aiGenerateCharacterDraft,
  aiCommitCharacterDraft,
  type AiCharacterDraft,
  type AiDraftResponse,
  type AiCommitResponse,
} from '../../services/assets';

interface AIModel {
  name: string;
  displayName?: string;
  type?: string;
  category?: string;
}

interface CharacterDraftPreviewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName?: string;
  aiModels: AIModel[];
  defaultTextModel?: string;
  defaultImageModel?: string;
  onCommitted?: (result: AiCommitResponse) => void;
  onError?: (msg: string) => void;
}

type Stage = 'input' | 'preview' | 'committing';

const GENDER_OPTIONS: { value: AiCharacterDraft['gender']; label: string }[] = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'unknown', label: '未知 / 其他' },
];

const CharacterDraftPreviewModal: React.FC<CharacterDraftPreviewModalProps> = ({
  isOpen,
  onOpenChange,
  projectId,
  projectName,
  aiModels,
  defaultTextModel,
  defaultImageModel,
  onCommitted,
  onError,
}) => {
  const [stage, setStage] = useState<Stage>('input');
  const [userDescription, setUserDescription] = useState('');
  const [textModel, setTextModel] = useState(defaultTextModel || '');
  const [imageModel, setImageModel] = useState(defaultImageModel || '');

  const [drafting, setDrafting] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [draft, setDraft] = useState<AiCharacterDraft | null>(null);
  const [projectStyle, setProjectStyle] = useState<AiDraftResponse['projectStyle'] | null>(null);
  const [estimatedResources, setEstimatedResources] = useState<AiDraftResponse['estimatedResources'] | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState<AiDraftResponse['estimatedCredits'] | null>(null);

  const textModels = useMemo(
    () => aiModels.filter((m) => (m.type || m.category || '').toUpperCase() === 'TEXT'),
    [aiModels]
  );
  const imageModels = useMemo(
    () => aiModels.filter((m) => (m.type || m.category || '').toUpperCase() === 'IMAGE'),
    [aiModels]
  );

  // 打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setStage('input');
      setUserDescription('');
      setDraft(null);
      setProjectStyle(null);
      setEstimatedResources(null);
      setEstimatedCredits(null);
      setDrafting(false);
      setCommitting(false);
      setTextModel(defaultTextModel || textModels[0]?.name || '');
      setImageModel(defaultImageModel || imageModels[0]?.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleGenerateDraft = async () => {
    if (!userDescription.trim()) {
      onError?.('请填写角色描述');
      return;
    }
    if (!textModel) {
      onError?.('请选择文本模型');
      return;
    }
    setDrafting(true);
    try {
      const res = await aiGenerateCharacterDraft({
        projectId,
        userDescription: userDescription.trim(),
        textModel,
      });
      setDraft(res.draft);
      setProjectStyle(res.projectStyle);
      setEstimatedResources(res.estimatedResources);
      setEstimatedCredits(res.estimatedCredits);
      setStage('preview');
    } catch (err: any) {
      console.error('[CharacterDraftPreviewModal] 生成草稿失败:', err);
      onError?.(err?.message || 'AI 生成草稿失败');
    } finally {
      setDrafting(false);
    }
  };

  const handleCommit = async () => {
    if (!draft) return;
    if (!draft.name?.trim()) {
      onError?.('角色姓名不能为空');
      return;
    }
    if (!imageModel) {
      onError?.('请选择图像模型');
      return;
    }
    setCommitting(true);
    setStage('committing');
    try {
      const res = await aiCommitCharacterDraft({
        projectId,
        draft,
        imageModel,
        textModel,
      });
      onCommitted?.(res);
      onOpenChange(false);
    } catch (err: any) {
      console.error('[CharacterDraftPreviewModal] 提交草稿失败:', err);
      onError?.(err?.message || 'AI 提交角色失败');
      setStage('preview');
    } finally {
      setCommitting(false);
    }
  };

  const updateDraft = (patch: Partial<AiCharacterDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
      isDismissable={!drafting && !committing}
      hideCloseButton={drafting || committing}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <span>AI 智能生成角色</span>
              {projectName && (
                <Chip size="sm" variant="flat" color="primary" className="ml-2">
                  {projectName}
                </Chip>
              )}
            </ModalHeader>

            <ModalBody className="space-y-4">
              {/* ===== 阶段 1：输入描述 ===== */}
              {stage === 'input' && (
                <>
                  <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-(--text-muted) flex gap-2">
                    <AlertCircle className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>描述你想要的角色（外貌、性格、身份、服装等），AI 将生成草稿供你预览和编辑。</p>
                      <p>生成的角色将绑定到当前项目，并自动使用项目的视觉风格。</p>
                    </div>
                  </div>

                  <Textarea
                    label="角色描述"
                    placeholder="例：一个 20 岁左右的银发少女，高中生，穿着白色连衣裙，性格温柔内向，喜欢读书……"
                    value={userDescription}
                    onValueChange={setUserDescription}
                    minRows={4}
                    maxRows={8}
                    isDisabled={drafting}
                  />

                  <Select
                    label="文本模型"
                    selectedKeys={textModel ? [textModel] : []}
                    onChange={(e) => setTextModel(e.target.value)}
                    isDisabled={drafting}
                  >
                    {textModels.map((m) => (
                      <SelectItem key={m.name}>{m.displayName || m.name}</SelectItem>
                    ))}
                  </Select>
                </>
              )}

              {/* ===== 阶段 2：预览草稿 ===== */}
              {(stage === 'preview' || stage === 'committing') && draft && (
                <>
                  {/* 项目画风信息 */}
                  {projectStyle && (
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 flex items-start gap-2">
                      <Palette className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-(--text-muted)">项目画风：</span>
                          {projectStyle.hasStyle ? (
                            <Chip size="sm" variant="flat" color="primary">
                              {projectStyle.visualStyle || '已设置'}
                            </Chip>
                          ) : (
                            <Chip size="sm" variant="flat" color="warning">
                              未设置
                            </Chip>
                          )}
                        </div>
                        {projectStyle.hasStyle && projectStyle.visualStylePrompt && (
                          <p className="text-(--text-muted) line-clamp-2">
                            {projectStyle.visualStylePrompt}
                          </p>
                        )}
                        {!projectStyle.hasStyle && (
                          <p className="text-warning">
                            建议先在项目设置中配置视觉风格，否则画风版生成效果可能不稳定。
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 角色卡片（可编辑） */}
                  <div className="p-4 rounded-lg border border-(--border-color) space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
                      <User className="w-4 h-4 text-violet-500" />
                      角色草稿（可编辑）
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="姓名"
                        value={draft.name}
                        onValueChange={(v) => updateDraft({ name: v })}
                        isDisabled={committing}
                      />
                      <Select
                        label="性别"
                        selectedKeys={[draft.gender]}
                        onChange={(e) => updateDraft({ gender: e.target.value as AiCharacterDraft['gender'] })}
                        isDisabled={committing}
                      >
                        {GENDER_OPTIONS.map((o) => (
                          <SelectItem key={o.value}>{o.label}</SelectItem>
                        ))}
                      </Select>
                    </div>

                    <Textarea
                      label="白膜体貌（base_appearance）"
                      description="外貌、体型、发型、面部特征等（不含服装）"
                      value={draft.base_appearance}
                      onValueChange={(v) => updateDraft({ base_appearance: v })}
                      minRows={2}
                      maxRows={5}
                      isDisabled={committing}
                    />

                    <Textarea
                      label="服装装饰（outfit_appearance）"
                      description="穿戴的服饰、配饰、鞋履等"
                      value={draft.outfit_appearance}
                      onValueChange={(v) => updateDraft({ outfit_appearance: v })}
                      minRows={2}
                      maxRows={5}
                      isDisabled={committing}
                    />

                    <Textarea
                      label="性格"
                      value={draft.personality}
                      onValueChange={(v) => updateDraft({ personality: v })}
                      minRows={2}
                      maxRows={4}
                      isDisabled={committing}
                    />

                    <Textarea
                      label="背景描述"
                      value={draft.description}
                      onValueChange={(v) => updateDraft({ description: v })}
                      minRows={2}
                      maxRows={4}
                      isDisabled={committing}
                    />
                  </div>

                  {/* 关联资源视图 */}
                  <div className="p-4 rounded-lg border border-(--border-color) space-y-2">
                    <div className="text-sm font-semibold text-(--text-primary) mb-2">
                      将要创建的关联资源
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 flex items-center gap-2">
                        <User className="w-5 h-5 text-violet-500" />
                        <div className="text-xs">
                          <div className="font-semibold text-(--text-primary)">角色 ×1</div>
                          <div className="text-(--text-muted)">绑定项目画风</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-pink-500/5 border border-pink-500/20 flex items-center gap-2">
                        <Shirt className="w-5 h-5 text-pink-500" />
                        <div className="text-xs">
                          <div className="font-semibold text-(--text-primary)">服装 ×1</div>
                          <div className="text-(--text-muted)">默认装（已装备）</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-cyan-500" />
                        <div className="text-xs">
                          <div className="font-semibold text-(--text-primary)">状态 ×1</div>
                          <div className="text-(--text-muted)">基础白膜</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-(--text-muted) mt-2">
                      白膜生成完成后，系统将自动为默认服装生成画风版状态。
                    </div>
                  </div>

                  {/* 积分预估 */}
                  {estimatedCredits && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                      <div className="flex items-center gap-2 text-(--text-primary) font-semibold mb-1">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        积分预估
                      </div>
                      <div className="text-(--text-muted) space-y-0.5">
                        <div>白膜三视图：约 {estimatedCredits.whiteModel} 张图片</div>
                        <div>默认服装画风版：约 {estimatedCredits.styledState} 张图片</div>
                        <div className="font-semibold text-(--text-primary)">
                          合计：约 {estimatedCredits.totalImages} 张图片
                        </div>
                        {estimatedCredits.note && (
                          <div className="text-(--text-muted) italic">{estimatedCredits.note}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 图像模型选择 */}
                  <Select
                    label="图像模型"
                    selectedKeys={imageModel ? [imageModel] : []}
                    onChange={(e) => setImageModel(e.target.value)}
                    isDisabled={committing}
                  >
                    {imageModels.map((m) => (
                      <SelectItem key={m.name}>{m.displayName || m.name}</SelectItem>
                    ))}
                  </Select>

                  {stage === 'committing' && (
                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-xs flex items-center gap-2 text-(--text-primary)">
                      <CheckCircle2 className="w-4 h-4 text-green-500 animate-pulse" />
                      正在创建资源并启动白膜生成 workflow…
                    </div>
                  )}
                </>
              )}
            </ModalBody>

            <ModalFooter>
              {stage === 'input' && (
                <>
                  <Button
                    variant="flat"
                    onPress={() => onOpenChange(false)}
                    isDisabled={drafting}
                  >
                    取消
                  </Button>
                  <Button
                    color="primary"
                    startContent={!drafting && <Wand2 className="w-4 h-4" />}
                    isLoading={drafting}
                    onPress={handleGenerateDraft}
                  >
                    {drafting ? 'AI 正在生成草稿…' : '生成草稿'}
                  </Button>
                </>
              )}
              {(stage === 'preview' || stage === 'committing') && (
                <>
                  <Button
                    variant="flat"
                    onPress={() => setStage('input')}
                    isDisabled={committing}
                  >
                    重新生成
                  </Button>
                  <Button
                    color="primary"
                    startContent={!committing && <Sparkles className="w-4 h-4" />}
                    isLoading={committing}
                    onPress={handleCommit}
                  >
                    {committing ? '创建中…' : '确认生成'}
                  </Button>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CharacterDraftPreviewModal;
