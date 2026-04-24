import React from 'react';
import { X, Trash2, MessageSquare, Clock } from 'lucide-react';
import { Session } from '../../hooks/useAIAssistantSessions';

interface HistoryPanelProps {
  sessions: Session[];
  openTabIds: number[];
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  sessions,
  openTabIds,
  onOpen,
  onDelete,
  onClose,
}) => {
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="absolute right-3 top-12 w-72 max-h-[70vh] bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)]">
          <span className="text-xs font-medium text-[var(--text-primary)]">历史会话</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <div className="text-center py-6 text-[var(--text-muted)] text-xs">
              暂无历史会话
            </div>
          )}
          {sessions.map((s) => {
            const isOpen = openTabIds.includes(s.id);
            return (
              <div
                key={s.id}
                onClick={() => {
                  onOpen(s.id);
                  onClose();
                }}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  isOpen
                    ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30'
                    : 'hover:bg-[var(--bg-input)] border border-transparent'
                }`}
              >
                <MessageSquare size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--text-primary)] truncate">
                    {s.title}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} className="text-[var(--text-muted)]" />
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatTime(s.last_message_at)}
                    </span>
                    {s.message_count > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        · {s.message_count} 条
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-all"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default HistoryPanel;
