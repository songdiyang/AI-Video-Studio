/**
 * ScriptOutlinePanel - 剧本大纲面板
 *
 * 在分镜工作台左侧面板中展示当前剧本的结构化大纲，
 * 将纯文本剧本按场景/段落解析为可折叠树形视图，
 * 样式与代码编辑器的大纲面板保持一致。
 */

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, FileText, Clapperboard, MessageSquare, Globe, Link2, Link2Off, Plus, Search, CheckCircle2, X, Sparkles, Upload } from 'lucide-react';
import { fetchScriptLibrary, type ScriptLibraryItem } from '../../services/scripts';

// ==================== 类型 ====================

interface OutlineNode {
  id: string;
  type: 'scene' | 'action' | 'dialogue';
  label: string;
  content?: string;
  children?: OutlineNode[];
  lineNumber?: number;
}

interface ScriptOutlinePanelProps {
  scriptContent: string | null;
  scriptTitle?: string;
  isLoading?: boolean;
  /** 当前项目 ID，用于限定可选参考剧本的范围 */
  projectId?: number | null;
  /** 是否允许在面板内选择参考剧本（弱绑定） */
  canPick?: boolean;
  /**
   * 当前剧本是否由分镜状态强绑定（项目+集数）。
   * 强绑定时只允许查看，不允许在此解绑（需去剧本库操作）。
   */
  isBoundViaEpisode?: boolean;
  /** 选中 / 解除参考剧本的回调（scriptId = null 表示解绑） */
  onPickScript?: (scriptId: number | null, item: ScriptLibraryItem | null) => void;
  /** 请求生成新剧本（弱绑定参考剧本场景），由父组件打开 ScriptGenerateModal */
  onCreateNewScript?: () => void;
}

// ==================== 剧本解析 ====================

/**
 * 将纯文本剧本解析为大纲树
 * 支持常见格式：
 *   - 场景标题：第X场 / 第X幕 / Scene X / INT. / EXT. / 【场景名】
 *   - 台词：角色名：/ 角色名（...）
 *   - 其他视为动作描述
 */
function parseScriptToOutline(text: string): OutlineNode[] {
  const lines = text.split('\n');
  const nodes: OutlineNode[] = [];
  let currentScene: OutlineNode | null = null;
  let nodeIndex = 0;

  // 场景标题正则
  const sceneHeadingRe = /^(第[零一二三四五六七八九十百千\d]+[场幕集]|Scene\s+\d+|INT\.|EXT\.|内景|外景|【[^】]+】)/i;
  // 台词正则：角色名后跟冒号或括号
  const dialogueRe = /^[\p{Script=Han}\w]{1,10}[：:（(]/u;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (sceneHeadingRe.test(line)) {
      // 新场景
      currentScene = {
        id: `scene-${nodeIndex++}`,
        type: 'scene',
        label: line,
        children: [],
        lineNumber: i + 1,
      };
      nodes.push(currentScene);
    } else if (dialogueRe.test(line) && currentScene) {
      // 台词
      const colonIdx = line.search(/[：:]/);
      const parenIdx = line.search(/[（(]/);
      let charName = '';
      if (colonIdx > 0 && (parenIdx < 0 || colonIdx < parenIdx)) {
        charName = line.slice(0, colonIdx);
      } else if (parenIdx > 0) {
        charName = line.slice(0, parenIdx);
      } else {
        charName = line.slice(0, 10);
      }
      currentScene.children!.push({
        id: `dialogue-${nodeIndex++}`,
        type: 'dialogue',
        label: charName,
        content: line.slice(charName.length + 1).replace(/^[：:)\）]\s*/, ''),
        lineNumber: i + 1,
      });
    } else if (currentScene) {
      // 动作描述
      currentScene.children!.push({
        id: `action-${nodeIndex++}`,
        type: 'action',
        label: line.length > 40 ? line.slice(0, 40) + '...' : line,
        lineNumber: i + 1,
      });
    } else {
      // 场景前的文本作为顶层节点
      nodes.push({
        id: `action-${nodeIndex++}`,
        type: 'action',
        label: line.length > 40 ? line.slice(0, 40) + '...' : line,
        lineNumber: i + 1,
      });
    }
  }

  // 如果没有解析出任何场景，将全文作为一个动作节点
  if (nodes.length === 0 && text.trim()) {
    // 按段落拆分
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length > 0) {
      paragraphs.forEach((p, idx) => {
        const firstLine = p.trim().split('\n')[0];
        nodes.push({
          id: `para-${idx}`,
          type: 'action',
          label: firstLine.length > 40 ? firstLine.slice(0, 40) + '...' : firstLine,
          content: p.trim(),
          lineNumber: 1,
        });
      });
    }
  }

  return nodes;
}

