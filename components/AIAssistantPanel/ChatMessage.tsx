import React from 'react';
import { Bot, User, Zap } from 'lucide-react';
import MediaAttachment from './MediaAttachment';

export interface ChatMessageAttachment {
  type: 'image' | 'video' | 'file';
  url: string;
  name?: string;
}

export interface ChatMessageSuggestion {
  action: string;
  label: string;
  params?: any;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatMessageAttachment[];
  suggestions?: ChatMessageSuggestion[];
  timestamp: number;
  isLoading?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  onAction?: (action: string, params: any) => void;
}

/** Lightweight markdown-ish renderer: bold, italic, inline code, code blocks, line breaks */
function renderMarkdown(text: string): React.ReactNode {
  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderInline(text.slice(lastIndex, match.index), parts.length));
    }
    parts.push(
      <pre
        key={`cb-${match.index}`}
        className="my-1.5 p-2 rounded bg-black/20 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all"
      >
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(...renderInline(text.slice(lastIndex), parts.length));
  }

  return parts;
}

function renderInline(text: string, keyOffset: number): React.ReactNode[] {
  // Split into lines for <br/>
  return text.split('\n').flatMap((line, li, arr) => {
    const nodes: React.ReactNode[] = [];
    // Process bold, italic, inline code
    const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = inlineRegex.exec(line)) !== null) {
      if (m.index > last) {
        nodes.push(line.slice(last, m.index));
      }
      if (m[1]) {
        nodes.push(<strong key={`b-${keyOffset}-${li}-${m.index}`}>{m[2]}</strong>);
      } else if (m[3]) {
        nodes.push(<em key={`i-${keyOffset}-${li}-${m.index}`}>{m[4]}</em>);
      } else if (m[5]) {
        nodes.push(
          <code
            key={`c-${keyOffset}-${li}-${m.index}`}
            className="px-1 py-0.5 rounded bg-black/15 text-[11px] font-mono"
          >
            {m[6]}
          </code>
        );
      }
      last = m.index + m[0].length;
    }

    if (last < line.length) {
      nodes.push(line.slice(last));
    }

    if (li < arr.length - 1) {
      nodes.push(<br key={`br-${keyOffset}-${li}`} />);
    }

    return nodes;
  });
}

/** Animated loading dots */
const LoadingDots: React.FC = () => (
  <div className="flex items-center gap-1 py-1">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce"
        style={{ animationDelay: `${i * 150}ms` }}
      />
    ))}
  </div>
);

const ChatMessageComponent: React.FC<ChatMessageProps> = ({ message, onAction }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (message.isLoading) {
    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-2 max-w-[85%]">
          <div className="w-6 h-6 rounded-full bg-[var(--accent)]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot size={13} className="text-[var(--accent)]" />
          </div>
          <div className="px-3 py-2 rounded-xl rounded-tl-sm bg-[var(--bg-card)] border border-[var(--border-color)]">
            <LoadingDots />
          </div>
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-1">
        <span className="text-[10px] text-[var(--text-muted)] italic">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isUser
              ? 'bg-accent-500/20'
              : 'bg-[var(--accent)]/15'
          }`}
        >
          {isUser ? (
            <User size={13} className="text-accent-400" />
          ) : (
            <Bot size={13} className="text-[var(--accent)]" />
          )}
        </div>

        <div className="flex flex-col gap-1">
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`flex gap-1.5 flex-wrap ${isUser ? 'justify-end' : 'justify-start'}`}>
              {message.attachments.map((att, idx) => (
                <MediaAttachment
                  key={`${att.url}-${idx}`}
                  type={att.type}
                  url={att.url}
                  name={att.name}
                  size="md"
                />
              ))}
            </div>
          )}

          {/* Content bubble */}
          <div
            className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? 'rounded-tr-sm bg-[var(--accent)] text-white'
                : 'rounded-tl-sm bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]'
            }`}
          >
            {isUser ? message.content : renderMarkdown(message.content)}
          </div>

          {/* Suggestions */}
          {!isUser && message.suggestions && message.suggestions.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-0.5">
              {message.suggestions.map((s, idx) => (
                <button
                  key={`${s.action}-${idx}`}
                  onClick={() => onAction?.(s.action, s.params)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent)]/5 hover:bg-[var(--accent)]/15 transition-colors"
                >
                  <Zap size={10} />
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <span className={`text-[9px] text-[var(--text-muted)] ${isUser ? 'text-right' : 'text-left'}`}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatMessageComponent;
