/**
 * 章节管理组件
 * 章节列表、章节元数据编辑、字数统计、AI 章节续写
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Progress } from '@heroui/react';
import { Plus, Trash2, Edit2, GripVertical, FileText, BookOpen, Eye, MoreVertical, Copy, ArrowUp, ArrowDown, Wand2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { NovelChapter } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';
import { useTaskRunner, TaskState } from '../../../hooks/useTaskRunner';
import { AIModel } from '../../../components/AIModelSelector';

// ==================== 类型定义 ====================

interface ChapterManagerProps {
  projectId: number;
  chapters: NovelChapter[];
  currentChapterId: number | null;
  onChaptersChange: (chapters: NovelChapter[]) => void;
  onSelectChapter: (chapterId: number) => void;
  onRefresh: () => void;
  // AI 模型配置
  models: AIModel[];
  textModel: string;
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
  onAIContinue: () => void;
  taskState: TaskState | null;
  onClearTask: () => void;
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
  onAIContinue,
  taskState,
  onClearTask,
  isFirst,
  isLast,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const statusConfig = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.draft;
  
  // 任务状态标识
  const renderTaskStatus = () => {
    if (!taskState) return null;
    
    switch (taskState.status) {
      case 'pending':
      case 'running':
        return (
          <div className="mt-2 flex items-center gap-2">
            <Progress
              size="sm"
              value={taskState.progress}
              color="primary"
              className="flex-1"
            />
            <span className="text-xs text-[var(--text-muted)]">
              {taskState.progress}%
            </span>
          </div>
        );
      case 'completed':
        return (
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-green-500">生成完成</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClearTask(); }}
              className="text-xs text-[var(--accent)] hover:underline ml-auto"
            >
              刷新查看
            </button>
          </div>
        );
      case 'failed':
        return (
          <div className="mt-2 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-red-500 truncate flex-1">
              {taskState.error || '生成失败'}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onClearTask(); }}
              className="text-xs text-[var(--text-muted)] hover:underline"
            >
              关闭
            </button>
          </div>
        );
      default:
        return null;
    }
  };

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
            {taskState && (taskState.status === 'pending' || taskState.status === 'running') && (
              <Chip size="sm" color="warning" variant="flat" startContent={<Loader2 className="w-3 h-3 animate-spin" />}>
                生成中
              </Chip>
            )}
          </div>
          <h4 className="font-medium text-[var(--text-primary)] truncate mb-1">
            {chapter.title || '无标题'}
          </h4>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span>{chapter.word_count.toLocaleString()} 字</span>
            <span>更新于 {new Date(chapter.updated_at).toLocaleDateString()}</span>
          </div>
          {/* 任务状态显示 */}
          {renderTaskStatus()}
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
                  className="w-full px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--accent)]/10 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onAIContinue(); setShowMenu(false); }}
                >
                  <Wand2 className="w-4 h-4" /> AI 续写
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
  models,
  textModel,
}) => {
  const { showToast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  // 集成 useTaskRunner 用于 AI 章节续写
  const { tasks, runTask, recoverTasks, clearTask, isRunning } = useTaskRunner({
    projectId,
    maxRetries: 1,
  });
  
  const [editingChapter, setEditingChapter] = useState<NovelChapter | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  
  // 页面加载时恢复未完成的任务
  useEffect(() => {
    recoverTasks(
      ['novel_chapter_generation'],
      (job) => {
        // 从 job.params 中提取 chapterId 作为 key
        const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
        const chapterId = params?.chapterId;
        return chapterId ? `chapter_${chapterId}` : null;
      }
    );
  }, [recoverTasks]);

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

  // AI 章节续写
  const handleAIContinue = async (chapter: NovelChapter) => {
    const taskKey = `chapter_${chapter.id}`;
    
    // 检查是否已有任务在运行
    if (tasks[taskKey] && (tasks[taskKey].status === 'pending' || tasks[taskKey].status === 'running')) {
      showToast('该章节正在生成中，请稍候', 'warning');
      return;
    }
    
    try {
      await runTask(taskKey, 'novel_chapter_generation', {
        chapterId: chapter.id,
        projectId,
        chapterNumber: chapter.chapter_number,
        title: chapter.title,
        existingContent: chapter.content || '',
        modelName: textModel,
      });
      showToast('AI 续写任务已启动', 'success');
    } catch (error: any) {
      showToast(error.message || 'AI 续写启动失败', 'error');
    }
  };

  // 获取章节的任务状态
  const getChapterTaskState = (chapterId: number): TaskState | null => {
    return tasks[`chapter_${chapterId}`] || null;
  };

  // 清除章节任务状态
  const handleClearTask = (chapterId: number) => {
    clearTask(`chapter_${chapterId}`);
    onRefresh(); // 刷新章节列表以获取最新内容
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent)]" />
            <span className="font-medium text-[var(--text-primary)]">章节管理</span>
            {isRunning && (
              <Chip size="sm" color="warning" variant="flat" startContent={<Loader2 className="w-3 h-3 animate-spin" />}>
                AI 生成中
              </Chip>
            )}
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
                onAIContinue={() => handleAIContinue(chapter)}
                taskState={getChapterTaskState(chapter.id)}
                onClearTask={() => handleClearTask(chapter.id)}
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
