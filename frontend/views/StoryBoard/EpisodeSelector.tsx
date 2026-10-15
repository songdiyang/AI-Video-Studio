import React, { useState, useRef, useEffect } from 'react';
import { Film, Plus, Pencil, Check, X, Settings2, ChevronDown } from 'lucide-react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  /** 当前选中的 scriptId */
  currentScriptId?: number | null;
  onSelect: (script: Script | null) => void;
  /**
   * 自由创作模式下的集数切换回调。
   * 统一存储层后，自由分镜也绑定隐式剧本，但前端仍保留此回调用于集数标签切换。
   */
  onStandaloneEpisodeChange?: (episode: number) => void;
  /**
   * 自由创作模式下已使用的最大集数标签。
   */
  standaloneMaxEpisode?: number;
  /**
   * 点击"+ 新建下一集"时回调。
   */
  onCreateNextEpisode?: () => void;
  /**
   * 更新集数标题回调
   */
  onUpdateEpisodeTitle?: (scriptId: number, title: string) => Promise<void>;
}

/** 下拉中的单个剧集选项 */
interface EpisodeOption {
  key: string;
  label: string;
  selected: boolean;
}

/**
 * 通用剧集下拉：
 *  - 触发器：Film 图标 + 当前集数 + chevron
 *  - 面板：已有剧集分组（左对齐、选中态为文字高亮 + 左侧短竖线，去掉粗蓝外框）
 *          + 分割线 + 「新建第 N 集」动作项（固定加号图标）
 *  - hover 背景反馈，点击外部 / Esc 关闭
 */
