import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Film, Plus, BookOpen, Pencil, Check, X, Settings2 } from 'lucide-react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

// 「+ 新建下一集」虚拟项 id（与真实 script id 不冲突）
export const CREATE_NEXT_EPISODE_ID = -1;

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  /** 当前选中的 scriptId */
  currentScriptId?: number | null;
  /** 当前项目名称 */
  projectName?: string;
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

/**
 * 集数选择器
 * 统一存储层后，所有分镜都绑定到剧本（包括隐式剧本）。
 * 此组件负责：
 *  - 显示项目名称
 *  - 集数切换（绑定剧本时显示剧本列表，自由创作时显示进度标签）
 *  - 新建下一集入口
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  currentScriptId,
  projectName,
  onSelect,
  onStandaloneEpisodeChange,
  standaloneMaxEpisode,
  onCreateNextEpisode,
  onUpdateEpisodeTitle
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
    ? scripts.find(s => s.id === currentScriptId)
    : null;

  // 是否有绑定剧本（非隐式剧本）
  const hasBoundScript = !!currentScript;

  // ---- 集数切换选择 ----
  const handleEpisodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value, 10);
    if (selectedId === CREATE_NEXT_EPISODE_ID) {
      onCreateNextEpisode?.();
      return;
    }
    const script = scripts.find(s => s.id === selectedId);
    if (script) {
      onSelect(script);
    }
  };

  // 按剧本标题分组（同一 title 的多集只显示一次 + 集数）
  const scriptGroups = React.useMemo(() => {
    const groupMap = new Map<string, Script[]>();
    for (const s of scripts) {
      const key = s.title || `剧本 #${s.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    }
    return groupMap;
  }, [scripts]);

  return (
    <div className="flex items-center gap-2">
      {/* 剧本绑定状态：只显示项目名，不再列出各集 */}
      <div className="flex items-center gap-2">
        <div
          className="h-8 min-h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)]/8 border border-[var(--accent)]/20 text-sm font-semibold text-[var(--accent)] truncate"
          title={projectName || '未命名项目'}
        >
          {hasBoundScript ? (
            <BookOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          ) : (
            <Pencil className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span className="truncate">{projectName || '未命名项目'}</span>
        </div>
      </div>

      {/* 自由创作模式：集数作为「进度标签」 */}
      {!hasBoundScript && onStandaloneEpisodeChange && (() => {
        // 读取父组件传入的最大集数，确保 Select 保留所有已到达的集数选项，用户可自由前后切换
        const maxEp = Math.max(standaloneMaxEpisode || 0, currentEpisode || 1, 1);
        const options = Array.from({ length: maxEp }, (_, i) => i + 1);
        return (
          <>
            <div className="w-px h-5 bg-(--border-color)" />
            <Select
              size="sm"
              aria-label="切换进度集数"
              selectedKeys={[String(currentEpisode || 1)]}
              onChange={(e) => {
                const v = parseInt((e.target as HTMLSelectElement).value, 10);
                if (v === CREATE_NEXT_EPISODE_ID) {
                  // 无参考剧本模式下直接推进进度标签，不创建 DB 剧本
                  onStandaloneEpisodeChange(maxEp + 1);
                  return;
                }
                if (!isNaN(v) && v >= 1) onStandaloneEpisodeChange(v);
              }}
              className="w-28"
              startContent={<Film className="w-3.5 h-3.5 text-[var(--accent)]" />}
              classNames={{
                trigger: "h-8 min-h-8 bg-white/5 border-[var(--border-color)] hover:border-[var(--accent)]/40 data-[open=true]:border-[var(--accent)]/40",
                value: "text-sm font-medium text-[var(--text-primary)]",
              }}
            >
              {[
                ...options.map((ep) => (
                  <SelectItem key={String(ep)} textValue={`第${ep}集`}>
                    <span>第{ep}集</span>
                  </SelectItem>
                )),
                <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
                  <div className="flex items-center gap-1.5 text-[var(--accent)]">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-medium">新建第{maxEp + 1}集</span>
                  </div>
                </SelectItem>
              ]}
            </Select>
            <button
              type="button"
              onClick={() => onStandaloneEpisodeChange(maxEp + 1)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 text-[var(--accent)] transition-colors"
              title={`新建第${maxEp + 1}集`}
              aria-label="新建下一集"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </>
        );
      })()}

      {/* 集数切换器（绑定剧本后显示剧本集数列表） */}
      {hasBoundScript && (
        <>
          <div className="w-px h-5 bg-(--border-color)" />
          <Select
            size="sm"
            aria-label="切换集数"
            selectedKeys={currentScript ? [String(currentScript.id)] : [String(scripts[0]?.id)]}
            onChange={handleEpisodeChange}
            className="w-28"
            startContent={<Film className="w-3.5 h-3.5 text-[var(--accent)]" />}
            classNames={{
              trigger: "h-8 min-h-8 bg-white/5 border-[var(--border-color)] hover:border-[var(--accent)]/40 data-[open=true]:border-[var(--accent)]/40",
              value: "text-sm font-medium text-[var(--text-primary)]",
            }}
          >
            {[
              ...scripts.map((s) => (
                <SelectItem key={String(s.id)} textValue={`第${s.episode_number}集`}>
                  <span>第{s.episode_number}集</span>
                </SelectItem>
              )),
              ...(onCreateNextEpisode ? [(
                <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
                  <div className="flex items-center gap-1.5 text-[var(--accent)]">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-medium">新建下一集</span>
                  </div>
                </SelectItem>
              )] : [])
            ]}
          </Select>
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
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            title="管理集数"
            aria-label="管理集数"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}

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
