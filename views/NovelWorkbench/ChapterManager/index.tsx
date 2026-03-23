/**
 * 章节管理组件
 * 章节列表、章节元数据编辑、字数统计
 */

import React, { useState, useCallback } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip } from '@heroui/react';
import { Plus, Trash2, Edit2, GripVertical, FileText, BookOpen, Eye, MoreVertical, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { NovelChapter } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';

// ==================== 类型定义 ====================

interface ChapterManagerProps {
  projectId: number;
  chapters: NovelChapter[];
  currentChapterId: number | null;
  onChaptersChange: (chapters: NovelChapter[]) => void;
  onSelectChapter: (chapterId: number) => void;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' }> = {
  draft: { label: '草稿', color: 'default' },
  completed: { label: '已完成', color: 'success' },
  published: { label: '已发布', color: 'primary' },
};

// ==================== 章节项组件 ====================

interface ChapterItemProps {
  chapter: NovelChapter;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const ChapterItem: React.FC<ChapterItemProps> = ({
  chapter,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  isFirst,
  isLast,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const statusConfig = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.draft;

  return (
    <div
      className={`group relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isActive
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-[var(--border-color)] hover:border-[var(--accent)]/50 bg-[var(--bg-card)]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* 拖拽手柄 */}
        <div className="pt-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-[var(--text-muted)]" />
        </div>

        {/* 章节信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-[var(--accent)] font-medium">
              第 {chapter.chapter_number} 章
            </span>
            <Chip size="sm" color={statusConfig.color} variant="flat">
              {statusConfig.label}
            </Chip>
          </div>
          <h4 className="font-medium text-[var(--text-primary)] truncate mb-1">
            {chapter.title || '无标题'}
          </h4>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span>{chapter.word_count.toLocaleString()} 字</span>
            <span>更新于 {new Date(chapter.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* 操作菜单 */}
        <div className="relative">
          <button
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-input)]"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreVertical className="w-4 h-4 text-[var(--text-muted)]" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-36 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] shadow-lg">
                <button
                  className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-input)] flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onEdit(); setShowMenu(false); }}
                >
                  <Edit2 className="w-4 h-4" /> 编辑
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-input)] flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); setShowMenu(false); }}
                >
                  <Copy className="w-4 h-4" /> 复制
                </button>
                {!isFirst && (
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-input)] flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(); setShowMenu(false); }}
                  >
                    <ArrowUp className="w-4 h-4" /> 上移
                  </button>
                )}
                {!isLast && (
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-input)] flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(); setShowMenu(false); }}
                  >
                    <ArrowDown className="w-4 h-4" /> 下移
                  </button>
                )}
                <div className="my-1 border-t border-[var(--border-color)]" />
                <button
                  className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                >
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const ChapterManager: React.FC<ChapterManagerProps> = ({
  projectId,
  chapters,
  currentChapterId,
  onChaptersChange,
  onSelectChapter,
  onRefresh,
}) => {
  const { showToast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [editingChapter, setEditingChapter] = useState<NovelChapter | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // 排序后的章节
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);

  // 统计信息
  const totalWords = chapters.reduce((sum, c) => sum + c.word_count, 0);
  const completedCount = chapters.filter(c => c.status === 'completed').length;

  // 打开添加/编辑弹窗
  const openModal = (chapter?: NovelChapter) => {
    if (chapter) {
      setEditingChapter(chapter);
      setFormData({
        title: chapter.title,
        notes: chapter.notes || '',
      });
    } else {
      setEditingChapter(null);
      setFormData({ title: '', notes: '' });
    }
    onOpen();
  };

  // 保存章节
  const handleSave = async () => {
    if (!formData.title.trim()) {
      showToast('请输入章节标题', 'warning');
      return;
    }

    setSaving(true);
    try {
      const token = getAuthToken();
      
      if (editingChapter) {
        // 更新章节
        const updatedChapter = {
          ...editingChapter,
          title: formData.title,
          notes: formData.notes,
          updated_at: new Date().toISOString(),
        };
        onChaptersChange(chapters.map(c => c.id === editingChapter.id ? updatedChapter : c));
      } else {
        // 添加新章节
        const newChapter: NovelChapter = {
          id: Date.now(),
          project_id: projectId,
          user_id: 0,
          chapter_number: chapters.length + 1,
          title: formData.title,
          content: '',
          word_count: 0,
          status: 'draft',
          notes: formData.notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        onChaptersChange([...chapters, newChapter]);
        onSelectChapter(newChapter.id);
      }
      
      showToast(editingChapter ? '已更新' : '已添加', 'success');
      onClose();
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 删除章节
  const handleDelete = (chapterId: number) => {
    onChaptersChange(chapters.filter(c => c.id !== chapterId));
    if (currentChapterId === chapterId && chapters.length > 1) {
      const remainingChapters = chapters.filter(c => c.id !== chapterId);
      if (remainingChapters.length > 0) {
        onSelectChapter(remainingChapters[0].id);
      }
    }
    showToast('已删除', 'success');
  };

  // 复制章节
  const handleDuplicate = (chapter: NovelChapter) => {
    const newChapter: NovelChapter = {
      ...chapter,
      id: Date.now(),
      chapter_number: chapters.length + 1,
      title: `${chapter.title} (副本)`,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onChaptersChange([...chapters, newChapter]);
    showToast('已复制', 'success');
  };

  // 移动章节
  const handleMove = (chapterId: number, direction: 'up' | 'down') => {
    const index = sortedChapters.findIndex(c => c.id === chapterId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sortedChapters.length) return;

    const newChapters = [...sortedChapters];
    [newChapters[index], newChapters[newIndex]] = [newChapters[newIndex], newChapters[index]];
    
    // 更新章节序号
    const updated = newChapters.map((c, i) => ({
      ...c,
      chapter_number: i + 1,
    }));
    
    onChaptersChange(updated);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" />
            <span className="font-medium text-[var(--text-primary)]">章节管理</span>
          </div>
          <Button
            color="primary"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => openModal()}
          >
            添加章节
          </Button>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">总章节: </span>
            <span className="text-[var(--text-primary)] font-medium">{chapters.length}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">总字数: </span>
            <span className="text-[var(--text-primary)] font-medium">{totalWords.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">已完成: </span>
            <span className="text-green-500 font-medium">{completedCount}/{chapters.length}</span>
          </div>
        </div>
      </div>

      {/* 章节列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {sortedChapters.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-muted)]">暂无章节</p>
            <p className="text-sm text-[var(--text-muted)] mt-2">点击"添加章节"开始创作</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedChapters.map((chapter, index) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                isActive={chapter.id === currentChapterId}
                onSelect={() => onSelectChapter(chapter.id)}
                onEdit={() => openModal(chapter)}
                onDelete={() => handleDelete(chapter.id)}
                onMoveUp={() => handleMove(chapter.id, 'up')}
                onMoveDown={() => handleMove(chapter.id, 'down')}
                onDuplicate={() => handleDuplicate(chapter)}
                isFirst={index === 0}
                isLast={index === sortedChapters.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent className="bg-[var(--bg-elevated)]">
          <ModalHeader className="text-[var(--text-primary)]">
            {editingChapter ? '编辑章节' : '添加新章节'}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="章节标题"
                placeholder="输入章节标题"
                value={formData.title}
                onValueChange={(val) => setFormData({ ...formData, title: val })}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
                }}
              />
              <Input
                label="备注（可选）"
                placeholder="章节备注或提醒"
                value={formData.notes}
                onValueChange={(val) => setFormData({ ...formData, notes: val })}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>取消</Button>
            <Button color="primary" isLoading={saving} onPress={handleSave}>
              {editingChapter ? '保存修改' : '创建章节'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ChapterManager;