const EpisodeDropdown: React.FC<{
  options: EpisodeOption[];
  triggerLabel: string;
  createLabel: string | null;
  onSelect: (key: string) => void;
  onCreate: () => void;
}> = ({ options, triggerLabel, createLabel, onSelect, onCreate }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {/* 触发器 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
      >
        <Film className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span className="whitespace-nowrap">{triggerLabel}</span>
        <ChevronDown
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-[9rem] py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        >
          {/* 已有剧集分组 */}
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="option"
              aria-selected={opt.selected}
              onClick={() => {
                onSelect(opt.key);
                setOpen(false);
              }}
              className={`relative w-full pl-4 pr-3 py-1.5 text-left text-xs flex items-center transition-colors cursor-pointer ${
                opt.selected
                  ? 'text-[var(--accent)] font-medium bg-[var(--accent)]/[0.08]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {/* 选中态左侧短竖线标记（替代粗外框） */}
              {opt.selected && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 h-3.5 w-0.5 rounded-full bg-[var(--accent)]" />
              )}
              <span className="truncate">{opt.label}</span>
            </button>
          ))}

          {/* 新建动作：分组分隔 */}
          {createLabel && (
            <>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                type="button"
                onClick={() => {
                  onCreate();
                  setOpen(false);
                }}
                className="w-full pl-4 pr-3 py-1.5 text-left text-xs flex items-center gap-1.5 text-[var(--accent)] font-medium hover:bg-[var(--accent)]/10 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate whitespace-nowrap">{createLabel}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 集数选择器
 * 统一存储层后，所有分镜都绑定到剧本（包括隐式剧本）。
 * 此组件负责：
 *  - 集数切换（绑定剧本时显示剧本集数列表，自由创作时显示进度标签）
 *  - 新建下一集入口
 * 注：项目名不在此展示（顶部导航栏/侧栏标题已承担项目标识）。
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  currentScriptId,
  onSelect,
  onStandaloneEpisodeChange,
  standaloneMaxEpisode,
  onCreateNextEpisode,
  onUpdateEpisodeTitle,
}) => {
  // 弹窗管理状态
  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // 当前选中的剧本（按 scriptId 匹配）
  const currentScript = currentScriptId
    ? scripts.find((s) => s.id === currentScriptId)
    : null;

  // 是否有绑定剧本（非隐式剧本）
  const hasBoundScript = !!currentScript;

  // ---- 自由创作模式：集数作为「进度标签」 ----
  const renderStandalone = () => {
    if (hasBoundScript || !onStandaloneEpisodeChange) return null;
    const maxEp = Math.max(standaloneMaxEpisode || 0, currentEpisode || 1, 1);
    const options: EpisodeOption[] = Array.from({ length: maxEp }, (_, i) => ({
      key: String(i + 1),
      label: `第${i + 1}集`,
      selected: i + 1 === (currentEpisode || 1),
    }));
    return (
      <div className="flex items-center gap-1">
        <div className="w-px h-5 bg-[var(--border-color)]" />
        <EpisodeDropdown
          options={options}
          triggerLabel={`第${currentEpisode || 1}集`}
          createLabel={`新建第${maxEp + 1}集`}
          onSelect={(key) => {
            const v = parseInt(key, 10);
            if (!isNaN(v) && v >= 1) onStandaloneEpisodeChange(v);
          }}
          onCreate={() => onStandaloneEpisodeChange(maxEp + 1)}
        />
      </div>
    );
  };

  // ---- 绑定剧本模式：显示剧本集数列表 ----
  const renderBound = () => {
    if (!hasBoundScript) return null;
    const options: EpisodeOption[] = scripts.map((s) => ({
      key: String(s.id),
      label: `第${s.episode_number}集`,
      selected: s.id === currentScript?.id,
    }));
    return (
      <div className="flex items-center gap-1">
        <div className="w-px h-5 bg-[var(--border-color)]" />
        <EpisodeDropdown
          options={options}
          triggerLabel={`第${currentScript?.episode_number ?? currentEpisode}集`}
          createLabel={onCreateNextEpisode ? '新建下一集' : null}
          onSelect={(key) => {
            const script = scripts.find((s) => s.id === parseInt(key, 10));
            if (script) onSelect(script);
          }}
          onCreate={() => onCreateNextEpisode?.()}
        />
        {/* 集数管理按钮（带 ref 用于定位） */}
        <button
          type="button"
          ref={(el) => {
            if (el && manageOpen) {
              const rect = el.getBoundingClientRect();
              document.documentElement.style.setProperty('--episode-manage-top', `${rect.bottom + 4}px`);
              document.documentElement.style.setProperty('--episode-manage-left', `${rect.right - 256}px`);
            }
          }}
          onClick={() => setManageOpen(true)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          title="管理集数"
          aria-label="管理集数"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {renderStandalone()}
      {renderBound()}

      {/* 集数管理下拉弹窗 */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManageOpen(false);
          }}
        >
          {/* 弹窗内容：定位到按钮下方 */}
          <div
            className="absolute z-50 w-64 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl overflow-hidden"
            style={{
              top: 'var(--episode-manage-top, 48px)',
              left: 'var(--episode-manage-left, 320px)',
            }}
          >
            {/* 弹窗头部 */}
            <div className="shrink-0 px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">管理集数</h3>
              <button
                onClick={() => setManageOpen(false)}
                className="p-0.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* 弹窗内容：集数列表 */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {scripts.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--bg-app)]/50 border border-[var(--border-color)]/30 hover:border-[var(--accent)]/30 transition-colors"
                >
                  <span className="shrink-0 text-xs font-medium text-[var(--accent)] w-10">
                    第{s.episode_number}集
                  </span>
                  {editingId === s.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        ref={editInputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateEpisodeTitle?.(s.id, editingTitle).then(() => setEditingId(null));
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        className="flex-1 min-w-0 text-xs bg-transparent border border-[var(--accent)]/40 rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)]"
                        maxLength={30}
                        placeholder="输入标题"
                      />
                      <button
                        onClick={() => onUpdateEpisodeTitle?.(s.id, editingTitle).then(() => setEditingId(null))}
                        className="p-0.5 rounded hover:bg-[var(--accent)]/20 text-[var(--accent)]"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span
                        className="flex-1 min-w-0 text-xs text-[var(--text-primary)] truncate cursor-pointer hover:text-[var(--accent)]"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingTitle(s.title || '');
                        }}
                        title={s.title || '点击编辑标题'}
                      >
                        {s.title || (
                          <span className="text-[var(--text-muted)]/50 italic">未命名</span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setEditingId(s.id);
                          setEditingTitle(s.title || '');
                        }}
                        className="p-0.5 rounded hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)]"
                        title="编辑标题"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* 弹窗底部 */}
            <div className="shrink-0 px-3 py-2 border-t border-[var(--border-color)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)]">
                共 {scripts.length} 集
              </span>
              {onCreateNextEpisode && (
                <button
                  onClick={() => {
                    setManageOpen(false);
                    onCreateNextEpisode();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent)]/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  新建
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpisodeSelector;