// ==================== 大纲节点组件 ====================

interface OutlineNodeViewProps {
  node: OutlineNode;
  depth: number;
}

const TYPE_CONFIG = {
  scene: { icon: Clapperboard, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  action: { icon: Globe, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  dialogue: { icon: MessageSquare, color: 'text-purple-400', bg: 'bg-purple-500/20' },
};

const OutlineNodeView: React.FC<OutlineNodeViewProps> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const config = TYPE_CONFIG[node.type];
  const Icon = config.icon;

  return (
    <div style={{ marginLeft: depth > 0 ? `${depth * 12}px` : 0 }}>
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-[var(--bg-input)] transition-colors group"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* 展开/折叠 */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* 类型图标 */}
        <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />

        {/* 标签 */}
        <span className={`text-xs truncate ${node.type === 'scene' ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {node.label}
        </span>

        {/* 子项计数 */}
        {hasChildren && (
          <span className="text-[10px] text-[var(--text-muted)] ml-auto shrink-0">
            {node.children!.length}
          </span>
        )}
      </div>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {node.children!.map((child) => (
            <OutlineNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* 内容预览（动作/台词有内容时显示） */}
      {node.content && !hasChildren && (
        <div className="ml-10 px-2 py-0.5">
          <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
            {node.content}
          </p>
        </div>
      )}
    </div>
  );
};

// ==================== Markdown 剧本渲染 ====================

type MdLine =
  | { kind: 'scene'; text: string }
  | { kind: 'divider' }
  | { kind: 'dialogue'; character: string; modifier?: string; content: string }
  | { kind: 'action'; text: string }
  | { kind: 'stage'; text: string }
  | { kind: 'narration'; text: string };

/** 粗略检测文本是否含常见 Markdown 标记（本项目 AI 生成的剧本模板） */
function isMarkdownScript(text: string): boolean {
  return /^##+\s+/m.test(text) || /\*\*[^*\n]+\*\*/.test(text) || /^-{3,}\s*$/m.test(text);
}

/** 逐行解析 Markdown 剧本，产出结构化的行数组 */
function parseMarkdownScript(text: string): MdLine[] {
  const lines = text.split('\n');
  const out: MdLine[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 场景标题：## xxx / ### xxx
    if (/^#{2,}\s+/.test(line)) {
      out.push({ kind: 'scene', text: line.replace(/^#+\s+/, '') });
      continue;
    }
    // 分割线：--- 或 ———
    if (/^-{3,}$/.test(line) || /^\u2014{2,}$/.test(line) || /^\*{3,}$/.test(line)) {
      out.push({ kind: 'divider' });
      continue;
    }
    // 对白：**角色（修饰）**：“内容”
    const dialogMatch = line.match(/^\*\*([^*\(\uFF08]+?)(?:[\(\uFF08]([^)\uFF09]+)[\)\uFF09])?\*\*\s*[\uFF1A:]\s*["\u201C\u2018\u300C]?(.+?)["\u201D\u2019\u300D]?$/);
    if (dialogMatch) {
      out.push({
        kind: 'dialogue',
        character: dialogMatch[1].trim(),
        modifier: dialogMatch[2]?.trim() || undefined,
        content: dialogMatch[3].trim(),
      });
      continue;
    }
    // 动作描写：*整段斜体*
    if (/^\*[^*]+\*$/.test(line)) {
      out.push({ kind: 'action', text: line.slice(1, -1).trim() });
      continue;
    }
    // 舞台提示：（...） 或 (...)
    if (/^[\(\uFF08].+[\)\uFF09]$/.test(line)) {
      out.push({ kind: 'stage', text: line.slice(1, -1).trim() });
      continue;
    }
    out.push({ kind: 'narration', text: line });
  }
  return out;
}

/** 渲染加粗标记：`**xxx**` 内联高亮 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={i} className="text-[var(--text-primary)] font-semibold">{p.slice(2, -2)}</strong>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const MarkdownOutlineView: React.FC<{ lines: MdLine[] }> = ({ lines }) => {
  return (
    <div className="space-y-1">
      {lines.map((l, i) => {
        switch (l.kind) {
          case 'scene':
            return (
              <div
                key={i}
                className="flex items-start gap-1.5 mt-3 first:mt-0 px-1.5 py-1 rounded bg-cyan-500/5 border-l-2 border-cyan-400/60"
              >
                <Clapperboard className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug break-words">
                  {l.text}
                </span>
              </div>
            );
          case 'divider':
            return (
              <div key={i} className="my-2 border-t border-dashed border-[var(--border-color)]/60" />
            );
          case 'dialogue':
            return (
              <div key={i} className="pl-2 py-0.5">
                <div className="flex items-baseline gap-1.5">
                  <MessageSquare className="w-3 h-3 text-purple-400 shrink-0 translate-y-0.5" />
                  <span className="text-[11px] font-semibold text-purple-300 break-words">
                    {l.character}
                  </span>
                  {l.modifier && (
                    <span className="text-[10px] text-[var(--text-muted)] italic break-words">
                       · {l.modifier}
                    </span>
                  )}
                </div>
                <div className="pl-4 mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                  “{l.content}”
                </div>
              </div>
            );
          case 'action':
            return (
              <div
                key={i}
                className="pl-2 text-[11px] italic leading-relaxed text-amber-300/85 whitespace-pre-wrap break-words"
              >
                {renderInline(l.text)}
              </div>
            );
          case 'stage':
            return (
              <div
                key={i}
                className="pl-2 text-[11px] italic leading-relaxed text-[var(--text-muted)] whitespace-pre-wrap break-words"
              >
                （{l.text}）
              </div>
            );
          case 'narration':
          default:
            return (
              <div
                key={i}
                className="pl-2 text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words"
              >
                {renderInline(l.text)}
              </div>
            );
        }
      })}
    </div>
  );
};

// ==================== 主组件 ====================

// ==================== 剧本选择器（弱绑定）====================

interface ScriptPickerProps {
  projectId: number | null | undefined;
  currentScriptId?: number | null;
  onSelect: (item: ScriptLibraryItem | null) => void;
  onClose: () => void;
}

const ScriptPicker: React.FC<ScriptPickerProps> = ({ projectId, currentScriptId, onSelect, onClose }) => {
  const [items, setItems] = useState<ScriptLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchScriptLibrary('all')
      .then((all) => {
        if (cancelled) return;
        // 项目内的剧本 + 未绑定项目的个人剧本都可侜选择
        const list = all.filter(
          (s) => s.project_id === projectId || s.project_id === null
        );
        setItems(list);
      })
      .catch((e) => !cancelled && setErr(e?.message || '加载剧本库失败'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [projectId]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((i) =>
      (i.title || '').toLowerCase().includes(kw) ||
      (i.content || '').toLowerCase().includes(kw)
    );
  }, [items, keyword]);

  return (
    <div className="absolute inset-0 bg-[var(--bg-app)]/95 backdrop-blur-sm z-10 flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--border-color)] flex items-center gap-2">
        <Link2 className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-sm font-medium text-[var(--text-primary)]">选择参考剧本</span>
        <span className="text-[10px] text-[var(--text-muted)]">弱绑定，仅用于大纲展示与创作参考</span>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索剧本标题或内容..."
            className="w-full pl-7 pr-2 py-1.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-[var(--text-muted)]">加载中…</div>
        ) : err ? (
          <div className="py-6 text-center text-xs text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-40" />
            <p className="text-xs text-[var(--text-muted)]">暂无可选剧本</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">可在资产管理 → 剧本管理中创建</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((it) => {
              const isCurrent = it.id === currentScriptId;
              return (
                <button
                  key={it.id}
                  onClick={() => onSelect(it)}
                  className={`w-full text-left px-2 py-2 rounded-md border transition-colors ${
                    isCurrent
                      ? 'bg-[var(--accent)]/10 border-[var(--accent)]/40'
                      : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:bg-[var(--bg-input)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {it.title || `无标题剧本 #${it.id}`}
                    </span>
                    {isCurrent && <CheckCircle2 className="w-3 h-3 text-[var(--accent)] shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 ml-5">
                    {it.project_id ? (
                      <span className="text-[10px] text-cyan-400">
                        {it.project_name || `项目 #${it.project_id}`} · 第{it.episode_number}集
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400">个人剧本</span>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {(it.content || '').length} 字
                    </span>
                  </div>
                  {it.content && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 ml-5 line-clamp-2">
                      {it.content.slice(0, 80)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  scriptContent,
  scriptTitle,
  isLoading,
  projectId,
  canPick,
  isBoundViaEpisode,
  onPickScript,
  onCreateNewScript,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isMarkdown = useMemo(
    () => (scriptContent ? isMarkdownScript(scriptContent) : false),
    [scriptContent]
  );
  const markdownLines = useMemo(
    () => (scriptContent && isMarkdown ? parseMarkdownScript(scriptContent) : []),
    [scriptContent, isMarkdown]
  );
  const outlineNodes = useMemo(() => {
    if (!scriptContent || isMarkdown) return [];
    return parseScriptToOutline(scriptContent);
  }, [scriptContent, isMarkdown]);

  // 统计
  const stats = useMemo(() => {
    let scenes = 0;
    let dialogues = 0;
    if (isMarkdown) {
      for (const l of markdownLines) {
        if (l.kind === 'scene') scenes++;
        if (l.kind === 'dialogue') dialogues++;
      }
      return { scenes, dialogues };
    }
    const countNodes = (nodes: OutlineNode[]) => {
      for (const n of nodes) {
        if (n.type === 'scene') scenes++;
        if (n.type === 'dialogue') dialogues++;
        if (n.children) countNodes(n.children);
      }
    };
    countNodes(outlineNodes);
    return { scenes, dialogues };
  }, [outlineNodes, isMarkdown, markdownLines]);

  const allowPick = !!canPick && !!onPickScript;
  const allowCreate = !!onCreateNewScript;
  console.log('[ScriptOutlinePanel] allowCreate:', allowCreate, 'onCreateNewScript:', onCreateNewScript);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-[var(--text-muted)]">加载剧本中...</p>
        </div>
      </div>
    );
  }

  // 空态
  if (!scriptContent) {
    return (
      <div className="relative flex-1 flex items-center justify-center h-full">
        <div className="text-center px-4">
          <FileText className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">暂无剧本内容</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">
            剧本是 AI 智能分镜的参考，可选
          </p>
          <button
            onClick={() => {
              // 打开剧本创作中心标签页
              window.dispatchEvent(new CustomEvent('openScriptGenerateTab'));
            }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
            title="AI生成新剧本或上传已有剧本"
          >
            <Sparkles className="w-3.5 h-3.5" />
            添加剧本
          </button>
          {!allowPick && !allowCreate && (
            <p className="text-[10px] text-[var(--text-muted)] mt-3 opacity-50">
              绑定剧本后可在此查看大纲
            </p>
          )}
        </div>
        {pickerOpen && (
          <ScriptPicker
            projectId={projectId}
            currentScriptId={null}
            onSelect={(item) => {
              setPickerOpen(false);
              if (item && onPickScript) onPickScript(item.id, item);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* 头部信息 */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="text-xs font-medium text-[var(--text-primary)] truncate flex-1">
            {scriptTitle || '参考剧本'}
          </span>
          {allowPick && !isBoundViaEpisode && (
            <>
              <button
                onClick={() => setPickerOpen(true)}
                className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                title="更换参考剧本"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
              {allowCreate && (
                <button
                  onClick={() => {
                    console.log('[ScriptOutlinePanel] 点击头部生成新剧本按钮，调用 onCreateNewScript');
                    onCreateNewScript?.();
                  }}
                  className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  title="AI 生成新剧本作为参考"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onPickScript!(null, null)}
                className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-red-400 transition-colors"
                title="解绑剧本"
              >
                <Link2Off className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {isBoundViaEpisode && (
            <span
              className="text-[10px] text-[var(--text-muted)] shrink-0"
              title="该剧本由项目+集数强绑定，需在剧本库中解绑"
            >
              项目绑定
            </span>
          )}
        </div>
        {(stats.scenes > 0 || stats.dialogues > 0) && (
          <div className="flex items-center gap-3 mt-1 ml-6">
            {stats.scenes > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                <Clapperboard className="w-3 h-3 inline mr-0.5 text-cyan-400" />
                {stats.scenes} 场
              </span>
            )}
            {stats.dialogues > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                <MessageSquare className="w-3 h-3 inline mr-0.5 text-purple-400" />
                {stats.dialogues} 条台词
              </span>
            )}
          </div>
        )}
      </div>

      {/* 大纲主体：Markdown 剧本按 md 渲染，普通文本走原有树形大纲 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isMarkdown ? (
          <MarkdownOutlineView lines={markdownLines} />
        ) : outlineNodes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-[var(--text-muted)]">无法解析大纲结构</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {outlineNodes.map((node) => (
              <OutlineNodeView key={node.id} node={node} depth={0} />
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ScriptPicker
          projectId={projectId}
          currentScriptId={null}
          onSelect={(item) => {
            setPickerOpen(false);
            if (item && onPickScript) onPickScript(item.id, item);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default ScriptOutlinePanel;
