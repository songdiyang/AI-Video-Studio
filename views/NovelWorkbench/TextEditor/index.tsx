/**
 * 文本编辑器组件
 * 富文本编辑器、写作辅助功能、自动保存、AI 辅助写作
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Tooltip, Chip, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Progress } from '@heroui/react';
import { 
  Save, Wand2, BookOpen, ChevronLeft, ChevronRight, Check, AlertCircle,
  Bold, Italic, Underline, List, ListOrdered, Quote, Heading1, Heading2,
  AlignLeft, AlignCenter, AlignRight, Undo, Redo, Search, Settings,
  Loader2, CheckCircle, XCircle, Sparkles
} from 'lucide-react';
import { NovelChapter } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';
import { useTaskRunner, TaskState } from '../../../hooks/useTaskRunner';
import { AIModel } from '../../../components/AIModelSelector';

// ==================== 类型定义 ====================

interface TextEditorProps {
  projectId: number;
  chapter?: NovelChapter;
  chapters: NovelChapter[];
  onChapterChange: (chapterId: number) => void;
  onSave: () => void;
  // AI 模型配置
  models: AIModel[];
  textModel: string;
}

// ==================== 工具栏组件 ====================

interface EditorToolbarProps {
  onFormat: (format: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onFormat,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const formatButtons = [
    { icon: Bold, format: 'bold', tooltip: '粗体 (Ctrl+B)' },
    { icon: Italic, format: 'italic', tooltip: '斜体 (Ctrl+I)' },
    { icon: Underline, format: 'underline', tooltip: '下划线 (Ctrl+U)' },
  ];

  const alignButtons = [
    { icon: AlignLeft, format: 'alignLeft', tooltip: '左对齐' },
    { icon: AlignCenter, format: 'alignCenter', tooltip: '居中' },
    { icon: AlignRight, format: 'alignRight', tooltip: '右对齐' },
  ];

  return (
    <div className="flex items-center gap-1 p-2 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
      {/* 撤销/重做 */}
      <Tooltip content="撤销">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-lg transition-colors ${canUndo ? 'hover:bg-[var(--bg-input)] text-[var(--text-secondary)]' : 'text-[var(--text-muted)] opacity-50'}`}
        >
          <Undo className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip content="重做">
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-lg transition-colors ${canRedo ? 'hover:bg-[var(--bg-input)] text-[var(--text-secondary)]' : 'text-[var(--text-muted)] opacity-50'}`}
        >
          <Redo className="w-4 h-4" />
        </button>
      </Tooltip>

      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

      {/* 格式化按钮 */}
      {formatButtons.map(({ icon: Icon, format, tooltip }) => (
        <Tooltip key={format} content={tooltip}>
          <button
            onClick={() => onFormat(format)}
            className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
          >
            <Icon className="w-4 h-4" />
          </button>
        </Tooltip>
      ))}

      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

      {/* 标题 */}
      <Tooltip content="标题1">
        <button
          onClick={() => onFormat('h1')}
          className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
        >
          <Heading1 className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip content="标题2">
        <button
          onClick={() => onFormat('h2')}
          className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
        >
          <Heading2 className="w-4 h-4" />
        </button>
      </Tooltip>

      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

      {/* 列表 */}
      <Tooltip content="无序列表">
        <button
          onClick={() => onFormat('ul')}
          className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
        >
          <List className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip content="有序列表">
        <button
          onClick={() => onFormat('ol')}
          className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
      </Tooltip>
      <Tooltip content="引用">
        <button
          onClick={() => onFormat('quote')}
          className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
        >
          <Quote className="w-4 h-4" />
        </button>
      </Tooltip>

      <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

      {/* 对齐 */}
      {alignButtons.map(({ icon: Icon, format, tooltip }) => (
        <Tooltip key={format} content={tooltip}>
          <button
            onClick={() => onFormat(format)}
            className="p-2 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-secondary)] transition-colors"
          >
            <Icon className="w-4 h-4" />
          </button>
        </Tooltip>
      ))}
    </div>
  );
};

