import React, { useState, useEffect, useCallback } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Select, SelectItem, Popover, PopoverTrigger, PopoverContent, Tabs, Tab } from '@heroui/react';
import { Plus, X, Tag, Download, RefreshCw, Trash2, Image as ImageIcon, User, Layers, Sparkles, Upload } from 'lucide-react';
import { 
  TagGroup, 
  CharacterTagGroupEntry, 
  TAG_GROUP_COLORS, 
  createTagGroup,
  Character,
  CharacterState,
  generateCharacterViews,
  generateConceptBreakdown,
  getCharacterViewStatus,
  downloadCharacterView,
  downloadAllCharacterViews,
  deleteCharacterViewApi
} from '../../../services/assets';
import AIModelSelector, { AIModel } from '../../../components/AIModelSelector';
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
  aiModels?: AIModel[];
  selectedImageModel?: string;
  selectedTextModel?: string;
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
  aiModels = [],
  selectedImageModel = '',
  selectedTextModel = ''
}) => {
  // 当前选择的分组（用于添加新标签）
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  // 新标签输入
  const [newTagInput, setNewTagInput] = useState('');
  // 快速创建分组
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(TAG_GROUP_COLORS[0]);

  // 三视图生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [localImageModel, setLocalImageModel] = useState(selectedImageModel);

  // 概念分解图生成状态
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);
  const [conceptGenerationError, setConceptGenerationError] = useState<string | null>(null);

  // Tab 状态
  const [activeTab, setActiveTab] = useState<string>('basic');

  // 同步外部选中的模型
  useEffect(() => {
    if (selectedImageModel) {
      setLocalImageModel(selectedImageModel);
    }
  }, [selectedImageModel]);

  // 检查是否有任何三视图
  const hasAnyView = !!(formData.front_view_url || formData.side_view_url || formData.back_view_url);

  // 轮询生成状态
  useEffect(() => {
    if (!formData.id || formData.generation_status !== 'generating') {
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    const interval = setInterval(async () => {
      try {
        const status = await getCharacterViewStatus(formData.id);
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(interval);
          setIsGenerating(false);
          if (status.status === 'failed') {
            setGenerationError('生成失败，请重试');
          }
          // 刷新角色数据
          onRefreshCharacter?.();
        }
      } catch (error) {
        console.error('查询生成状态失败:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [formData.id, formData.generation_status, onRefreshCharacter]);

  // 轮询概念分解图生成状态
  useEffect(() => {
    if (!formData.id || formData.concept_generation_status !== 'generating') {
      setIsGeneratingConcept(false);
      return;
    }

    setIsGeneratingConcept(true);
    const interval = setInterval(async () => {
      try {
        const result = await getCharacterViewStatus(formData.id);
        const conceptStatus = result.conceptStatus || 'idle';
        if (conceptStatus === 'completed' || conceptStatus === 'failed') {
          clearInterval(interval);
          setIsGeneratingConcept(false);
          if (conceptStatus === 'failed') {
            setConceptGenerationError('生成失败，请重试');
          }
          onRefreshCharacter?.();
        }
      } catch (error) {
        console.error('查询概念分解图生成状态失败:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [formData.id, formData.concept_generation_status, onRefreshCharacter]);

  // 计算缺失的视图列表
  const missingViews = (() => {
    const missing: ('front' | 'side' | 'back')[] = [];
    if (!formData.front_view_url) missing.push('front');
    if (!formData.side_view_url) missing.push('side');
    if (!formData.back_view_url) missing.push('back');
    return missing;
  })();
  const isComplementMode = missingViews.length > 0 && missingViews.length < 3;

  // 一键生成 / 智能补全三视图
  const handleGenerateViews = useCallback(async () => {
    if (!formData.id) {
      setGenerationError('请先保存角色');
      return;
    }
    if (!localImageModel) {
      setGenerationError('请选择图片模型');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      // 如果是补全模式，传递缺失的视图列表
      const params: any = {
        imageModel: localImageModel,
        textModel: selectedTextModel || undefined
      };
      if (isComplementMode) {
        params.regenerateOnly = missingViews;
      }
      await generateCharacterViews(formData.id, params);
      // 更新本地状态以触发轮询
      setFormData({ ...formData, generation_status: 'generating' });
    } catch (error: any) {
      setIsGenerating(false);
      setGenerationError(error.message || '启动生成失败');
    }
  }, [formData, localImageModel, selectedTextModel, setFormData, isComplementMode, missingViews]);

  // 生成/重新生成概念分解图
  const handleGenerateConcept = useCallback(async () => {
    if (!formData.id) {
      setConceptGenerationError('请先保存角色');
      return;
    }
    if (!localImageModel) {
      setConceptGenerationError('请选择图片模型');
      return;
    }

    setIsGeneratingConcept(true);
    setConceptGenerationError(null);

    try {
      await generateConceptBreakdown(formData.id, {
        imageModel: localImageModel,
        textModel: selectedTextModel || undefined
      });
      // 更新本地状态以触发轮询
      setFormData({ ...formData, concept_generation_status: 'generating' });
    } catch (error: any) {
      setIsGeneratingConcept(false);
      setConceptGenerationError(error.message || '启动概念分解图生成失败');
    }
  }, [formData, localImageModel, selectedTextModel, setFormData]);

  // 下载单个视图
  const handleDownloadView = useCallback(async (viewType: 'front' | 'side' | 'back') => {
    const urlMap = {
      front: formData.front_view_url,
      side: formData.side_view_url,
      back: formData.back_view_url
    };
    const nameMap = {
      front: '正面',
      side: '侧面',
      back: '背面'
    };
    const url = urlMap[viewType];
    if (url) {
      await downloadCharacterView(url, `${formData.name || '角色'}_${nameMap[viewType]}.png`);
    }
  }, [formData]);

  // 下载全部三视图
  const handleDownloadAll = useCallback(async () => {
    try {
      await downloadAllCharacterViews(formData as Character);
    } catch (error: any) {
      console.error('下载失败:', error);
    }
  }, [formData]);

  // 删除单个视图（立即同步数据库）
  const handleDeleteView = useCallback(async (viewType: 'front' | 'side' | 'back') => {
    if (!formData.id) return;
    const fieldMap = {
      front: 'front_view_url',
      side: 'side_view_url',
      back: 'back_view_url'
    };
    try {
      const result = await deleteCharacterViewApi(formData.id, viewType);
      setFormData({
        ...formData,
        [fieldMap[viewType]]: '',
        ...(viewType === 'front' && result.image_url === null ? { image_url: '' } : {})
      });
    } catch (error: any) {
      console.error('删除视图失败:', error);
      // 降级：后端失败时仅清除前端状态
      setFormData({ ...formData, [fieldMap[viewType]]: '' });
    }
  }, [formData, setFormData]);

  // 获取当前的 tag_groups_json 数组
  const getTagGroupsJson = (): CharacterTagGroupEntry[] => {
    return formData.tag_groups_json || [];
  };

  // 添加标签到指定分组
  const handleAddTag = () => {
    if (!selectedGroupId || !newTagInput.trim()) return;

    const groupId = parseInt(selectedGroupId);
    const group = tagGroups.find(g => g.id === groupId);
    if (!group) return;

    const tagName = newTagInput.trim();
    const currentGroups = getTagGroupsJson();
    
    // 查找是否已有该分组的条目
    const existingEntry = currentGroups.find(e => e.groupId === groupId);
    
    let newGroups: CharacterTagGroupEntry[];
    if (existingEntry) {
      // 检查是否已存在该标签
      if (existingEntry.tags.includes(tagName)) {
        setNewTagInput('');
        return;
      }
      // 添加标签到已有分组
      newGroups = currentGroups.map(e => 
        e.groupId === groupId 
          ? { ...e, tags: [...e.tags, tagName] }
          : e
      );
    } else {
      // 创建新的分组条目
      newGroups = [...currentGroups, {
        groupId: groupId,
        groupName: group.name,
        tags: [tagName]
      }];
    }

    setFormData({ ...formData, tag_groups_json: newGroups });
    setNewTagInput('');
  };

  // 移除标签
  const handleRemoveTag = (groupId: number, tagName: string) => {
    const currentGroups = getTagGroupsJson();
    const newGroups = currentGroups
      .map(e => 
        e.groupId === groupId 
          ? { ...e, tags: e.tags.filter(t => t !== tagName) }
          : e
      )
      .filter(e => e.tags.length > 0); // 移除空分组

    setFormData({ ...formData, tag_groups_json: newGroups });
  };

  // 快速创建分组
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      await createTagGroup({
        name: newGroupName.trim(),
        color: newGroupColor
      });
      setNewGroupName('');
      setNewGroupColor(TAG_GROUP_COLORS[0]);
      setIsCreatingGroup(false);
      onTagGroupsChange?.();
    } catch (error: any) {
      console.error('创建分组失败:', error);
    }
  };

  // 获取分组颜色
  const getGroupColor = (groupId: number): string => {
    const group = tagGroups.find(g => g.id === groupId);
    return group?.color || '#6366f1';
  };

  // 键盘事件：回车添加标签
  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左侧：表单 */}
                <div className="space-y-4">
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
                    placeholder="输入详细描述"
                    value={formData.description}
                    onValueChange={(val) => setFormData({ ...formData, description: val })}
                    minRows={3}
                    classNames={{
                      input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                      label: "text-slate-400 font-medium",
                      inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                    }}
                  />

                  <div className="space-y-1.5">
                    <Textarea
                      label="外观特征（AI生成核心参数）"
                      placeholder={"请详细描述角色的固定外观特征，AI 将以此识别角色。\n示例：穿黑色西装的短发男生、扎高马尾穿白衬衫的女生\n\n建议包含：发型发色、服装款式颜色、配饰、体型、肤色、年龄特征等"}
                      value={formData.appearance}
                      onValueChange={(val) => setFormData({ ...formData, appearance: val })}
                      minRows={3}
                      maxRows={6}
                      classNames={{
                        input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                        label: "text-amber-400 font-medium",
                        inputWrapper: "bg-slate-800/60 border border-amber-500/30 hover:border-amber-500/50 shadow-sm"
                      }}
                    />
                    <p className="text-[10px] text-amber-400/70 px-1">
                      此字段是 AI 识别角色的核心依据，请确保描述唯一、具体且固定
                    </p>
                  </div>

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

                  {/* 标签分组编辑区 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-1">
                        <Tag className="w-4 h-4" />
                        标签分组
                      </label>
                      <Popover isOpen={isCreatingGroup} onOpenChange={setIsCreatingGroup}>
                        <PopoverTrigger>
                          <Button
                            size="sm"
                            variant="light"
                            className="text-blue-400 hover:bg-blue-500/10"
                            startContent={<Plus className="w-3 h-3" />}
                          >
                            新建分组
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="bg-slate-800 border border-slate-700 p-3 space-y-3">
                          <Input
                            size="sm"
                            placeholder="分组名称"
                            value={newGroupName}
                            onValueChange={setNewGroupName}
                            classNames={{
                              input: "bg-transparent text-slate-100",
                              inputWrapper: "bg-slate-700/60 border border-slate-600/50"
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            {TAG_GROUP_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={() => setNewGroupColor(color)}
                                className="w-7 h-7 rounded-full transition-all"
                                style={{
                                  backgroundColor: color,
                                  boxShadow: newGroupColor === color 
                                    ? `0 0 0 2px #1e293b, 0 0 0 4px ${color}` 
                                    : `0 0 0 1px rgba(255,255,255,0.15)`,
                                  transform: newGroupColor === color ? 'scale(1.15)' : 'scale(1)',
                                }}
                                title={color}
                              />
                            ))}
                          </div>
                          <Button
                            size="sm"
                            className="w-full bg-blue-500 text-white"
                            onPress={handleCreateGroup}
                          >
                            创建
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* 添加标签区域 */}
                    <div className="flex gap-2">
                      <Select
                        size="sm"
                        placeholder="选择分组"
                        selectedKeys={selectedGroupId ? [selectedGroupId] : []}
                        onSelectionChange={(keys) => {
                          const key = Array.from(keys)[0] as string;
                          setSelectedGroupId(key || '');
                        }}
                        classNames={{
                          trigger: "bg-slate-800/60 border border-slate-600/50",
                          value: "text-slate-100"
                        }}
                        className="flex-1"
                      >
                        {tagGroups.map((group) => (
                          <SelectItem key={group.id.toString()} textValue={group.name}>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: group.color }}
                              />
                              {group.name}
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                      <Input
                        size="sm"
                        placeholder="输入标签名，回车添加"
                        value={newTagInput}
                        onValueChange={setNewTagInput}
                        onKeyDown={handleTagInputKeyDown}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-blue-500 text-white"
                        onPress={handleAddTag}
                        isDisabled={!selectedGroupId || !newTagInput.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* 已添加的标签展示 */}
                    <div className="space-y-2">
                      {getTagGroupsJson().map((entry) => (
                        <div key={entry.groupId} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: getGroupColor(entry.groupId) }}
                            />
                            <span className="text-xs text-slate-500">{entry.groupName}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pl-4">
                            {entry.tags.map((tag, idx) => {
                              const color = getGroupColor(entry.groupId);
                              return (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                                  style={{
                                    backgroundColor: `${color}25`,
                                    color: color,
                                    border: `1.5px solid ${color}50`,
                                    boxShadow: `0 1px 2px ${color}15`,
                                  }}
                                >
                                  {tag}
                                  <button
                                    onClick={() => handleRemoveTag(entry.groupId, tag)}
                                    className="hover:bg-white/20 rounded-full p-0.5 transition-colors -mr-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 兼容旧的普通标签输入 */}
                    <Input
                      label="普通标签（兼容）"
                      placeholder="多个标签用逗号分隔"
                      value={formData.tags}
                      onValueChange={(val) => setFormData({ ...formData, tags: val })}
                      classNames={{
                        input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                        label: "text-slate-400 font-medium text-xs",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                      }}
                    />
                  </div>
                </div>

                {/* 右侧：图片显示 */}
                <div className="space-y-4">
                  {/* 角色深度概念分解图 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                        <Layers className="w-4 h-4" />
                        角色深度概念分解图
                      </label>
                      {/* 重新生成按钮（已有图片时显示） */}
                      {editMode && formData.id && formData.concept_image_url && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                          startContent={<RefreshCw className={`w-3 h-3 ${isGeneratingConcept ? 'animate-spin' : ''}`} />}
                          onPress={handleGenerateConcept}
                          isDisabled={isGeneratingConcept}
                        >
                          {isGeneratingConcept ? '重新生成中...' : '重新生成'}
                        </Button>
                      )}
                    </div>

                    {/* 概念分解图错误提示 */}
                    {conceptGenerationError && (
                      <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                        {conceptGenerationError}
                      </div>
                    )}

                    {/* 概念分解图生成进度 */}
                    {isGeneratingConcept && (
                      <div className="text-xs text-purple-400 animate-pulse flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        正在生成概念分解图，请稍候...
                      </div>
                    )}

                    {formData.concept_image_url ? (
                      <div className="relative group rounded-lg overflow-hidden border border-slate-700/50">
                        <img 
                          src={formData.concept_image_url} 
                          alt="角色深度概念分解图" 
                          className="w-full aspect-video object-cover bg-slate-800/60"
                          onError={() => setFormData({ ...formData, concept_image_url: '' })}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 text-white"
                            startContent={<Download className="w-3 h-3" />}
                            onPress={() => downloadCharacterView(formData.concept_image_url, `${formData.name || '角色'}_概念分解图.png`)}
                          >
                            下载
                          </Button>
                          <Button
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white"
                            onPress={() => setFormData({ ...formData, concept_image_url: '' })}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full aspect-video bg-slate-800/60 rounded-lg border-2 border-dashed border-slate-600/50 flex flex-col items-center justify-center text-slate-500 gap-3">
                        <Layers className="w-10 h-10" />
                        <div className="text-center">
                          <p className="text-sm mb-1">暂无概念分解图</p>
                          <p className="text-xs text-slate-600">点击下方按钮生成</p>
                        </div>
                        {/* 生成按钮（无图时显示） */}
                        {editMode && formData.id && (
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                            startContent={<Layers className="w-3 h-3" />}
                            isLoading={isGeneratingConcept}
                            isDisabled={isGeneratingConcept || !localImageModel}
                            onPress={handleGenerateConcept}
                          >
                            {isGeneratingConcept ? '生成中...' : '生成概念分解图'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 三视图区域 */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4" />
                        角色三视图
                      </label>
                      <div className="flex gap-2">
                        {/* 重新生成按钮（已有视图时显示） */}
                        {editMode && formData.id && hasAnyView && (
                          <Button
                            size="sm"
                            variant="flat"
                            className="bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30"
                            startContent={<RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />}
                            onPress={handleGenerateViews}
                            isDisabled={isGenerating}
                          >
                            {isGenerating ? '重新生成中...' : '重新生成'}
                          </Button>
                        )}
                        {hasAnyView && (
                          <Button
                            size="sm"
                            variant="flat"
                            className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            startContent={<Download className="w-3 h-3" />}
                            onPress={handleDownloadAll}
                          >
                            下载全部
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 模型选择和生成按钮 */}
                    {editMode && formData.id && (
                      <div className="space-y-2">
                        <AIModelSelector
                          label="图片模型"
                          placeholder="选择图片模型"
                          models={aiModels}
                          selectedModel={localImageModel}
                          onModelChange={setLocalImageModel}
                          filterType="IMAGE"
                          size="sm"
                          isDisabled={isGenerating}
                        />
                        <Button
                          size="md"
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                          onPress={handleGenerateViews}
                          isLoading={isGenerating}
                          isDisabled={isGenerating || !localImageModel}
                          startContent={!isGenerating && <RefreshCw className="w-4 h-4" />}
                        >
                          {isGenerating
                            ? '生成中...'
                            : isComplementMode
                              ? '补全缺失视图'
                              : '一键生成三视图'}
                        </Button>
                      </div>
                    )}

                    {/* 错误提示 */}
                    {generationError && (
                      <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                        {generationError}
                      </div>
                    )}

                    {/* 生成进度提示 */}
                    {isGenerating && (
                      <div className="text-xs text-indigo-400 animate-pulse flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        正在生成三视图，请稍候...
                      </div>
                    )}

                    {/* 三视图卡片 */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* 正面视图 */}
                      <div className="relative group border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
                        <div className="text-center text-xs text-slate-400 py-1 bg-slate-800/80">正面</div>
                        {formData.front_view_url ? (
                          <>
                            <img 
                              src={formData.front_view_url} 
                              alt="正面视图" 
                              className="w-full aspect-square object-cover bg-slate-800/60"
                              onError={(e) => {
                                setFormData({ ...formData, front_view_url: '' });
                              }}
                            />
                            <div className="absolute inset-0 top-6 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              <button 
                                onClick={() => handleDownloadView('front')} 
                                className="p-1.5 bg-white/20 rounded hover:bg-white/30" 
                                title="下载"
                              >
                                <Download className="w-3 h-3 text-white" />
                              </button>
                              <button 
                                onClick={() => handleDeleteView('front')} 
                                className="p-1.5 bg-red-500/50 rounded hover:bg-red-500/70" 
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-slate-500 text-xs">
                            {isGenerating ? (
                              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                            ) : (
                              '暂无'
                            )}
                          </div>
                        )}
                      </div>

                      {/* 侧面视图 */}
                      <div className="relative group border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
                        <div className="text-center text-xs text-slate-400 py-1 bg-slate-800/80">侧面</div>
                        {formData.side_view_url ? (
                          <>
                            <img 
                              src={formData.side_view_url} 
                              alt="侧面视图" 
                              className="w-full aspect-square object-cover bg-slate-800/60"
                              onError={(e) => {
                                setFormData({ ...formData, side_view_url: '' });
                              }}
                            />
                            <div className="absolute inset-0 top-6 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              <button 
                                onClick={() => handleDownloadView('side')} 
                                className="p-1.5 bg-white/20 rounded hover:bg-white/30" 
                                title="下载"
                              >
                                <Download className="w-3 h-3 text-white" />
                              </button>
                              <button 
                                onClick={() => handleDeleteView('side')} 
                                className="p-1.5 bg-red-500/50 rounded hover:bg-red-500/70" 
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-slate-500 text-xs">
                            {isGenerating ? (
                              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                            ) : (
                              '暂无'
                            )}
                          </div>
                        )}
                      </div>

                      {/* 背面视图 */}
                      <div className="relative group border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
                        <div className="text-center text-xs text-slate-400 py-1 bg-slate-800/80">背面</div>
                        {formData.back_view_url ? (
                          <>
                            <img 
                              src={formData.back_view_url} 
                              alt="背面视图" 
                              className="w-full aspect-square object-cover bg-slate-800/60"
                              onError={(e) => {
                                setFormData({ ...formData, back_view_url: '' });
                              }}
                            />
                            <div className="absolute inset-0 top-6 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              <button 
                                onClick={() => handleDownloadView('back')} 
                                className="p-1.5 bg-white/20 rounded hover:bg-white/30" 
                                title="下载"
                              >
                                <Download className="w-3 h-3 text-white" />
                              </button>
                              <button 
                                onClick={() => handleDeleteView('back')} 
                                className="p-1.5 bg-red-500/50 rounded hover:bg-red-500/70" 
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-slate-500 text-xs">
                            {isGenerating ? (
                              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                            ) : (
                              '暂无'
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 编辑模式下的提示 */}
                    {!editMode && !hasAnyView && (
                      <p className="text-xs text-slate-500 text-center">
                        保存角色后可生成三视图
                      </p>
                    )}
                  </div>
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
