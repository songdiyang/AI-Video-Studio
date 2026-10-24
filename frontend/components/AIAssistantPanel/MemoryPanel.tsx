/**
 * 智能体记忆管理面板（参考 Qoder 记忆页交互）
 * ──────────────────────────────────────────────────────────────
 * 顶部两个全局开关：自动生成（AI 主动 remember）/ 记忆检索（注入上下文）。
 * 记忆列表：用户 / 工程 Tab 切换 + 搜索 + 重要度筛选；行内点击内容直接编辑，
 * 每行支持启停、重要度循环切换、删除；右上角「清空全部」（按当前 Tab 作用域清空）。
 * 数据来自 services/agentMemory，变更后监听 AGENT_MEMORY_CHANGED 自动刷新。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Star, Circle, CircleDot, Trash2, Plus, Power, Search, X, Check, Eraser,
} from 'lucide-react';
import {
  AgentMemory,
  MemoryImportance,
  MemoryScope,
  AGENT_MEMORY_CHANGED,
  MEMORY_CONTENT_MAX,
  addMemory,
  clearAllMemories,
  deleteMemory,
  listMemories,
  loadMemoryFlags,
  purgeLowMemories,
  saveMemoryFlags,
  updateMemory,
  type MemoryFlags,
} from '../../services/agentMemory';

interface MemoryPanelProps {
  projectId: number | null;
  projectName?: string | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const IMPORTANCE_META: Record<MemoryImportance, { label: string; cls: string; icon: React.ReactNode }> = {
  high: { label: '重要', cls: 'text-amber-500', icon: <Star size={10} fill="currentColor" /> },
  normal: { label: '一般', cls: 'text-sky-500', icon: <CircleDot size={10} /> },
  low: { label: '次要', cls: 'text-(--text-muted)', icon: <Circle size={10} /> },
};

const NEXT_IMPORTANCE: Record<MemoryImportance, MemoryImportance> = {
  high: 'normal',
  normal: 'low',
  low: 'high',
};

/** 开关行（Qoder 风格：标题 + 描述 + 右侧开关） */
function ToggleRow({ title, desc, on, onChange }: {
  title: string; desc: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-(--bg-app) transition-colors">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-(--text-primary)">{title}</p>
        <p className="text-[9px] text-(--text-muted) leading-3.5">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`shrink-0 w-7 h-4 rounded-full relative transition-colors cursor-pointer ${
          on ? 'bg-green-500' : 'bg-(--border-color)'
        }`}
        title={on ? '点击关闭' : '点击开启'}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

export default function MemoryPanel({ projectId, projectName, showToast }: MemoryPanelProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [flags, setFlags] = useState<MemoryFlags>(() => loadMemoryFlags());
  const [tab, setTab] = useState<MemoryScope>('user');
  const [keyword, setKeyword] = useState('');
  const [importanceFilter, setImportanceFilter] = useState<MemoryImportance | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [draftImportance, setDraftImportance] = useState<MemoryImportance>('normal');
  // 行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    const list = await listMemories(projectId);
    setMemories(list);
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // AI remember/forget 与开关变更触发的事件，跟随刷新
  useEffect(() => {
    const onChanged = () => {
      void refresh();
      setFlags(loadMemoryFlags());
    };
    window.addEventListener(AGENT_MEMORY_CHANGED, onChanged);
    return () => window.removeEventListener(AGENT_MEMORY_CHANGED, onChanged);
  }, [refresh]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const patchFlag = (patch: Partial<MemoryFlags>) => setFlags(saveMemoryFlags(patch));

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return memories.filter((m) => {
      if (m.scope !== tab) return false;
      if (importanceFilter && m.importance !== importanceFilter) return false;
      if (kw && !m.content.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [memories, tab, keyword, importanceFilter]);

  const tabCount = useMemo(() => ({
    user: memories.filter((m) => m.scope === 'user').length,
    project: memories.filter((m) => m.scope === 'project').length,
  }), [memories]);

  const handleAdd = async () => {
    const content = draftContent.trim();
    if (!content) return;
    const result = await addMemory(projectId, { content, scope: tab, importance: draftImportance });
    if (result.status === 'invalid') {
      showToast('记忆内容为空', 'warning');
      return;
    }
    if (result.status === 'duplicate') {
      showToast(result.wasDisabled ? '已有相同记忆，已重新启用' : '已有相同记忆，未重复记录', 'info');
    } else {
      showToast('记忆已添加', 'success');
    }
    setDraftContent('');
    setAdding(false);
  };

  const startEdit = (mem: AgentMemory) => {
    setEditingId(mem.id);
    setEditDraft(mem.content);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const content = editDraft.trim();
    if (content) await updateMemory(projectId, editingId, { content });
    setEditingId(null);
  };

  const handleClearAll = async () => {
    const n = await clearAllMemories(projectId, tab);
    showToast(n > 0 ? `已清空 ${n} 条${tab === 'user' ? '用户' : '工程'}记忆` : '当前没有可清空的记忆', n > 0 ? 'success' : 'info');
  };

  return (
    <div className="flex flex-col max-h-[inherit]">
      {/* 全局开关区 */}
      <div className="p-1.5 border-b border-(--border-color) space-y-0.5">
        <ToggleRow
          title="开启自动生成"
          desc="根据聊天内容自动学习并记住你的偏好与工程决策"
          on={flags.autoLearn}
          onChange={(v) => patchFlag({ autoLearn: v })}
        />
        <ToggleRow
          title="开启记忆检索"
          desc="对话时自动注入相关记忆，让回答更贴合你的习惯"
          on={flags.retrieval}
          onChange={(v) => patchFlag({ retrieval: v })}
        />
      </div>

      {/* 列表头：Tab + 清空全部 */}
      <div className="flex items-center justify-between px-2.5 pt-2">
        <div className="flex items-center gap-3">
          {(['user', 'project'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`relative pb-1 text-[11px] cursor-pointer transition-colors ${
                tab === s ? 'text-(--text-primary) font-semibold' : 'text-(--text-muted) hover:text-(--text-secondary)'
              }`}
              title={s === 'user' ? '跨工程共享的偏好记忆' : '仅当前工程可调用的记忆'}
            >
              {s === 'user' ? '用户' : (projectName || '工程')}
              <span className="ml-0.5 text-[9px] opacity-70">{tabCount[s]}</span>
              {tab === s && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-(--accent)" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handleClearAll()}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] text-(--text-muted) hover:text-red-400 hover:bg-(--bg-app) cursor-pointer transition-colors"
          title={`清空全部${tab === 'user' ? '用户' : '工程'}记忆`}
        >
          <Trash2 size={10} />
          清空全部
        </button>
      </div>

      {/* 搜索 + 筛选 + 添加 */}
      <div className="flex items-center gap-1 px-2.5 pt-1.5">
        <div className="flex-1 flex items-center gap-1 px-1.5 rounded border border-(--border-color) bg-(--bg-input) focus-within:border-(--accent)">
          <Search size={10} className="shrink-0 text-(--text-muted)" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索记忆..."
            className="flex-1 min-w-0 py-1 text-[10px] bg-transparent outline-none text-(--text-primary)"
          />
          {keyword && (
            <button type="button" onClick={() => setKeyword('')} className="shrink-0 text-(--text-muted) hover:text-(--text-primary) cursor-pointer">
              <X size={10} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="shrink-0 p-1 rounded text-(--accent) hover:bg-(--bg-app) cursor-pointer transition-colors"
          title="手动添加一条记忆"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* 重要度筛选 */}
      <div className="flex items-center gap-1 px-2.5 pt-1.5">
        {(['high', 'normal', 'low'] as const).map((imp) => {
          const meta = IMPORTANCE_META[imp];
          const active = importanceFilter === imp;
          return (
            <button
              key={imp}
              type="button"
              onClick={() => setImportanceFilter(active ? null : imp)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] cursor-pointer transition-colors ${
                active
                  ? 'border-(--accent) text-(--accent) bg-(--accent)/10'
                  : 'border-(--border-color) text-(--text-muted) hover:text-(--text-secondary)'
              }`}
            >
              <span className={active ? '' : meta.cls}>{meta.icon}</span>
              {meta.label}
              {active && <X size={8} />}
            </button>
          );
        })}
        {(keyword || importanceFilter) && (
          <button
            type="button"
            onClick={() => { setKeyword(''); setImportanceFilter(null); }}
            className="text-[9px] text-(--text-muted) hover:text-(--text-primary) cursor-pointer transition-colors"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* 添加表单 */}
      {adding && (
        <div className="mx-2.5 mt-1.5 p-1.5 rounded border border-(--border-color) bg-(--bg-app) space-y-1">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value.slice(0, MEMORY_CONTENT_MAX))}
            placeholder="记忆内容，如：我不喜欢赛博朋克 / 主角必须是红发"
            rows={2}
            className="w-full px-1.5 py-1 rounded text-[10px] bg-(--bg-card) border border-(--border-color) text-(--text-primary) outline-none focus:border-(--accent) resize-none"
          />
          <div className="flex items-center gap-1">
            <select
              value={draftImportance}
              onChange={(e) => setDraftImportance(e.target.value as MemoryImportance)}
              className="px-1 py-0.5 rounded text-[9px] bg-(--bg-card) border border-(--border-color) text-(--text-secondary) outline-none cursor-pointer"
            >
              <option value="high">★ 重要</option>
              <option value="normal">● 一般</option>
              <option value="low">○ 次要</option>
            </select>
            <span className="text-[9px] text-(--text-muted)">
              保存到「{tab === 'user' ? '用户记忆' : '工程记忆'}」
            </span>
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="ml-auto px-2 py-0.5 rounded text-[9px] bg-(--accent) text-white cursor-pointer hover:opacity-90 transition-opacity"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 记忆列表 */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1.5 min-h-15">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-(--text-muted) px-1 py-3 text-center">
            {memories.some((m) => m.scope === tab)
              ? '没有匹配筛选条件的记忆'
              : tab === 'user'
                ? '暂无用户记忆，AI 会在你表达长期偏好时自动记录'
                : projectId
                  ? '暂无工程记忆，AI 会在确认关键设定时自动记录'
                  : '未打开工程，工程记忆不可用'}
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((mem) => {
              const meta = IMPORTANCE_META[mem.importance];
              const editing = editingId === mem.id;
              return (
                <div
                  key={mem.id}
                  className={`group flex items-start gap-1.5 px-1.5 py-1 rounded text-[10px] transition-colors ${
                    mem.enabled ? 'hover:bg-(--bg-app)' : 'opacity-45'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void updateMemory(projectId, mem.id, { importance: NEXT_IMPORTANCE[mem.importance] })}
                    className={`mt-0.5 shrink-0 cursor-pointer ${meta.cls}`}
                    title={`重要度：${meta.label}（点击切换）`}
                  >
                    {meta.icon}
                  </button>
                  {editing ? (
                    <div className="flex-1 min-w-0 flex items-start gap-1">
                      <textarea
                        ref={editInputRef}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value.slice(0, MEMORY_CONTENT_MAX))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commitEdit(); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        rows={2}
                        className="flex-1 min-w-0 px-1 py-0.5 rounded text-[10px] bg-(--bg-input) border border-(--accent) text-(--text-primary) outline-none resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => void commitEdit()}
                        className="shrink-0 mt-0.5 text-green-500 cursor-pointer"
                        title="保存（Enter）"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="shrink-0 mt-0.5 text-(--text-muted) cursor-pointer"
                        title="取消（Esc）"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <span
                      className="flex-1 min-w-0 leading-4 text-(--text-secondary) break-all cursor-text"
                      title="点击编辑"
                      onClick={() => startEdit(mem)}
                    >
                      {mem.content}
                    </span>
                  )}
                  {!editing && (
                    <>
                      <span className="shrink-0 text-[9px] text-(--text-muted) mt-0.5" title="被注入上下文的次数">
                        {mem.useCount}次
                      </span>
                      <button
                        type="button"
                        onClick={() => void updateMemory(projectId, mem.id, { enabled: !mem.enabled })}
                        className={`shrink-0 mt-0.5 cursor-pointer transition-colors ${
                          mem.enabled ? 'text-(--accent)' : 'text-(--text-muted)'
                        }`}
                        title={mem.enabled ? '停用（不再注入上下文）' : '启用'}
                      >
                        <Power size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteMemory(projectId, mem.id).then(() => showToast('记忆已删除', 'success'))}
                        className="shrink-0 mt-0.5 text-(--text-muted) hover:text-red-400 cursor-pointer transition-colors"
                        title="删除该记忆"
                      >
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-2.5 py-1.5 border-t border-(--border-color) flex items-center justify-between">
        <p className="text-[9px] text-(--text-muted) leading-3.5">
          重要度需手动调整；重复内容会自动去重
        </p>
        <button
          type="button"
          onClick={() => void purgeLowMemories(projectId).then((n) => showToast(n > 0 ? `已清理 ${n} 条次要记忆` : '没有可清理的次要记忆', n > 0 ? 'success' : 'info'))}
          className="flex items-center gap-0.5 text-[9px] text-(--text-muted) hover:text-(--text-secondary) cursor-pointer transition-colors shrink-0"
          title="删除全部「次要」重要度的记忆"
        >
          <Eraser size={9} />
          清理次要
        </button>
      </div>
    </div>
  );
}
