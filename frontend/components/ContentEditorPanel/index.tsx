import React, { useId } from 'react';
import { Check, Circle, Loader2, Save, AlertCircle } from 'lucide-react';
import './styles.css';

export type EditorSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** 编辑器负责保存草稿，宿主只在离开目标前等待保存结果。 */
export interface EditorSessionHandle {
  flush: () => Promise<boolean>;
}

export interface EmbeddedEditorProps {
  /** undefined 保持独立布局；null 表示嵌入宿主尚未就绪。 */
  editorPortalTarget?: HTMLElement | null;
  onRegisterEditor?: (handle: EditorSessionHandle | null) => void;
}

export interface ContentEditorTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ContentEditorPanelProps {
  title: string;
  kind: string;
  tabs: ContentEditorTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  status?: EditorSaveStatus;
  onSave?: () => void | Promise<unknown>;
  actions?: React.ReactNode;
  /** 标题行内联的分镜元数据（角色/道具/影棚/时长等） */
  meta?: React.ReactNode;
  /** 标题行右侧的附加操作（如分镜锁定） */
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const STATUS_LABELS: Record<EditorSaveStatus, string> = {
  idle: '就绪', dirty: '未保存', saving: '保存中', saved: '已保存', error: '保存失败',
};

// 状态控件降权：悬停时用 tooltip 解释含义，避免干扰主视线
const STATUS_HINTS: Record<EditorSaveStatus, string> = {
  idle: '分镜内容已就绪；停止输入后会自动保存',
  dirty: '有未保存的修改，停止输入后会自动保存',
  saving: '正在保存当前分镜内容…',
  saved: '分镜内容已保存',
  error: '保存失败，请点击保存重试',
};

/** 统一展示外壳；领域字段、校验、保存与生成均由各编辑器提供。 */
const ContentEditorPanel: React.FC<ContentEditorPanelProps> = ({
  title, kind, tabs, activeTab, onTabChange, status = 'idle', onSave,
  actions, meta, extra, children, className = '',
}) => {
  const id = useId();
  const StatusIcon = status === 'saving' ? Loader2 : status === 'error' ? AlertCircle : status === 'saved' ? Check : Circle;
  return (
    <section className={`content-editor-panel ${className}`} aria-label={`${kind}编辑面板`}>
      <div className="content-editor-heading">
        <h2 className="content-editor-identity" title={`${kind} · ${title || '未命名'}`}>
          <span className="content-editor-kind">{kind}</span>
          <span className="content-editor-title-sep" aria-hidden="true">·</span>
          <span className="content-editor-title">{title || '未命名'}</span>
        </h2>
        <div className="content-editor-heading-side">
          {extra}
          <span
            className={`content-editor-status is-${status}`}
            role="status"
            aria-live="polite"
            title={STATUS_HINTS[status]}
          >
            <StatusIcon size={12} className={status === 'saving' ? 'animate-spin' : ''} />
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>
      {meta && <div className="content-editor-properties">{meta}</div>}
      <div className="content-editor-tabs" role="tablist" aria-label="编辑内容">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            id={`${id}-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${id}-content`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`content-editor-tab ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              onTabChange(tabs[next].id);
              document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
            }}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>
      <div id={`${id}-content`} className="content-editor-body" role="tabpanel" aria-labelledby={`${id}-tab-${activeTab}`}>
        {children}
      </div>
      {(onSave || actions) && (
        <div className="content-editor-actions">
          <div className="content-editor-domain-actions">{actions}</div>
          {onSave && (
            <button type="button" className="content-editor-save" disabled={status === 'saving'} onClick={() => { void onSave(); }}>
              {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {status === 'error' ? '重试保存' : '保存'}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default ContentEditorPanel;
