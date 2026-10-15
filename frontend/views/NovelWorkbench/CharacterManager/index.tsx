/**
 * 人物管理组件
 * 人物列表、增删改查、按角色类型分组展示
 */

import React, { useState } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Tabs, Tab, Textarea } from '@heroui/react';
import { Plus, Trash2, Edit2, User, Users, Skull, UserCircle } from 'lucide-react';
import { useNovelCharacters, NovelCharacter } from '../hooks/useNovelCharacters';
import { useToast } from '../../../contexts/ToastContext';

// ==================== 类型定义 ====================

interface CharacterManagerProps {
  projectId: number;
}

const ROLE_TYPE_CONFIG = {
  protagonist: { label: '主角', color: 'primary', icon: UserCircle },
  supporting: { label: '配角', color: 'success', icon: Users },
  antagonist: { label: '反派', color: 'danger', icon: Skull },
  minor: { label: '龙套', color: 'default', icon: User },
};

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他' },
  { value: 'unknown', label: '未知' },
];

// ==================== 人物表单组件 ====================

interface CharacterFormProps {
  character?: NovelCharacter | null;
  onSave: (data: Partial<NovelCharacter>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const CharacterForm: React.FC<CharacterFormProps> = ({ character, onSave, onCancel, isLoading }) => {
  const [formData, setFormData] = useState<Partial<NovelCharacter>>({
    name: character?.name || '',
    gender: character?.gender || 'unknown',
    age: character?.age,
    personality: character?.personality || '',
    weight: character?.weight,
    appearance_face: character?.appearance_face || '',
    height: character?.height,
    background_story: character?.background_story || '',
    role_type: character?.role_type || 'supporting',
    outfit: character?.outfit || {},
    accessories: character?.accessories || {},
  });

  const handleSubmit = () => {
    if (!formData.name?.trim()) {
      return;
    }
    onSave(formData);
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {/* 基本信息 */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="姓名 *"
          placeholder="输入人物姓名"
          value={formData.name}
          onValueChange={(val) => setFormData({ ...formData, name: val })}
          isRequired
        />
        <div>
          <label className="text-sm text-[var(--text-secondary)] mb-2 block">性别</label>
          <select
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
          >
            {GENDER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Input
          label="年龄"
          type="number"
          placeholder="岁"
          value={formData.age?.toString() || ''}
          onValueChange={(val) => setFormData({ ...formData, age: val ? parseInt(val) : undefined })}
        />
        <Input
          label="身高"
          type="number"
          placeholder="cm"
          value={formData.height?.toString() || ''}
          onValueChange={(val) => setFormData({ ...formData, height: val ? parseInt(val) : undefined })}
        />
        <Input
          label="体重"
          type="number"
          placeholder="kg"
          value={formData.weight?.toString() || ''}
          onValueChange={(val) => setFormData({ ...formData, weight: val ? parseFloat(val) : undefined })}
        />
      </div>

      <div>
        <label className="text-sm text-[var(--text-secondary)] mb-2 block">角色类型</label>
        <div className="flex gap-2">
          {Object.entries(ROLE_TYPE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFormData({ ...formData, role_type: type as any })}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                formData.role_type === type
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
              }`}
            >
              <config.icon className="w-4 h-4" />
              {config.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        label="性格特点"
        placeholder="描述人物的性格特征..."
        value={formData.personality}
        onValueChange={(val) => setFormData({ ...formData, personality: val })}
        minRows={2}
      />

      <Textarea
        label="外貌描述"
        placeholder="描述人物的长相、五官特征..."
        value={formData.appearance_face}
        onValueChange={(val) => setFormData({ ...formData, appearance_face: val })}
        minRows={2}
      />

      {/* 服饰配饰 */}
      <div className="border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">服饰配置</h4>
        <div className="grid grid-cols-2 gap-3">
          {['head', 'neck', 'upper_body', 'lower_body', 'feet'].map((part) => (
            <Input
              key={part}
              label={{
                head: '头部',
                neck: '颈部',
                upper_body: '上半身',
                lower_body: '下半身',
                feet: '脚部'
              }[part]}
              placeholder={`${part}服饰描述`}
              value={formData.outfit?.[part as keyof typeof formData.outfit] || ''}
              onValueChange={(val) => setFormData({
                ...formData,
                outfit: { ...formData.outfit, [part]: val }
              })}
              size="sm"
            />
          ))}
        </div>
      </div>

      {/* 配饰 */}
      <div className="border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">配饰配置</h4>
        <div className="grid grid-cols-2 gap-3">
          {['head', 'neck', 'upper_body', 'lower_body', 'feet'].map((part) => (
            <Input
              key={`acc-${part}`}
              label={{
                head: '头部配饰',
                neck: '颈部配饰',
                upper_body: '上身配饰',
                lower_body: '下身配饰',
                feet: '脚部配饰'
              }[part]}
              placeholder={`${part}配饰描述`}
              value={formData.accessories?.[part as keyof typeof formData.accessories] || ''}
              onValueChange={(val) => setFormData({
                ...formData,
                accessories: { ...formData.accessories, [part]: val }
              })}
              size="sm"
            />
          ))}
        </div>
      </div>

      <Textarea
        label="个人经历/背景故事"
        placeholder="描述人物的背景故事、成长经历..."
        value={formData.background_story}
        onValueChange={(val) => setFormData({ ...formData, background_story: val })}
        minRows={4}
      />

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="flat" onPress={onCancel}>取消</Button>
        <Button color="primary" isLoading={isLoading} onPress={handleSubmit}>
          {character ? '保存修改' : '创建人物'}
        </Button>
      </div>
    </div>
  );
};

// ==================== 人物卡片组件 ====================

interface CharacterCardProps {
  character: NovelCharacter;
  onEdit: () => void;
  onDelete: () => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onEdit, onDelete }) => {
  const roleConfig = ROLE_TYPE_CONFIG[character.role_type];
  const RoleIcon = roleConfig.icon;

  return (
    <div className="group p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-${roleConfig.color}-500/20`}>
            <RoleIcon className={`w-5 h-5 text-${roleConfig.color}-500`} />
          </div>
          <div>
            <h4 className="font-medium text-[var(--text-primary)]">{character.name}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Chip size="sm" color={roleConfig.color as any} variant="flat">
                {roleConfig.label}
              </Chip>
              {character.gender !== 'unknown' && (
                <span className="text-xs text-[var(--text-muted)]">
                  {GENDER_OPTIONS.find(g => g.value === character.gender)?.label}
                </span>
              )}
              {character.age && (
                <span className="text-xs text-[var(--text-muted)]">{character.age}岁</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" isIconOnly variant="light" onPress={onEdit}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button size="sm" isIconOnly variant="light" color="danger" onPress={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {character.personality && (
        <p className="mt-3 text-sm text-[var(--text-secondary)] line-clamp-2">
          <span className="text-[var(--text-muted)]">性格：</span>{character.personality}
        </p>
      )}

      {character.appearance_face && (
        <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2">
          <span className="text-[var(--text-muted)]">外貌：</span>{character.appearance_face}
        </p>
      )}

      {(character.height || character.weight) && (
        <div className="mt-2 flex gap-3 text-xs text-[var(--text-muted)]">
          {character.height && <span>身高: {character.height}cm</span>}
          {character.weight && <span>体重: {character.weight}kg</span>}
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================

const CharacterManager: React.FC<CharacterManagerProps> = ({ projectId }) => {
  const { showToast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingCharacter, setEditingCharacter] = useState<NovelCharacter | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    characters,
    charactersByRole,
    loading,
    createCharacter,
    updateCharacter,
    deleteCharacter,
  } = useNovelCharacters(projectId);

  const handleOpenModal = (character?: NovelCharacter) => {
    setEditingCharacter(character || null);
    onOpen();
  };

  const handleSave = async (data: Partial<NovelCharacter>) => {
    setIsSubmitting(true);
    try {
      if (editingCharacter) {
        await updateCharacter(editingCharacter.id, data);
        showToast('人物已更新', 'success');
      } else {
        await createCharacter(data);
        showToast('人物已创建', 'success');
      }
      onClose();
    } catch (error: any) {
      showToast(error.message || '操作失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (character: NovelCharacter) => {
    if (!confirm(`确定要删除人物"${character.name}"吗？`)) return;
    
    try {
      await deleteCharacter(character.id);
      showToast('人物已删除', 'success');
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
    }
  };

  const filteredCharacters = activeTab === 'all' 
    ? characters 
    : charactersByRole[activeTab as keyof typeof charactersByRole] || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-nav)]">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">人物设定</span>
          <span className="text-sm text-[var(--text-muted)]">({characters.length}人)</span>
        </div>
        <Button
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={() => handleOpenModal()}
        >
          添加人物
        </Button>
      </div>

      {/* 标签过滤 */}
      <div className="px-4 py-2 border-b border-[var(--border-color)]">
        <Tabs 
          selectedKey={activeTab} 
          onSelectionChange={(key) => setActiveTab(key as string)}
          size="sm"
        >
          <Tab key="all" title={`全部 (${characters.length})`} />
          <Tab key="protagonist" title={`主角 (${charactersByRole.protagonist.length})`} />
          <Tab key="supporting" title={`配角 (${charactersByRole.supporting.length})`} />
          <Tab key="antagonist" title={`反派 (${charactersByRole.antagonist.length})`} />
          <Tab key="minor" title={`龙套 (${charactersByRole.minor.length})`} />
        </Tabs>
      </div>

      {/* 人物列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredCharacters.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-muted)]">
              {activeTab === 'all' ? '暂无人物' : `暂无${ROLE_TYPE_CONFIG[activeTab as keyof typeof ROLE_TYPE_CONFIG]?.label || ''}`}
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-2">点击"添加人物"开始创建</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onEdit={() => handleOpenModal(character)}
                onDelete={() => handleDelete(character)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="3xl">
        <ModalContent className="bg-[var(--bg-elevated)]">
          <ModalHeader className="text-[var(--text-primary)]">
            {editingCharacter ? '编辑人物' : '添加新人物'}
          </ModalHeader>
          <ModalBody>
            <CharacterForm
              character={editingCharacter}
              onSave={handleSave}
              onCancel={onClose}
              isLoading={isSubmitting}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default CharacterManager;
