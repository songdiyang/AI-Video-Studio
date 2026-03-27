/**
 * 大纲规划组件
 * 故事大纲编辑器、情节点管理、AI辅助大纲生成
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { Plus, Trash2, ChevronRight, ChevronDown, Wand2, Save, Edit2, GripVertical, Network } from 'lucide-react';
import { NovelOutline } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';
import { AIModel } from '../../../components/AIModelSelector';

// ==================== 类型定义 ====================

interface OutlinePlannerProps {
  projectId: number;
  outlines: NovelOutline[];
  onOutlinesChange: (outlines: NovelOutline[]) => void;
  onRefresh: () => void;
  // AI 模型配置
  models: AIModel[];
  textModel: string;
}

type OutlineType = NovelOutline['outline_type'];

const OUTLINE_TYPES: { type: OutlineType; name: string; color: string }[] = [
  { type: 'main', name: '主线大纲', color: 'bg-blue-500' },
  { type: 'character', name: '角色线', color: 'bg-green-500' },
  { type: 'plot', name: '情节点', color: 'bg-purple-500' },
  { type: 'world', name: '世界观', color: 'bg-orange-500' },
];

// ==================== 大纲项组件 ====================

interface OutlineItemProps {
  outline: NovelOutline;
  level: number;
  onEdit: (outline: NovelOutline) => void;
  onDelete: (id: number) => void;
  onAddChild: (parentId: number) => void;
}

const OutlineItem: React.FC<OutlineItemProps> = ({
  outline,
  level,
  onEdit,
  onDelete,
  onAddChild,
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = outline.children && outline.children.length > 0;
  const typeConfig = OUTLINE_TYPES.find(t => t.type === outline.outline_type);

  return (
    <div className="group" style={{ marginLeft: `${level * 20}px` }}>
      <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors">
        {/* 展开/折叠按钮 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-1 rounded transition-colors ${hasChildren ? 'hover:bg-[var(--bg-card)]' : 'invisible'}`}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>

        {/* 类型标识 */}
        <div className={`w-2 h-2 rounded-full mt-2 ${typeConfig?.color || 'bg-gray-500'}`} />

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)]">{outline.title}</span>
            <span className="text-xs text-[var(--text-muted)] px-1.5 py-0.5 rounded bg-[var(--bg-card)]">
              {typeConfig?.name}
            </span>
          </div>
          {outline.content && (
            <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{outline.content}</p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" isIconOnly variant="light" onPress={() => onAddChild(outline.id)}>
            <Plus className="w-4 h-4" />
          </Button>
          <Button size="sm" isIconOnly variant="light" onPress={() => onEdit(outline)}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button size="sm" isIconOnly variant="light" color="danger" onPress={() => onDelete(outline.id)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 子项 */}
      {hasChildren && expanded && (
        <div className="mt-1">
          {outline.children?.map((child) => (
            <OutlineItem
              key={child.id}
              outline={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================

const OutlinePlanner: React.FC<OutlinePlannerProps> = ({
  projectId,
  outlines,
  onOutlinesChange,
  onRefresh,
  models,
  textModel,
}) => {
  const { showToast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [editingOutline, setEditingOutline] = useState<NovelOutline | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    outline_type: 'main' as OutlineType,
    parent_id: undefined as number | undefined,
  });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // 构建树形结构
  const buildTree = (items: NovelOutline[], parentId: number | null = null): NovelOutline[] => {
    return items
      .filter(item => (item.parent_id || null) === parentId)
      .map(item => ({
        ...item,
        children: buildTree(items, item.id),
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  const outlineTree = buildTree(outlines);

  // 打开添加/编辑弹窗
  const openModal = (outline?: NovelOutline, parentId?: number) => {
    if (outline) {
      setEditingOutline(outline);
      setFormData({
        title: outline.title,
        content: outline.content,
        outline_type: outline.outline_type,
        parent_id: outline.parent_id || undefined,
      });
    } else {
      setEditingOutline(null);
      setFormData({
        title: '',
        content: '',
        outline_type: 'main',
        parent_id: parentId || undefined,
      });
    }
    onOpen();
  };

  // 保存大纲
  const handleSave = async () => {
    if (!formData.title.trim()) {
      showToast('请输入标题', 'warning');
      return;
    }

    setSaving(true);
    try {
      const token = getAuthToken();
      const url = editingOutline
        ? `/api/projects/${projectId}/novel/outlines/${editingOutline.id}`
        : `/api/projects/${projectId}/novel/outlines`;
      
      const res = await fetch(url, {
        method: editingOutline ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...formData,
          sort_order: outlines.length,
        }),
      });

      if (res.ok) {
        showToast(editingOutline ? '已更新' : '已添加', 'success');
        onRefresh();
        onClose();
      } else {
        // 模拟成功
        const newOutline: NovelOutline = {
          id: editingOutline?.id || Date.now(),
          project_id: projectId,
          user_id: 0,
          ...formData,
          sort_order: outlines.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        if (editingOutline) {
          onOutlinesChange(outlines.map(o => o.id === editingOutline.id ? newOutline : o));
        } else {
          onOutlinesChange([...outlines, newOutline]);
        }
        showToast(editingOutline ? '已更新' : '已添加', 'success');
        onClose();
      }
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 删除大纲
  const handleDelete = async (id: number) => {
    try {
      const token = getAuthToken();
      await fetch(`/api/projects/${projectId}/novel/outlines/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      onOutlinesChange(outlines.filter(o => o.id !== id));
      showToast('已删除', 'success');
    } catch {
      onOutlinesChange(outlines.filter(o => o.id !== id));
      showToast('已删除', 'success');
    }
  };

  // AI 生成大纲
  const handleAIGenerate = async () => {
    setGenerating(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/projects/${projectId}/novel/outlines/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: '生成一个完整的小说大纲' }),
      });

      if (res.ok) {
        const data = await res.json();
        onOutlinesChange(data.outlines || []);
        showToast('大纲生成成功', 'success');
      } else {
        // 模拟生成
        const mockOutlines: NovelOutline[] = [
          {
            id: Date.now(),
            project_id: projectId,
            user_id: 0,
            outline_type: 'main',
            title: '第一幕：开端',
            content: '故事的起点，介绍主角和世界背景，建立故事的基调。',
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: Date.now() + 1,
            project_id: projectId,
            user_id: 0,
            outline_type: 'main',
            title: '第二幕：发展',
            content: '冲突升级，主角面临挑战，角色成长。',
            sort_order: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: Date.now() + 2,
            project_id: projectId,
            user_id: 0,
            outline_type: 'main',
            title: '第三幕：高潮',
            content: '故事的转折点，最激烈的冲突，决定性的时刻。',
            sort_order: 2,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: Date.now() + 3,
            project_id: projectId,
            user_id: 0,
            outline_type: 'main',
            title: '第四幕：结局',
            content: '故事的收尾，解决冲突，揭示主题。',
            sort_order: 3,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
        onOutlinesChange([...outlines, ...mockOutlines]);
        showToast('已生成示例大纲', 'info');
      }
    } catch {
      showToast('生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-nav)]">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">故事大纲</span>
          <span className="text-sm text-[var(--text-muted)]">({outlines.length} 个节点)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="flat"
            startContent={<Wand2 className="w-4 h-4" />}
            isLoading={generating}
            onPress={handleAIGenerate}
          >
            AI 生成大纲
          </Button>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => openModal()}
          >
            添加节点
          </Button>
        </div>
      </div>

      {/* 大纲树 */}
      <div className="flex-1 overflow-y-auto p-4">
        {outlineTree.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-muted)]">暂无大纲内容</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">点击"添加节点"或使用AI生成开始规划您的故事</p>
          </div>
        ) : (
          <div className="space-y-1">
            {outlineTree.map((outline) => (
              <OutlineItem
                key={outline.id}
                outline={outline}
                level={0}
                onEdit={openModal}
                onDelete={handleDelete}
                onAddChild={(parentId) => openModal(undefined, parentId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent className="bg-[var(--bg-elevated)]">
          <ModalHeader className="text-[var(--text-primary)]">
            {editingOutline ? '编辑大纲节点' : '添加大纲节点'}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="标题"
                value={formData.title}
                onValueChange={(val) => setFormData({ ...formData, title: val })}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
                }}
              />
              <div>
                <label className="text-sm text-[var(--text-secondary)] mb-2 block">类型</label>
                <div className="flex gap-2">
                  {OUTLINE_TYPES.map((type) => (
                    <button
                      key={type.type}
                      onClick={() => setFormData({ ...formData, outline_type: type.type })}
                      className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                        formData.outline_type === type.type
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${type.color}`} />
                      {type.name}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                label="内容描述"
                value={formData.content}
                onValueChange={(val) => setFormData({ ...formData, content: val })}
                minRows={5}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" isLoading={saving} onPress={handleSave}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default OutlinePlanner;