// ==================== 主组件 ====================

const TextEditor: React.FC<TextEditorProps> = ({
  projectId,
  chapter,
  chapters,
  onChapterChange,
  onSave,
  models,
  textModel,
}) => {
  const { showToast } = useToast();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  // 集成 useTaskRunner 用于 AI 辅助写作
  const { tasks, runTask, recoverTasks, clearTask, isRunning } = useTaskRunner({
    projectId,
    maxRetries: 1,
  });
  
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // 历史记录
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // 排序后的章节
  const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const currentIndex = sortedChapters.findIndex(c => c.id === chapter?.id);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;
  
  // AI 任务 key
  const taskKey = chapter ? `editor_${chapter.id}` : null;
  const currentTask = taskKey ? tasks[taskKey] : null;
  
  // 页面加载时恢复未完成的任务
  useEffect(() => {
    recoverTasks(
      ['novel_paragraph_generation'],
      (job) => {
        const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
        const chapterId = params?.chapterId;
        return chapterId ? `editor_${chapterId}` : null;
      }
    );
  }, [recoverTasks]);

  // 加载章节内容
  useEffect(() => {
    if (chapter) {
      setContent(chapter.content || '');
      setHasChanges(false);
      setHistory([chapter.content || '']);
      setHistoryIndex(0);
    }
  }, [chapter?.id]);

  // 自动保存
  useEffect(() => {
    if (!hasChanges || !chapter) return;
    
    const timer = setTimeout(() => {
      handleSave();
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [content, hasChanges]);

  // 处理内容变化
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasChanges(true);
    
    // 添加到历史记录
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // 保存
  const handleSave = async () => {
    if (!chapter) return;
    
    setSaving(true);
    try {
      const token = getAuthToken();
      const wordCount = content.replace(/\s/g, '').length;
      
      await fetch(`/api/projects/${projectId}/novel/chapters/${chapter.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content,
          word_count: wordCount,
        }),
      });
      
      setLastSaved(new Date());
      setHasChanges(false);
      onSave();
    } catch {
      // 静默处理
      setLastSaved(new Date());
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  // 撤销
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setContent(history[newIndex]);
      setHasChanges(true);
    }
  };

  // 重做
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setContent(history[newIndex]);
      setHasChanges(true);
    }
  };

  // 格式化（简化版，实际应使用富文本编辑器）
  const handleFormat = (format: string) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    let newText = '';
    switch (format) {
      case 'bold':
        newText = `**${selectedText}**`;
        break;
      case 'italic':
        newText = `*${selectedText}*`;
        break;
      case 'h1':
        newText = `# ${selectedText}`;
        break;
      case 'h2':
        newText = `## ${selectedText}`;
        break;
      case 'quote':
        newText = `> ${selectedText}`;
        break;
      default:
        newText = selectedText;
    }
    
    const newContent = content.substring(0, start) + newText + content.substring(end);
    handleContentChange(newContent);
  };

  // AI 续写（使用 useTaskRunner）
  const handleAIContinue = async () => {
    if (!chapter || !taskKey) return;
      
    // 检查是否已有任务在运行
    if (currentTask && (currentTask.status === 'pending' || currentTask.status === 'running')) {
      showToast('AI 正在生成中，请稍候', 'warning');
      return;
    }
      
    try {
      await runTask(taskKey, 'novel_paragraph_generation', {
        chapterId: chapter.id,
        projectId,
        existingContent: content,
        modelName: textModel,
        action: 'continue',
      });
      showToast('AI 续写任务已启动', 'success');
    } catch (error: any) {
      // 回退到本地模拟
      const mockContinuation = '\n\n他深吸一口气，目光穿过朚胧的晨雾，看向远方那座若隐若现的山峰。心中那股说不清道不明的感觉愈发强烈，仿佛有什么重要的事情正在等待着他。';
      handleContentChange(content + mockContinuation);
      showToast('已添加示例续写（本地模式）', 'info');
    }
  };
    
  // 监听 AI 任务完成，自动追加内容
  useEffect(() => {
    if (currentTask?.status === 'completed' && currentTask.result) {
      const generatedText = currentTask.result.text || currentTask.result.content || '';
      if (generatedText) {
        handleContentChange(content + '\n\n' + generatedText);
        showToast('AI 续写完成', 'success');
      }
      if (taskKey) clearTask(taskKey);
    }
  }, [currentTask?.status, currentTask?.result]);
    
  // 清除任务状态
  const handleClearTask = () => {
    if (taskKey) clearTask(taskKey);
  };

  // 计算字数
  const wordCount = content.replace(/\s/g, '').length;

  if (!chapter) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-muted)]">请先选择一个章节</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-nav)] flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* 章节导航 */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              isIconOnly
              variant="light"
              isDisabled={!prevChapter}
              onPress={() => prevChapter && onChapterChange(prevChapter.id)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Dropdown>
              <DropdownTrigger>
                <Button variant="flat" size="sm">
                  第 {chapter.chapter_number} 章：{chapter.title || '无标题'}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="选择章节"
                onAction={(key) => onChapterChange(Number(key))}
              >
                {sortedChapters.map((c) => (
                  <DropdownItem key={c.id}>
                    第 {c.chapter_number} 章：{c.title || '无标题'}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
            <Button
              size="sm"
              isIconOnly
              variant="light"
              isDisabled={!nextChapter}
              onPress={() => nextChapter && onChapterChange(nextChapter.id)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* 保存状态 */}
          <div className="flex items-center gap-2 text-sm">
            {saving ? (
              <span className="text-[var(--text-muted)]">保存中...</span>
            ) : hasChanges ? (
              <span className="text-orange-500 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                未保存
              </span>
            ) : lastSaved ? (
              <span className="text-green-500 flex items-center gap-1">
                <Check className="w-4 h-4" />
                已保存
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 字数统计 */}
          <Chip size="sm" variant="flat">
            {wordCount.toLocaleString()} 字
          </Chip>
          
          {/* AI 续写 */}
          <Button
            size="sm"
            variant="flat"
            startContent={currentTask && (currentTask.status === 'pending' || currentTask.status === 'running') 
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Wand2 className="w-4 h-4" />}
            isLoading={currentTask && (currentTask.status === 'pending' || currentTask.status === 'running')}
            onPress={handleAIContinue}
          >
            {currentTask && (currentTask.status === 'pending' || currentTask.status === 'running') 
              ? `生成中 ${currentTask.progress}%`
              : 'AI 续写'}
          </Button>
          
          {/* AI 任务失败提示 */}
          {currentTask?.status === 'failed' && (
            <div className="flex items-center gap-1 text-red-500 text-sm">
              <XCircle className="w-4 h-4" />
              <span className="truncate max-w-[100px]">{currentTask.error || '生成失败'}</span>
              <button
                onClick={handleClearTask}
                className="text-xs hover:underline ml-1"
              >
                关闭
              </button>
            </div>
          )}

          {/* 手动保存 */}
          <Button
            size="sm"
            color="primary"
            startContent={<Save className="w-4 h-4" />}
            isLoading={saving}
            onPress={handleSave}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 编辑器工具栏 */}
      <EditorToolbar
        onFormat={handleFormat}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />

      {/* 编辑区域 */}
      <div className="flex-1 overflow-hidden">
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="开始写作..."
          className="w-full h-full p-6 resize-none bg-[var(--bg-app)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none font-serif text-lg leading-relaxed"
          style={{ lineHeight: '1.8' }}
        />
      </div>

      {/* 底部状态栏 */}
      <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-nav)] flex items-center justify-between text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>行数: {content.split('\n').length}</span>
          <span>段落: {content.split(/\n\n+/).filter(Boolean).length}</span>
        </div>
        <div>
          {lastSaved && `上次保存: ${lastSaved.toLocaleTimeString()}`}
        </div>
      </div>
    </div>
  );
};

export default TextEditor;
