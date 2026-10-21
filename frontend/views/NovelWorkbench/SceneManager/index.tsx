/**
 * 场景管理组件
 * 场景列表、增删改查、按重要程度分组展示
 */

import React, { useState } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Tabs, Tab, Textarea } from '@heroui/react';
import { Plus, Trash2, Edit2, MapPin, Star, Circle, Minus } from 'lucide-react';
import { useNovelScenes, NovelScene } from '../hooks/useNovelScenes';
import { useToast } from '../../../contexts/ToastContext';

// ==================== 类型定义 ====================

interface SceneManagerProps {
  projectId: number;
}

const IMPORTANCE_CONFIG = {
  key: { label: '关键场景', color: 'warning', icon: Star },
  normal: { label: '普通场景', color: 'primary', icon: Circle },
  minor: { label: '次要场景', color: 'default', icon: Minus },
};

// ==================== 场景表单组件 ====================

interface SceneFormProps {
  scene?: NovelScene | null;
  onSave: (data: Partial<NovelScene>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const SceneForm: React.FC<SceneFormProps> = ({ scene, onSave, onCancel, isLoading }) => {
  const [formData, setFormData] = useState<Partial<NovelScene>>({
    name: scene?.name || '',
    location: scene?.location || '',
    space_description: scene?.space_description || '',
    close_up_details: scene?.close_up_details || [],
    history: scene?.history || '',
    status: scene?.status || '',
    importance: scene?.importance || 'normal',
  });
  const [newDetail, setNewDetail] = useState('');

  const handleSubmit = () => {
    if (!formData.name?.trim()) {
      return;
    }
    onSave(formData);
  };

  const addDetail = () => {
    if (newDetail.trim()) {
      setFormData({
        ...formData,
        close_up_details: [...(formData.close_up_details || []), newDetail.trim()]
      });
      setNewDetail('');
    }
  };

  const removeDetail = (index: number) => {
    setFormData({
      ...formData,
      close_up_details: formData.close_up_details?.filter((_, i) => i !== index) || []
    });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <Input
        label="场景名称 *"
        placeholder="输入场景名称"
        value={formData.name}
        onValueChange={(val) => setFormData({ ...formData, name: val })}
        isRequired
      />

      <Input
        label="地理位置"
        placeholder="场景所在的地理位置"
        value={formData.location}
        onValueChange={(val) => setFormData({ ...formData, location: val })}
      />

      <div>
        <label className="text-sm text-[var(--text-secondary)] mb-2 block">重要程度</label>
        <div className="flex gap-2">
          {Object.entries(IMPORTANCE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFormData({ ...formData, importance: type as any })}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                formData.importance === type
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
        label="空间描述"
        placeholder="描述场景的空间布局、环境特征..."
        value={formData.space_description}
        onValueChange={(val) => setFormData({ ...formData, space_description: val })}
        minRows={3}
      />

      {/* 局部特写 */}
      <div className="border border-[var(--border-color)] rounded-lg p-4">
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">局部特写描述</h4>
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="添加局部特写描述（如：壁炉上的相框、桌上的日记本）"
            value={newDetail}
            onValueChange={setNewDetail}
            onKeyDown={(e) => e.key === 'Enter' && addDetail()}
          />
          <Button size="sm" onPress={addDetail}>添加</Button>
        </div>
        <div className="space-y-2">
          {formData.close_up_details?.map((detail, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-[var(--bg-input)] rounded">
              <span className="text-sm text-[var(--text-primary)]">{detail}</span>
              <Button size="sm" isIconOnly variant="light" color="danger" onPress={() => removeDetail(index)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Input
        label="场景状态"
        placeholder="描述场景当前的状态（如：破败、繁华、神秘）"
        value={formData.status}
        onValueChange={(val) => setFormData({ ...formData, status: val })}
      />

      <Textarea
        label="场景历史"
        placeholder="描述场景的历史背景、发生过的重要事件..."
        value={formData.history}
        onValueChange={(val) => setFormData({ ...formData, history: val })}
        minRows={4}
      />

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="flat" onPress={onCancel}>取消</Button>
        <Button color="primary" isLoading={isLoading} onPress={handleSubmit}>
          {scene ? '保存修改' : '创建场景'}
        </Button>
      </div>
    </div>
  );
};

// ==================== 场景卡片组件 ====================

interface SceneCardProps {
  scene: NovelScene;
  onEdit: () => void;
  onDelete: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, onEdit, onDelete }) => {
  const importanceConfig = IMPORTANCE_CONFIG[scene.importance];
  const ImportanceIcon = importanceConfig.icon;

  return (
    <div className="group p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${importanceConfig.color}-500/20`}>
            <MapPin className={`w-5 h-5 text-${importanceConfig.color}-500`} />
          </div>
          <div>
            <h4 className="font-medium text-[var(--text-primary)]">{scene.name}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Chip size="sm" color={importanceConfig.color as any} variant="flat">
                {importanceConfig.label}
              </Chip>
              {scene.location && (
                <span className="text-xs text-[var(--text-muted)] truncate max-w-[150px]">
                  {scene.location}
                </span>
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

      {scene.space_description && (
        <p className="mt-3 text-sm text-[var(--text-secondary)] line-clamp-2">
          {scene.space_description}
        </p>
      )}

      {scene.status && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          状态：{scene.status}
        </p>
      )}

      {scene.close_up_details && scene.close_up_details.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {scene.close_up_details.slice(0, 3).map((detail, idx) => (
            <Chip key={idx} size="sm" variant="flat" className="text-xs">
              {detail.length > 15 ? detail.substring(0, 15) + '...' : detail}
            </Chip>
          ))}
          {scene.close_up_details.length > 3 && (
            <Chip size="sm" variant="flat" className="text-xs">
              +{scene.close_up_details.length - 3}
            </Chip>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================

const SceneManager: React.FC<SceneManagerProps> = ({ projectId }) => {
  const { showToast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingScene, setEditingScene] = useState<NovelScene | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    scenes,
    scenesByImportance,
    loading,
    createScene,
    updateScene,
    deleteScene,
  } = useNovelScenes(projectId);

  const handleOpenModal = (scene?: NovelScene) => {
    setEditingScene(scene || null);
    onOpen();
  };

  const handleSave = async (data: Partial<NovelScene>) => {
    setIsSubmitting(true);
    try {
      if (editingScene) {
        await updateScene(editingScene.id, data);
        showToast('场景已更新', 'success');
      } else {
        await createScene(data);
        showToast('场景已创建', 'success');
      }
      onClose();
    } catch (error: any) {
      showToast(error.message || '操作失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (scene: NovelScene) => {
    if (!confirm(`确定要删除场景"${scene.name}"吗？`)) return;
    
    try {
      await deleteScene(scene.id);
      showToast('场景已删除', 'success');
    } catch (error: any) {
      showToast(error.message || '删除失败', 'error');
    }
  };

  const filteredScenes = activeTab === 'all' 
    ? scenes 
    : scenesByImportance[activeTab as keyof typeof scenesByImportance] || [];

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
          <MapPin className="w-5 h-5 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">场景设定</span>
          <span className="text-sm text-[var(--text-muted)]">({scenes.length}个)</span>
        </div>
        <Button
          color="primary"
          startContent={<Plus className="w-4 h-4" />}
          onPress={() => handleOpenModal()}
        >
          添加场景
        </Button>
      </div>

      {/* 标签过滤 */}
      <div className="px-4 py-2 border-b border-[var(--border-color)]">
        <Tabs 
          selectedKey={activeTab} 
          onSelectionChange={(key) => setActiveTab(key as string)}
          size="sm"
        >
          <Tab key="all" title={`全部 (${scenes.length})`} />
          <Tab key="key" title={`关键 (${scenesByImportance.key.length})`} />
          <Tab key="normal" title={`普通 (${scenesByImportance.normal.length})`} />
          <Tab key="minor" title={`次要 (${scenesByImportance.minor.length})`} />
        </Tabs>
      </div>

      {/* 场景列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredScenes.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-muted)]">
              {activeTab === 'all' ? '暂无场景' : `暂无${IMPORTANCE_CONFIG[activeTab as keyof typeof IMPORTANCE_CONFIG]?.label || ''}`}
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-2">点击"添加场景"开始创建</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredScenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                onEdit={() => handleOpenModal(scene)}
                onDelete={() => handleDelete(scene)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent className="bg-[var(--bg-elevated)]">
          <ModalHeader className="text-[var(--text-primary)]">
            {editingScene ? '编辑场景' : '添加新场景'}
          </ModalHeader>
          <ModalBody>
            <SceneForm
              scene={editingScene}
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

export default SceneManager;
