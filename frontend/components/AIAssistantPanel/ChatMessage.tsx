import React, { useState } from 'react';
import { Check, AlertTriangle, Brain, Star, TrendingUp, TrendingDown, Lightbulb, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import MediaAttachment from './MediaAttachment';

const DESTRUCTIVE_ACTIONS: ReadonlySet<string> = new Set([
  'delete_scene', 'update_scene', 'insert_scene',
  'update_scene_dialogues', 'update_scene_characters_location',
  'move_scene', 'reorder_scenes',
  'delete_character', 'update_character',
  'delete_location', 'update_location',
  'delete_script', 'bind_script',
  'update_project',
  'restore_version',
]);

// 会自动执行的 action（这些不需要显示操作按钮）
const AUTO_EXECUTE_ACTIONS: ReadonlySet<string> = new Set([
  'auto_storyboard',
  'generate_frame',
  'generate_video',
  'insert_scene',
  'delete_scene',
  'update_scene',
  'update_scene_dialogues',
  'update_scene_characters_location',
  'move_scene',
  'reorder_scenes',
  'update_character',
  'delete_character',
  'update_location',
  'delete_location',
  'create_script',
  'bind_script',
  'update_project',
  'invite_member',
  'switch_episode',
  'create_next_episode',
  'optimize_prompt',
  'upload_material',
]);

export interface ChatMessageAttachment {
  type: 'image' | 'video' | 'file' | 'script';
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
  reasoning?: string; // 思考过程（默认折叠）
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
      <div className="px-1 py-1">
        <LoadingDots />
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-1">
        <span className="text-[10px] text-[var(--text-muted)] italic whitespace-pre-wrap">{message.content}</span>
      </div>
    );
  }

  // ── 用户消息：右边气泡，无头像 ────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex flex-col gap-1 max-w-[85%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
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
          <div className="px-3 py-2 rounded-xl rounded-tr-sm bg-[var(--accent)] text-white text-xs leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </div>
          <span className="text-[9px] text-[var(--text-muted)] text-right">
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    );
  }

// ── 剧本分析评分卡片 ─────────────────────────────────────────
function getScoreColor(score: number): { bg: string; text: string; border: string; label: string } {
  if (score >= 90) return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: '优秀' };
  if (score >= 75) return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: '良好' };
  if (score >= 60) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: '一般' };
  return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: '需改进' };
}

const ScriptAnalysisCard: React.FC<{
  data: {
    overallScore: number;
    dimensions: Array<{ name: string; score: number; comment: string }>;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    summary: string;
  };
}> = ({ data }) => {
  const overallColor = getScoreColor(data.overallScore);
  return (
    <div className="space-y-3">
      {/* 总体评分 */}
      <div className={`p-3 rounded-xl border ${overallColor.border} ${overallColor.bg} flex items-center gap-3`}>
        <div className={`text-2xl font-bold ${overallColor.text}`}>{data.overallScore}</div>
        <div className="flex-1">
          <div className={`text-xs font-medium ${overallColor.text}`}>总体评分 · {overallColor.label}</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{data.summary}</div>
        </div>
      </div>

      {/* 8维度评分卡片 */}
      <div className="grid grid-cols-2 gap-2">
        {data.dimensions.map((dim, i) => {
          const colors = getScoreColor(dim.score);
          return (
            <div key={i} className={`p-2.5 rounded-lg border ${colors.border} ${colors.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[var(--text-secondary)] truncate">{dim.name}</span>
                <span className={`text-xs font-bold ${colors.text}`}>{dim.score}</span>
              </div>
              <div className="text-[10px] text-[var(--text-muted)] leading-relaxed line-clamp-2">{dim.comment}</div>
            </div>
          );
        })}
      </div>

      {/* 优点 */}
      {data.strengths && data.strengths.length > 0 && (
        <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingUp size={11} className="text-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">亮点</span>
          </div>
          <ul className="space-y-1">
            {data.strengths.map((s, i) => (
              <li key={i} className="text-[10px] text-[var(--text-secondary)] flex items-start gap-1">
                <span className="text-emerald-400 mt-0.5">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 不足 */}
      {data.weaknesses && data.weaknesses.length > 0 && (
        <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-1 mb-1.5">
            <TrendingDown size={11} className="text-red-400" />
            <span className="text-[10px] font-medium text-red-400">不足</span>
          </div>
          <ul className="space-y-1">
            {data.weaknesses.map((w, i) => (
              <li key={i} className="text-[10px] text-[var(--text-secondary)] flex items-start gap-1">
                <span className="text-red-400 mt-0.5">-</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 建议 */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="p-2.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5">
          <div className="flex items-center gap-1 mb-1.5">
            <Lightbulb size={11} className="text-[var(--accent)]" />
            <span className="text-[10px] font-medium text-[var(--accent)]">优化建议</span>
          </div>
          <ul className="space-y-1">
            {data.suggestions.map((s, i) => (
              <li key={i} className="text-[10px] text-[var(--text-secondary)] flex items-start gap-1">
                <span className="text-[var(--accent)] mt-0.5">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

  // ── AI 消息：全宽无气泡无头像（Qoder 风格） ──────────────────
  const isWelcome = message.id === 'welcome';
  if (isWelcome) return null;

  // 检测是否为剧本分析结果消息
  let analysisData: {
    overallScore: number;
    dimensions: Array<{ name: string; score: number; comment: string }>;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    summary: string;
  } | null = null;
  try {
    const parsed = JSON.parse(message.content);
    if (parsed.type === 'scriptAnalysis') {
      analysisData = parsed;
    }
  } catch {
    // not JSON, normal message
  }

  if (analysisData) {
    return (
      <div className="w-full flex flex-col gap-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Brain size={13} className="text-emerald-400" />
          <span className="text-[11px] font-medium text-[var(--text-primary)]">剧本分析报告</span>
        </div>
        <ScriptAnalysisCard data={analysisData} />
        <span className="text-[9px] text-[var(--text-muted)] text-right">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    );
  }

  // ── 思考过程折叠组件 ──────────────────────────────────────
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  return (
    <div className="w-full flex flex-col gap-1">
      {message.attachments && message.attachments.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
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

      {/* 思考过程（默认折叠） */}
      {message.reasoning && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <button
            onClick={() => setReasoningExpanded((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
          >
            {reasoningExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Brain size={11} />
            <span className="font-medium">思考过程</span>
            <span className="text-[var(--text-muted)] ml-auto">
              {reasoningExpanded ? '点击折叠' : '点击展开'}
            </span>
          </button>
          {reasoningExpanded && (
            <div className="px-2.5 pb-2 text-[10px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap break-words border-t border-amber-500/10 pt-1.5">
              {message.reasoning}
            </div>
          )}
        </div>
      )}

      <div className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[var(--text-primary)]">
        {renderMarkdown(message.content)}
      </div>

      {message.suggestions && message.suggestions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-0.5 justify-end">
          {message.suggestions
            .filter((s) => !AUTO_EXECUTE_ACTIONS.has(s.action))
            .map((s, idx) => {
              const destructive = DESTRUCTIVE_ACTIONS.has(s.action);
              return (
                <button
                  key={`${s.action}-${idx}`}
                  onClick={() => onAction?.(s.action, s.params)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border cursor-pointer transition-colors ${
                    destructive
                      ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                      : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
        </div>
      )}

      <span className="text-[9px] text-[var(--text-muted)] text-right">
        {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

export default ChatMessageComponent;
