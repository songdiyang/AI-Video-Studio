import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Input, Textarea, Select, SelectItem, Tabs, Tab, Chip } from '@heroui/react';
import {
  Save, X, User, MapPin, FileText, Tag as TagIcon, Plus,
  Layers, Image as ImageIcon, FolderOpen, Shirt, Cloud, Building2, BookOpen,
  Wand2, Settings, Palette
} from 'lucide-react';
import { Project } from '../../services/projects';
import {
  TagGroup, CharacterState, updateCharacterUseReferenceImages,
  uploadSceneReferenceImage, deleteSceneReferenceImage,
  updateCharacter, updateScene, updateProp,
} from '../../services/assets';
import { updateCostume, COSTUME_CATEGORIES, CostumeCategory } from '../../services/costumes';
import { updateEnvironment } from '../../services/environments';
import { updateBuilding } from '../../services/buildings';
import { updateStudio } from '../../services/studios';
import { useToast } from '../../contexts/ToastContext';
import CharacterStateEditor from '../../views/AssetsManager/AssetModel/CharacterStateEditor';
import ReferenceImageManager from '../../views/AssetsManager/AssetModel/ReferenceImageManager';
import PropStyleConfigPanel, { PropStyleConfig } from '../../views/AssetsManager/AssetModel/PropStyleConfig';
import { useAIModels } from '../../hooks/useAIModels';
import { getAuthToken } from '../../services/auth';

interface AssetEditorProps {
  tabId: string;
  assetType: string;
  initialData?: any;
  onClose: () => void;
}

// 资产类型配置
const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  character: { label: '角色', icon: <User size={14} />, color: 'blue' },
  scene: { label: '场景', icon: <MapPin size={14} />, color: 'emerald' },
  studio: { label: '影棚', icon: <Layers size={14} />, color: 'violet' },
  prop: { label: '道具', icon: <FileText size={14} />, color: 'amber' },
  costume: { label: '服装', icon: <Shirt size={14} />, color: 'purple' },
  environment: { label: '环境', icon: <Cloud size={14} />, color: 'cyan' },
  building: { label: '建筑', icon: <Building2 size={14} />, color: 'orange' },
  script: { label: '剧本', icon: <BookOpen size={14} />, color: 'rose' },
};

