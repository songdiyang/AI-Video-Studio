// 历史对话弹窗：全量会话列表 + 标题重命名 + 删除（自 AIAssistantPanel 拆出，行为不变）。
import React from 'react';
import { History, X, MessageSquare, Check, Edit3, Trash2 } from 'lucide-react';
import type { SessionLite } from './helpers';

export interface HistoryModalProps {
  /** 全量历史会话（allSessions，而非标签栏已打开的子集） */
  sessions: SessionLite[];
  currentSessionId: number | null;
  editingTitleId: number | null;
  editingTitleDraft: string;
  openTabIds: number[];
  onClose: () => void;
  onSwitchSession: (id: number) => void;
  onStartEdit: (id: number, title: string) => void;
  onDraftChange: (value: string) => void;
  onCommitEdit: (id: number, draft: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
}

const HistoryModal: React.FC<HistoryModalProps> = ({
  sessions,
  currentSessionId,
  editingTitleId,
  editingTitleDraft,
  openTabIds,
  onClose,
  onSwitchSession,
  onStartEdit,
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}) => (
  <div className="absolute inset-0 bg-black/40 flex items-start justify-center pt-10 z-20" onClick={onClose}>
    <div
      className="bg-(--bg-nav) border border-(--border-color) rounded-lg shadow-xl w-80 max-w-[92%] max-h-[80%] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--border-color)">
        <div className="flex items-center gap-2">
          <History size={14} className="text-(--accent)" />
          <span className="font-semibold text-sm text-(--text-primary)">历史对话</span>
          <span className="text-[10px] text-(--text-muted)">({sessions.length})</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-(--bg-input) text-(--text-muted)"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 历史列表用全量 sessions：已关闭的标签仍可从历史重新打开 */}
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-[11px] text-(--text-muted)">
            <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
            <div>还没有历史对话</div>
            <div className="mt-1 opacity-70">发送消息或点右上角 + 号开始</div>
          </div>
        ) : (
          <ul className="py-1">
            {sessions.map((s) => {
              const isActive = s.id === currentSessionId;
              const isEditing = editingTitleId === s.id;
              const timeStr = s.last_message_at
                ? new Date(s.last_message_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : new Date(s.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
              return (
                <li
                  key={s.id}
                  className={`group px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-(--accent)/15 border border-(--accent)/40'
                      : 'hover:bg-(--bg-input) border border-transparent'
                  }`}
                  onClick={() => { if (!isEditing) onSwitchSession(s.id); }}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={12} className={isActive ? 'text-(--accent)' : 'text-(--text-muted)'} />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingTitleDraft}
                        onChange={(e) => onDraftChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onCommitEdit(s.id, editingTitleDraft);
                          } else if (e.key === 'Escape') {
                            onCancelEdit();
                          }
                        }}
                        className="flex-1 text-xs bg-(--bg-app) border border-(--border-color) rounded px-1.5 py-0.5 text-(--text-primary) focus:outline-none focus:border-(--accent)"
                      />
                    ) : (
                      <span className="flex-1 text-xs text-(--text-primary) truncate" title={s.title}>
                        {s.title}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCommitEdit(s.id, editingTitleDraft);
                          }}
                          className="p-0.5 rounded hover:bg-(--bg-app) text-(--accent)"
                          title="保存"
                        >
                          <Check size={11} />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartEdit(s.id, s.title);
                          }}
                          className="p-0.5 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-(--text-primary)"
                          title="重命名"
                        >
                          <Edit3 size={11} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(s.id);
                        }}
                        className="p-0.5 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-4.5 text-[10px] text-(--text-muted)">
                    <span>{s.message_count} 条</span>
                    <span>·</span>
                    <span>{timeStr}</span>
                    {openTabIds.includes(s.id) && (
                      <>
                        <span>·</span>
                        <span className="text-(--accent)">已打开</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  </div>
);

export default HistoryModal;
