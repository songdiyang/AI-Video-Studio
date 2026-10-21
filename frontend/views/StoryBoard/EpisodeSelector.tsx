import React, { useState, useRef, useEffect } from 'react';
import { Film, Plus, Pencil, Check, X, ChevronDown } from 'lucide-react';

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
  /** 集数标题（管理模式下行内重命名时展示） */
  title?: string;
}

/**
 * 通用剧集下拉：
 *  - 触发器：Film 图标 + 当前集数 + chevron
 *  - 面板：已有剧集分组（左对齐、选中态为文字高亮 + 左侧短竖线）
 *          + 分割线 + 「新建下一集」动作项（固定加号图标）
 *  - 管理模式（传入 onRename 时）：每行追加铅笔按钮，可行内重命名标题，
 *    将「集数切换 / 管理集数 / 新建下一集」整合到同一个下拉中。
 *  - hover 背景反馈，点击外部 / Esc 关闭
 */
const EpisodeDropdown: React.FC<{
  options: EpisodeOption[];
  triggerLabel: string;
  createLabel: string | null;
  onSelect: (key: string) => void;
  onCreate: () => void;
  /** 行内重命名回调；存在时启用管理模式（显示标题 + 铅笔 + 编辑框） */
  onRename?: (key: string, title: string) => Promise<void> | void;
}> = ({ options, triggerLabel, createLabel, onSelect, onCreate, onRename }) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (opt: EpisodeOption) => {
    setEditingId(opt.key);
    setEditingTitle(opt.title || '');
  };
  const commitEdit = (key: string) => {
    Promise.resolve(onRename?.(key, editingTitle)).then(() => setEditingId(null));
  };

  // 面板宽度：管理模式需容纳标题与重命名输入框，普通模式保持紧凑。
  const panelWidth = onRename ? 'w-64' : 'min-w-[9rem]';

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
          className={`absolute left-0 top-full mt-1 z-50 ${panelWidth} py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl`}
        >
          {/* 已有剧集分组 */}
          {options.map((opt) => {
            const editing = onRename && editingId === opt.key;
            if (editing) {
              return (
                <div key={opt.key} className="flex items-center gap-1 px-2 py-1">
                  <span className="shrink-0 text-xs font-medium text-[var(--accent)] w-10">{opt.label}</span>
                  <input
                    ref={inputRef}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(opt.key);
                      else if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1 min-w-0 text-xs bg-transparent border border-[var(--accent)]/40 rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)]"
                    maxLength={30}
                    placeholder="输入标题"
                  />
                  <button
                    type="button"
                    onClick={() => commitEdit(opt.key)}
                    className="p-0.5 rounded hover:bg-[var(--accent)]/20 text-[var(--accent)] cursor-pointer"
                    title="保存标题"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="p-0.5 rounded hover:bg-red-500/20 text-red-400 cursor-pointer"
                    title="取消"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            }
            return (
              <div
                key={opt.key}
                className={`group flex items-center ${
                  opt.selected ? 'bg-[var(--accent)]/[0.08]' : 'hover:bg-[var(--bg-card-hover)]'
                } transition-colors`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.selected}
                  onClick={() => {
                    onSelect(opt.key);
                    setOpen(false);
                  }}
                  className={`relative flex-1 min-w-0 pl-4 pr-2 py-1.5 text-left text-xs flex items-center gap-1.5 cursor-pointer ${
                    opt.selected
                      ? 'text-[var(--accent)] font-medium'
                      : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                  }`}
                >
                  {/* 选中态左侧短竖线标记（替代粗外框） */}
                  {opt.selected && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 h-3.5 w-0.5 rounded-full bg-(--accent)" />
                  )}
                  <span className="shrink-0">{opt.label}</span>
                  {onRename && (
                    <span
                      className="truncate text-[var(--text-muted)]"
                      title={opt.title || '未命名'}
                    >
                      {opt.title || <span className="italic opacity-60">未命名</span>}
                    </span>
                  )}
                </button>
                {onRename && (
                  <button
                    type="button"
                    onClick={() => startEdit(opt)}
                    className="shrink-0 mr-1 p-1 rounded hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                    title="编辑标题"
                    aria-label={`编辑${opt.label}标题`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* 新建动作：分组分隔 */}
          {createLabel && (
            <>
              <div className="my-1 border-t border-(--border-color)" />
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
 *  - 集数管理（行内重命名标题）与新建下一集：均整合进同一个剧集下拉，不再单列齿轮入口
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

  // ---- 绑定剧本模式：显示剧本集数列表（整合管理 + 新建） ----
  const renderBound = () => {
    if (!hasBoundScript) return null;
    const options: EpisodeOption[] = scripts.map((s) => ({
      key: String(s.id),
      label: `第${s.episode_number}集`,
      selected: s.id === currentScript?.id,
      title: s.title,
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
          onRename={
            onUpdateEpisodeTitle
              ? (key, title) => onUpdateEpisodeTitle(Number(key), title)
              : undefined
          }
        />
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {renderStandalone()}
      {renderBound()}
    </div>
  );
};

export default EpisodeSelector;