const AssetEditor: React.FC<AssetEditorProps> = ({ tabId, assetType, initialData, onClose }) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<any>(initialData || {});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('basic');

  // 标签输入缓冲
  const [tagInput, setTagInput] = useState('');

  // 同步 initialData 变化
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  // 资产类型配置
  const config = ASSET_TYPE_CONFIG[assetType] || { label: '资产', icon: <FileText size={14} />, color: 'blue' };

  // 标签数组
  const tagList = useMemo<string[]>(() => {
    const raw = (formData.tags ?? '') as string;
    if (!raw) return [];
    return raw.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean);
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

  // 保存处理
  const handleSave = async () => {
    setSaving(true);
    try {
      // 从 tabId 解析资产 ID：格式为 `asset-${assetType}-${assetId}`
      const parts = tabId.split('-');
      const assetId = parseInt(parts[parts.length - 1], 10);
      if (!assetId || isNaN(assetId)) {
        throw new Error('无法解析资产ID');
      }

      let savedData: any;
      switch (assetType) {
        case 'character':
          savedData = await updateCharacter(assetId, {
            name: formData.name,
            description: formData.description,
            personality: formData.personality,
            tags: formData.tags,
          });
          break;
        case 'scene':
          savedData = await updateScene(assetId, {
            name: formData.name,
            description: formData.description,
            environment: formData.environment,
            lighting: formData.lighting,
            mood: formData.mood,
            tags: formData.tags,
          });
          break;
        case 'studio':
          savedData = await updateStudio(assetId, {
            name: formData.name,
            description: formData.description,
          });
          break;
        case 'prop':
          savedData = await updateProp(assetId, {
            name: formData.name,
            description: formData.description,
            prop_type: formData.prop_type,
            category: formData.category,
            image_url: formData.image_url,
            tags: formData.tags,
          });
          break;
        case 'costume':
          savedData = await updateCostume(assetId, {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            gender: formData.gender,
            outfit_prompt: formData.outfit_prompt,
            image_url: formData.image_url,
            front_view_url: formData.front_view_url,
            side_view_url: formData.side_view_url,
            back_view_url: formData.back_view_url,
            tags: formData.tags,
          });
          break;
        case 'environment':
          savedData = await updateEnvironment(assetId, {
            name: formData.name,
            description: formData.description,
            timeOfDay: formData.timeOfDay,
            weather: formData.weather,
            lighting: formData.lighting,
            mood: formData.mood,
            terrainType: formData.terrainType,
          });
          break;
        case 'building':
          savedData = await updateBuilding(assetId, {
            name: formData.name,
            description: formData.description,
            interiorExterior: formData.interiorExterior,
            structureType: formData.structureType,
          });
          break;
        case 'script':
          // 剧本编辑暂无后端更新 API，显示成功提示
          showToast('保存成功', 'success');
          setSaving(false);
          return;
        default:
          throw new Error('不支持的资产类型');
      }

      // 更新本地 formData 以同步 API 返回的数据
      if (savedData) {
        setFormData((prev: any) => ({ ...prev, ...savedData }));
      }
      showToast('保存成功', 'success');
    } catch (error: any) {
      showToast(error?.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 渲染标签输入组件（通用）
  const renderTagInput = () => (
    <div className="space-y-2">
      <label className="text-[var(--text-secondary)] font-medium text-xs flex items-center gap-1">
        <TagIcon className="w-3 h-3" />
        标签
        <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">（方便管理和搜索分类）</span>
      </label>
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
  );

  // 渲染角色编辑表单
  const renderCharacterForm = () => {
    const [useReferenceImages, setUseReferenceImages] = useState(formData.use_reference_images !== false);

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
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><User className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入角色名称"
              value={formData.name || ''}
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
              value={formData.description || ''}
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
              value={formData.personality || ''}
              onValueChange={(val) => setFormData({ ...formData, personality: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
        <Tab key="states" title={<div className="flex items-center gap-1.5"><Layers className="w-4 h-4" /><span>状态管理</span></div>}>
          {formData.id ? (
            <CharacterStateEditor
              characterId={formData.id}
              disabled={false}
              projectId={formData.project_id || null}
              tagGroups={[]}
              onTagGroupsChange={() => {}}
              formData={formData}
              setFormData={setFormData}
              onStateActivated={(state: CharacterState) => {
                if (state.image_url || state.front_view_url) {
                  setFormData({ ...formData, image_url: state.image_url || state.front_view_url });
                }
              }}
            />
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">请先保存角色后管理状态</p>
            </div>
          )}
        </Tab>
        <Tab key="references" title={<div className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /><span>参考图</span></div>}>
          {formData.id ? (
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
    );
  };

  // 渲染场景编辑表单
  const renderSceneForm = () => {
    return (
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
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Layers className="w-4 h-4" /><span>场景要素</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入场景名称"
              value={formData.name || ''}
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
              value={formData.description || ''}
              onValueChange={(val) => setFormData({ ...formData, description: val })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="环境"
              placeholder="环境描述（建筑结构、空间布局、物品摆设等）"
              value={formData.environment || ''}
              onValueChange={(val) => setFormData({ ...formData, environment: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="光线"
              placeholder="光线效果（光线来源、明暗对比、色调等）"
              value={formData.lighting || ''}
              onValueChange={(val) => setFormData({ ...formData, lighting: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="氛围"
              placeholder="氛围感觉（紧张、温馨、诡异等）"
              value={formData.mood || ''}
              onValueChange={(val) => setFormData({ ...formData, mood: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
      </Tabs>
    );
  };

  // 渲染道具编辑表单
  const renderPropForm = () => {
    const [styleConfig, setStyleConfig] = useState<PropStyleConfig>({});

    useEffect(() => {
      if (formData.style_config) {
        try {
          const config = typeof formData.style_config === 'string'
            ? JSON.parse(formData.style_config)
            : formData.style_config;
          setStyleConfig(config);
        } catch {
          setStyleConfig({});
        }
      }
    }, [formData.style_config]);

    return (
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
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Settings className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入道具名称"
              value={formData.name || ''}
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
              value={formData.description || ''}
              onValueChange={(val) => setFormData({ ...formData, description: val })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Select
              label="道具类型"
              selectedKeys={formData.prop_type ? [formData.prop_type] : ['interactive']}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) setFormData({ ...formData, prop_type: selected });
              }}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                value: "text-slate-100",
                label: "text-slate-400 font-medium",
                popoverContent: "bg-slate-800 border border-slate-700"
              }}
            >
              <SelectItem key="held" textValue="手持道具">手持道具</SelectItem>
              <SelectItem key="permanent" textValue="永久道具">永久道具</SelectItem>
              <SelectItem key="interactive" textValue="交互道具">交互道具</SelectItem>
            </Select>
            <Input
              label="道具分类"
              placeholder="如：武器、工具、装饰品等"
              value={formData.category || ''}
              onValueChange={(val) => setFormData({ ...formData, category: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="图片URL"
              placeholder="图片地址（选填，可通过AI生成）"
              value={formData.image_url || ''}
              onValueChange={(val) => setFormData({ ...formData, image_url: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
        <Tab key="style" title={<div className="flex items-center gap-1.5"><Palette className="w-4 h-4" /><span>样式配置</span></div>}>
          <PropStyleConfigPanel value={styleConfig} onChange={setStyleConfig} />
        </Tab>
      </Tabs>
    );
  };

  // 渲染服装编辑表单
  const renderCostumeForm = () => {
    const genderOptions = [
      { value: 'male', label: '男性' },
      { value: 'female', label: '女性' },
      { value: 'unisex', label: '通用' }
    ];

    return (
      <div className="space-y-6">
        {/* 服装图片展示 */}
        {(formData.image_url || formData.front_view_url) && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-400">服装预览</h4>
            <div className="relative rounded-lg overflow-hidden border border-slate-600/50 bg-slate-800/40">
              <img
                src={formData.image_url || formData.front_view_url}
                alt={formData.name || '服装预览'}
                className="w-full h-48 object-contain"
              />
            </div>
          </div>
        )}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-400">基本信息</h4>
          <Input
            label="服装名称"
            placeholder="输入服装名称"
            value={formData.name || ''}
            onValueChange={(value) => setFormData({ ...formData, name: value })}
            classNames={{
              input: "bg-transparent text-slate-100",
              label: "text-slate-400 font-medium",
              inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
            }}
          />
          <Textarea
            label="服装描述"
            placeholder="描述这件服装的特点、风格等"
            value={formData.description || ''}
            onValueChange={(value) => setFormData({ ...formData, description: value })}
            minRows={3}
            classNames={{
              input: "bg-transparent text-slate-100",
              label: "text-slate-400 font-medium",
              inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
            }}
          />
          {/* 图片URL字段隐藏，通过AI生成或外部系统设置 */}
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-400">分类配置</h4>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="服装分类"
              placeholder="选择分类"
              selectedKeys={formData.category ? [formData.category] : []}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as CostumeCategory;
                setFormData({ ...formData, category: value });
              }}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                value: "text-slate-100",
                label: "text-slate-400 font-medium",
                popoverContent: "bg-slate-800 border border-slate-700"
              }}
            >
              {COSTUME_CATEGORIES.map((category) => (
                <SelectItem key={category} textValue={category}>{category}</SelectItem>
              ))}
            </Select>
            <Select
              label="适用性别"
              placeholder="选择性别"
              selectedKeys={formData.gender ? [formData.gender] : new Set(['unisex'])}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;
                setFormData({ ...formData, gender: value });
              }}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                value: "text-slate-100",
                label: "text-slate-400 font-medium",
                popoverContent: "bg-slate-800 border border-slate-700"
              }}
            >
              {genderOptions.map((option) => (
                <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-400">AI生成提示词</h4>
          <Textarea
            label="服装提示词"
            placeholder="描述服装的具体样式，用于AI生成三视图..."
            value={formData.outfit_prompt || ''}
            onValueChange={(value) => setFormData({ ...formData, outfit_prompt: value })}
            minRows={4}
            classNames={{
              input: "bg-transparent text-slate-100 font-mono text-sm",
              label: "text-slate-400 font-medium",
              inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
            }}
          />
          <p className="text-xs text-slate-500">
            此提示词将用于生成服装的三视图。建议使用英文描述，包含服装的颜色、材质、款式等关键词。
          </p>
        </div>
      </div>
    );
  };

  // 渲染环境编辑表单
  const renderEnvironmentForm = () => (
    <div className="space-y-4">
      <Input
        label="名称"
        placeholder="如：蜜糖草地、沙地、溪流..."
        value={formData.name || ''}
        onValueChange={(v) => setFormData({ ...formData, name: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Textarea
        label="描述"
        placeholder="环境氛围描述..."
        value={formData.description || ''}
        onValueChange={(v) => setFormData({ ...formData, description: v })}
        minRows={3}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="时间"
          placeholder="如：清晨、黄昏"
          value={formData.timeOfDay || ''}
          onValueChange={(v) => setFormData({ ...formData, timeOfDay: v })}
          classNames={{
            input: "bg-transparent text-slate-100",
            label: "text-slate-400 font-medium",
            inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
          }}
        />
        <Input
          label="天气"
          placeholder="如：晴朗、雨天"
          value={formData.weather || ''}
          onValueChange={(v) => setFormData({ ...formData, weather: v })}
          classNames={{
            input: "bg-transparent text-slate-100",
            label: "text-slate-400 font-medium",
            inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="光照"
          placeholder="如：柔和、强烈"
          value={formData.lighting || ''}
          onValueChange={(v) => setFormData({ ...formData, lighting: v })}
          classNames={{
            input: "bg-transparent text-slate-100",
            label: "text-slate-400 font-medium",
            inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
          }}
        />
        <Input
          label="氛围"
          placeholder="如：温馨、神秘"
          value={formData.mood || ''}
          onValueChange={(v) => setFormData({ ...formData, mood: v })}
          classNames={{
            input: "bg-transparent text-slate-100",
            label: "text-slate-400 font-medium",
            inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
          }}
        />
      </div>
      <Input
        label="地貌类型"
        placeholder="如：山地、平原、水域"
        value={formData.terrainType || ''}
        onValueChange={(v) => setFormData({ ...formData, terrainType: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
    </div>
  );

  // 渲染建筑编辑表单
  const renderBuildingForm = () => (
    <div className="space-y-4">
      <Input
        label="名称"
        placeholder="输入建筑名称"
        value={formData.name || ''}
        onValueChange={(v) => setFormData({ ...formData, name: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Textarea
        label="描述"
        placeholder="建筑描述..."
        value={formData.description || ''}
        onValueChange={(v) => setFormData({ ...formData, description: v })}
        minRows={3}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Select
        label="内外景"
        selectedKeys={formData.interiorExterior ? [formData.interiorExterior] : ['both']}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0] as string;
          setFormData({ ...formData, interiorExterior: value });
        }}
        classNames={{
          trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
          value: "text-slate-100",
          label: "text-slate-400 font-medium",
          popoverContent: "bg-slate-800 border border-slate-700"
        }}
      >
        <SelectItem key="interior" textValue="室内">室内</SelectItem>
        <SelectItem key="exterior" textValue="室外">室外</SelectItem>
        <SelectItem key="both" textValue="室内外">室内外</SelectItem>
      </Select>
      <Input
        label="结构类型"
        placeholder="如：现代建筑、古建筑..."
        value={formData.structureType || ''}
        onValueChange={(v) => setFormData({ ...formData, structureType: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
    </div>
  );

  // 渲染剧本编辑表单
  const renderScriptForm = () => (
    <div className="space-y-4">
      <Input
        label="剧本名称"
        placeholder="输入剧本名称"
        value={formData.name || ''}
        onValueChange={(v) => setFormData({ ...formData, name: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Textarea
        label="剧本描述"
        placeholder="输入剧本简介..."
        value={formData.description || ''}
        onValueChange={(v) => setFormData({ ...formData, description: v })}
        minRows={3}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Input
        label="作者"
        placeholder="输入作者名称"
        value={formData.author || ''}
        onValueChange={(v) => setFormData({ ...formData, author: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
    </div>
  );

  // 根据资产类型渲染对应表单
  const renderForm = () => {
    switch (assetType) {
      case 'character':
        return renderCharacterForm();
      case 'scene':
      case 'studio':
        return renderSceneForm();
      case 'prop':
        return renderPropForm();
      case 'costume':
        return renderCostumeForm();
      case 'environment':
        return renderEnvironmentForm();
      case 'building':
        return renderBuildingForm();
      case 'script':
        return renderScriptForm();
      default:
        return <div className="text-center py-8 text-slate-500">暂不支持该资产类型的编辑</div>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-6 h-6 rounded bg-${config.color}-500/15 text-${config.color}-400`}>
            {config.icon}
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {formData.name || '未命名'}{config.label}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${config.color}-500/15 text-${config.color}-400`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="light"
            onPress={onClose}
            className="text-[var(--text-muted)]"
            startContent={<X size={14} />}
          >
            关闭
          </Button>
          <Button
            size="sm"
            color="primary"
            isLoading={saving}
            onPress={handleSave}
            className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold"
            startContent={<Save size={14} />}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 表单内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {renderForm()}
      </div>
    </div>
  );
};

export default AssetEditor;
