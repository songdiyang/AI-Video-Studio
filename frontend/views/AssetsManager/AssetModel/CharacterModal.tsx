import React, { useState, useEffect, useMemo } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem, Tabs, Tab, Chip } from '@heroui/react';
import { Image as ImageIcon, User, Layers, FolderOpen, Plus, Tag as TagIcon } from 'lucide-react';
import { Project } from '../../../services/projects';
import {
  TagGroup,
  CharacterState,
  updateCharacterUseReferenceImages
} from '../../../services/assets';
import CharacterStateEditor from './CharacterStateEditor';
import ReferenceImageManager from './ReferenceImageManager';

interface CharacterModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  editMode: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  tagGroups: TagGroup[];
  onTagGroupsChange?: () => void;
  onRefreshCharacter?: () => void;
  userProjects?: Project[];
  /** 当前上下文项目ID，用于状态编辑器展示"项目画风版"入口 */
  projectId?: number | null;
}

const CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  onOpenChange,
  editMode,
  formData,
  setFormData,
  onSave,
  tagGroups,
  onTagGroupsChange,
  onRefreshCharacter,
  userProjects = [],
  projectId = null
}) => {
  // 参考图启用状态
  const [useReferenceImages, setUseReferenceImages] = useState(formData.use_reference_images !== false);

  // Tab 状态
  const [activeTab, setActiveTab] = useState<string>('basic');

  // 标签输入缓冲
  const [tagInput, setTagInput] = useState('');

  // 当前标签数组（从 formData.tags 解析，保持以逗号分隔存储以兼容列表/筛选/搜索）
  const tagList = useMemo<string[]>(() => {
    const raw = (formData.tags ?? '') as string;
    if (!raw) return [];
    return raw
      .split(/[,，]/)
      .map((t: string) => t.trim())
      .filter(Boolean);
  }, [formData.tags]);

  const commitTags = (list: string[]) => {
    // 去重 + 去空
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
    // 支持一次性输入多个（逗号分隔）粘贴
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
      // 输入为空时按退格删除最后一个标签
      removeTag(tagList[tagList.length - 1]);
    }
  };

  // 同步参考图启用状态
  useEffect(() => {
    setUseReferenceImages(formData.use_reference_images !== false);
  }, [formData.use_reference_images]);

  // 处理参考图开关变更
  const handleUseReferenceImagesChange = async (enabled: boolean) => {
    if (!formData.id) return;

    try {
      await updateCharacterUseReferenceImages(formData.id, enabled);
      setUseReferenceImages(enabled);
      setFormData({ ...formData, use_reference_images: enabled });
    } catch (error: any) {
      console.error('更新参考图设置失败:', error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/40",
        header: "border-b border-slate-700/50",
        body: "py-6"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-slate-100 font-bold">
              {editMode ? '编辑' : '新建'}角色
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* Tab 导航 */}
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                classNames={{
                  tabList: "bg-slate-800/60 border border-slate-700/50",
                  tab: "text-slate-400 data-[selected=true]:text-slate-100",
                  cursor: "bg-blue-500/20",
                  panel: "py-4"
                }}
              >
                {/* 基础信息 Tab */}
                <Tab
                  key="basic"
                  title={
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4" />
                      <span>基础信息</span>
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
                        trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                        value: "text-slate-100",
                        label: "text-slate-400 font-medium",
                        popoverContent: "bg-slate-800 border border-slate-700"
                      }}
                      description={editMode ? '编辑模式下不可更改所属项目' : '选择后角色可在该项目的分镜中调用'}
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

                    <Input
                      label="名称"
                      placeholder="输入角色名称"
                      value={formData.name}
                      onValueChange={(val) => setFormData({ ...formData, name: val })}
                      classNames={{
                        input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                        label: "text-slate-400 font-medium",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                      }}
                    />

                    <Textarea
                      label="描述"
                      placeholder="输入角色背景故事、性格特点等"
                      value={formData.description}
                      onValueChange={(val) => setFormData({ ...formData, description: val })}
                      minRows={3}
                      classNames={{
                        input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                        label: "text-slate-400 font-medium",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                      }}
                    />

                    <Input
                      label="性格"
                      placeholder="性格特点"
                      value={formData.personality}
                      onValueChange={(val) => setFormData({ ...formData, personality: val })}
                      classNames={{
                        input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                        label: "text-slate-400 font-medium",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                      }}
                    />

                    {/* 标签：已生成标签区 与 输入区分离 */}
                    <div className="space-y-2">
                      <label className="text-slate-400 font-medium text-xs flex items-center gap-1">
                        <TagIcon className="w-3 h-3" />
                        标签
                        <span className="text-[10px] text-slate-500 font-normal ml-1">（方便管理和搜索分类）</span>
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
                        <p className="text-[11px] text-slate-500">
                          已添加 {tagList.length} 个标签 · 点击标签上的 × 移除，输入框为空时按退格删除最后一个
                        </p>
                      )}
                    </div>
                  </div>
                </Tab>

                {/* 状态管理 Tab */}
                <Tab
                  key="states"
                  title={
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      <span>状态管理</span>
                    </div>
                  }
                >
                  <CharacterStateEditor
                    characterId={editMode && formData.id ? formData.id : null}
                    disabled={!editMode || !formData.id}
                    projectId={projectId}
                    tagGroups={tagGroups}
                    onTagGroupsChange={onTagGroupsChange}
                    formData={formData}
                    setFormData={setFormData}
                    onStateActivated={(state: CharacterState) => {
                      // 当状态被激活时，更新角色主图
                      if (state.image_url || state.front_view_url) {
                        setFormData({
                          ...formData,
                          image_url: state.image_url || state.front_view_url
                        });
                      }
                      // 刷新角色数据
                      onRefreshCharacter?.();
                    }}
                  />
                </Tab>

                {/* 参考图 Tab */}
                <Tab
                  key="references"
                  title={
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" />
                      <span>参考图</span>
                    </div>
                  }
                >
                  {editMode && formData.id ? (
                    <ReferenceImageManager
                      assetType="character"
                      assetId={formData.id}
                      showGlobalToggle={true}
                      globalEnabled={useReferenceImages}
                      onGlobalEnabledChange={handleUseReferenceImagesChange}
                    />
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">请先保存角色后管理参考图</p>
                    </div>
                  )}
                </Tab>
              </Tabs>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="font-semibold text-slate-400">
                取消
              </Button>
              <Button
                className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-lg shadow-blue-500/20"
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

export default CharacterModal;
