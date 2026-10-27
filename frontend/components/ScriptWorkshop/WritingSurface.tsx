/**
 * WritingSurface - 番茄小说式沉浸式写作面
 * 纯展示 + DOM 级交互（标题内联、正文自动增高、字数统计、打字机/专注滚动、结构化预览切换）；
 * 草稿与保存由上层 WorkshopSession 负责，本组件只通过回调同步 value。
 */
import React, { useLayoutEffect, useRef } from 'react';
import { Eye, EyeOff, Focus, Check, Circle, Loader2, AlertCircle } from 'lucide-react';
import type { EditorSaveStatus } from '../ContentEditorPanel';

export interface WritingSurfaceProps {
  title: string;
  content: string;
  status: EditorSaveStatus;
  showPreview: boolean;
  focusMode: boolean;
  /** 结构化预览内容（showPreview 时替换正文渲染区）。 */
  preview: React.ReactNode;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onTogglePreview: () => void;
  onToggleFocus: () => void;
  onSave: () => void;
  /** 空正文时的写作引导占位符。 */
  placeholder?: string;
}

const STATUS_LABELS: Record<EditorSaveStatus, string> = {
  idle: '就绪', dirty: '未保存', saving: '保存中', saved: '已保存', error: '保存失败',
};

const STATUS_HINTS: Record<EditorSaveStatus, string> = {
  idle: '剧本已就绪；停止输入后会自动保存',
  dirty: '有未保存的修改，停止输入后会自动保存',
  saving: '正在保存剧本…',
  saved: '剧本已保存',
  error: '保存失败，点击可重试',
};

const STATUS_ICONS: Record<EditorSaveStatus, typeof Circle> = {
  idle: Circle, dirty: Circle, saving: Loader2, saved: Check, error: AlertCircle,
};

/** 以字数（不含空白）统计，贴近网文写作习惯。 */
const countWords = (value: string) => value.replace(/\s/g, '').length;

const WritingSurface: React.FC<WritingSurfaceProps> = ({
  title, content, status, showPreview, focusMode, preview,
  onTitleChange, onContentChange, onTogglePreview, onToggleFocus, onSave,
  placeholder = '在此开始你的创作…',
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLTextAreaElement | null>(null);

  // 正文自动增高：让文本铺满内容高度，滚动交给外层容器，配合打字机居中。
  useLayoutEffect(() => {
    const ta = canvasRef.current;
    if (!ta || showPreview) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [content, showPreview]);

  // 打字机模式：把光标所在行稳定停在视口上部约 40% 处，形成"向下书写"的沉浸手感。
  const scrollToCaret = React.useCallback(() => {
    if (!focusMode) return;
    const sc = scrollRef.current;
    const ta = canvasRef.current;
    if (!sc || !ta) return;
    const pos = ta.selectionStart ?? ta.value.length;
    const lineBefore = ta.value.slice(0, pos).split('\n').length - 1;
    const style = getComputedStyle(ta);
    const lineHeight = parseFloat(style.lineHeight) || 34;
    const padding = parseFloat(style.paddingTop) || 0;
    const caretTop = ta.offsetTop + padding + lineBefore * lineHeight;
    sc.scrollTo({ top: Math.max(0, caretTop - sc.clientHeight * 0.4), behavior: 'smooth' });
  }, [focusMode]);

  const handleCanvasInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(event.target.value);
    requestAnimationFrame(scrollToCaret);
  };

  const StatusIcon = STATUS_ICONS[status];
  const words = countWords(content);

  return (
    <div className={`sw-root${focusMode ? ' is-focus' : ''}`}>
      <div className="sw-toolbar">
        <span className="sw-toolbar-kind">剧本</span>
        <div className="sw-toolbar-actions">
          <button
            type="button"
            className={`sw-tool${focusMode ? ' is-active' : ''}`}
            aria-pressed={focusMode}
            title={focusMode ? '退出打字机模式' : '打字机模式：光标行自动居中'}
            onClick={onToggleFocus}
          >
            <Focus size={14} />专注
          </button>
          <button
            type="button"
            className={`sw-tool${showPreview ? ' is-active' : ''}`}
            aria-pressed={showPreview}
            title={showPreview ? '返回写作' : '查看结构化分镜预览'}
            onClick={onTogglePreview}
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}{showPreview ? '写作' : '预览'}
          </button>
        </div>
      </div>

      <div className="sw-scroll" ref={scrollRef}>
        <div className="sw-column">
          <input
            ref={titleRef}
            className="sw-title"
            aria-label="剧本名称"
            value={title}
            placeholder="标题"
            onChange={event => onTitleChange(event.target.value)}
          />
          {showPreview ? (
            <div className="sw-preview">{preview}</div>
          ) : (
            <textarea
              ref={canvasRef}
              className="sw-canvas"
              aria-label="剧本内容"
              value={content}
              placeholder={placeholder}
              spellCheck={false}
              wrap="soft"
              onChange={handleCanvasInput}
              onKeyUp={scrollToCaret}
              onClick={scrollToCaret}
            />
          )}
        </div>
      </div>

      <div className="sw-statusbar">
        <span className="sw-count" title="正文字数（不含空格）">{words} 字</span>
        <div className="sw-status-right">
          <span
            className={`sw-status is-${status}`}
            role="status"
            aria-live="polite"
            title={STATUS_HINTS[status]}
          >
            <StatusIcon size={12} className={status === 'saving' ? 'animate-spin' : ''} />
            {STATUS_LABELS[status]}
          </span>
          {(status === 'dirty' || status === 'error') && (
            <button type="button" className="sw-save" onClick={onSave}>
              {status === 'error' ? '重试保存' : '保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WritingSurface;
