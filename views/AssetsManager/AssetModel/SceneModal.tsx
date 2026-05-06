import React, { useState, useRef, useMemo } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem, useDisclosure, Progress, Tabs, Tab, Chip } from '@heroui/react';
import { FolderOpen, Image as ImageIcon, Upload, Trash2, Eye, ImagePlus, Layers, Tag as TagIcon, Plus } from 'lucide-react';
import { Project } from '../../../services/projects';
import {
  uploadSceneReferenceImage,
  deleteSceneReferenceImage,
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
  userProjects = []
}) => {
  const { showToast } = useToast();
  const [uploadingRef, setUploadingRef] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [tagInput, setTagInput] = useState('');
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const { isOpen: isPreviewOpen, onOpen: onPreviewOpen, onOpenChange: onPreviewOpenChange } = useDisclosure();

  // 标签数组（以逗号分隔存储以兼容现有筛选/展示）
  const tagList = useMemo<string[]>(() => {
    const raw = (formData.tags ?? '') as string;
    if (!raw) return [];
    return raw
      .split(/[,，]/)
      .map((t: string) => t.trim())
      .filter(Boolean);
  }, [formData.tags]);

  const commitTags = (list: string[]) => {
    const uniq: string[] = [];
    list.forEach(t => {
      const v = t.trim();
      if (v && !uniq.includes(v)) uniq.push(v);
    });
    setFormData({ ...formData, tags: uniq.join(',') });
  };

  const addTagFromInput = () => {
    const raw = tagInput;
    if (!raw) return;
    const pieces = raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (pieces.length === 0) {
      setTagInput('');
      return;
    }
    commitTags([...tagList, ...pieces]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    commitTags(tagList.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === 'Backspace' && !tagInput && tagList.length > 0) {
      removeTag(tagList[tagList.length - 1]);
    }
  };

  const handleUpload = async (file: File) => {
    if (!formData.id) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('只允许上传 PNG / JPEG / WebP 图片', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件大小超过限制（最大 10MB）', 'error');
      return;
    }
    setUploadingRef(true);
    try {
      const result = await uploadSceneReferenceImage(formData.id, file);
      setFormData({ ...formData, reference_image_url: result.reference_image_url });
      showToast('参考图上传成功', 'success');
    } catch (err: any) {
      showToast(err?.message || '上传参考图失败', 'error');
    } finally {
      setUploadingRef(false);
    }
  };

  const handleDeleteRef = async () => {
    if (!formData.id) return;
    try {
      await deleteSceneReferenceImage(formData.id);
      setFormData({ ...formData, reference_image_url: null });
      showToast('参考图已删除', 'success');
    } catch (err: any) {
      showToast(err?.message || '删除参考图失败', 'error');
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
            <ModalBody className="py-2">
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                classNames={{
                  tabList: "bg-[var(--bg-secondary)] border border-[var(--border-color)]",
                  tab: "text-[var(--text-secondary)] data-[selected=true]:text-[var(--text-primary)]",
                  cursor: "bg-blue-500/20",
                  panel: "py-4"
                }}
              >
                {/* 场景要素 Tab */}
                <Tab
                  key="basic"
                  title={
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      <span>场景要素</span>
                    </div>
                  }
                >
                  <div className="space-y-4">
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

                    {/* 标签：已生成标签区 与 输入区分离（与角色标签一致） */}
                    <div className="space-y-2">
                      <label className="text-[var(--text-secondary)] font-medium text-xs flex items-center gap-1">
                        <TagIcon className="w-3 h-3" />
                        标签
                        <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">（方便管理和搜索分类）</span>
                      </label>

                      {/* 已生成标签区域 */}
                      {tagList.length > 0 ? (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-2.5 flex flex-wrap gap-1.5">
                          {tagList.map((tag) => (
                            <Chip
                              key={tag}
                              size="sm"
                              variant="solid"
                              color="primary"
                              onClose={() => removeTag(tag)}
                              classNames={{
                                base: "bg-blue-600 dark:bg-blue-500/90 border border-blue-700/40 dark:border-blue-400/40 shadow-sm",
                                content: "text-white font-medium text-xs px-1",
                                closeButton: "text-white/85 hover:text-white"
                              }}
                            >
                              {tag}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-800/30 border border-dashed border-slate-700/50 rounded-xl p-3 text-center text-[11px] text-slate-500">
                          暂无标签，在下方输入并按回车添加
                        </div>
                      )}

                      {/* 标签输入区域 */}
                      <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 rounded-xl shadow-sm px-2.5 py-1.5">
                        <TagIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagKeyDown}
                          onBlur={() => addTagFromInput()}
                          placeholder={tagList.length === 0 ? '输入标签后按回车添加，多个标签可用逗号分隔' : '继续添加标签…'}
                          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 py-1"
                        />
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          isDisabled={!tagInput.trim()}
                          onPress={addTagFromInput}
                          className="h-7 shrink-0"
                          startContent={<Plus className="w-3.5 h-3.5" />}
                        >
                          添加
                        </Button>
                      </div>
                      {tagList.length > 0 && (
                        <p className="text-[11px] text-slate-500">已添加 {tagList.length} 个标签 · 点击标签上的 × 移除，输入框为空时按退格删除最后一个</p>
                      )}
                    </div>
                  </div>
                </Tab>

                {/* 参考图 Tab */}
                <Tab
                  key="reference"
                  title={
                    <div className="flex items-center gap-1.5">
                      <ImagePlus className="w-4 h-4" />
                      <span>参考图</span>
                    </div>
                  }
                >
                  <div className="space-y-2 rounded-lg p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                        <ImagePlus className="w-3.5 h-3.5" />
                        参考图
                      </h5>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        生成场景图片时自动作为风格参考
                      </span>
                    </div>

                    {!editMode ? (
                      <div
                        className="rounded-lg p-6 flex flex-col items-center justify-center gap-2"
                        style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}
                      >
                        <ImageIcon className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>保存场景后可上传参考图</span>
                      </div>
                    ) : (
                      <div
                        className="relative flex flex-col max-w-xs"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        {formData.reference_image_url ? (
                          <div
                            className="relative aspect-[4/3] rounded-lg overflow-hidden group"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                          >
                            <img
                              src={formData.reference_image_url}
                              alt="场景参考图"
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={onPreviewOpen}
                            />
                            {isHovering && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2">
                                <button
                                  onClick={onPreviewOpen}
                                  className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                                  title="预览"
                                >
                                  <Eye className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    refFileInputRef.current?.click();
                                  }}
                                  className="p-2 bg-blue-500/80 rounded-lg hover:bg-blue-500 transition-colors"
                                  title="替换"
                                >
                                  <Upload className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRef();
                                  }}
                                  className="p-2 bg-red-500/80 rounded-lg hover:bg-red-500 transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            className="aspect-[4/3] rounded-lg flex flex-col items-center justify-center p-3"
                            style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}
                          >
                            {uploadingRef ? (
                              <div className="w-full px-2">
                                <div className="text-center mb-2">
                                  <Upload className="w-8 h-8 mx-auto mb-1 text-blue-400 animate-pulse" />
                                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>上传中...</p>
                                </div>
                                <Progress isIndeterminate size="sm" color="primary" className="w-full" />
                              </div>
                            ) : (
                              <>
                                <ImageIcon className="w-10 h-10 mb-3 opacity-50" style={{ color: 'var(--text-muted)' }} />
                                <Button
                                  size="sm"
                                  variant="flat"
                                  className="w-full h-8 text-xs bg-blue-600 text-white border border-blue-500 font-medium"
                                  onPress={() => refFileInputRef.current?.click()}
                                >
                                  <Upload className="w-3 h-3 mr-1" />
                                  上传本地图片
                                </Button>
                                <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
                                  支持 JPEG / PNG / WebP，最大 10MB
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <input
                      ref={refFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) await handleUpload(file);
                      }}
                    />
                  </div>
                </Tab>
              </Tabs>

              {/* 项目画风版渲染（已移除） */}
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

      {/* 参考图预览弹窗 */}
      <Modal
        isOpen={isPreviewOpen}
        onOpenChange={onPreviewOpenChange}
        size="3xl"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
          header: "border-b border-slate-700/50",
          body: "p-0"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-slate-100 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                <span>场景参考图</span>
              </ModalHeader>
              <ModalBody>
                {formData.reference_image_url && (
                  <img
                    src={formData.reference_image_url}
                    alt="场景参考图"
                    className="w-full max-h-[70vh] object-contain"
                  />
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} className="text-slate-400">关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Modal>
  );
};

export default SceneModal;
