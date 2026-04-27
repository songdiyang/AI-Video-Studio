/**
 * ScriptOutlinePanel - 剧本大纲面板
 *
 * 在分镜工作台左侧面板中展示当前剧本的结构化大纲，
 * 将纯文本剧本按场景/段落解析为可折叠树形视图，
 * 样式与代码编辑器的大纲面板保持一致。
 */

import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Clapperboard, MessageSquare, Globe } from 'lucide-react';

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

// ==================== 主组件 ====================

const ScriptOutlinePanel: React.FC<ScriptOutlinePanelProps> = ({
  scriptContent,
  scriptTitle,
  isLoading,
}) => {
  const outlineNodes = useMemo(() => {
    if (!scriptContent) return [];
    return parseScriptToOutline(scriptContent);
  }, [scriptContent]);

  // 统计
  const stats = useMemo(() => {
    let scenes = 0;
    let dialogues = 0;
    const countNodes = (nodes: OutlineNode[]) => {
      for (const n of nodes) {
        if (n.type === 'scene') scenes++;
        if (n.type === 'dialogue') dialogues++;
        if (n.children) countNodes(n.children);
      }
    };
    countNodes(outlineNodes);
    return { scenes, dialogues };
  }, [outlineNodes]);

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

  if (!scriptContent) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">暂无剧本内容</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">绑定剧本后可在此查看大纲</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部信息 */}
      {scriptTitle && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent)]" />
            <span className="text-xs font-medium text-[var(--text-primary)] truncate">{scriptTitle}</span>
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
      )}

      {/* 大纲树 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {outlineNodes.length === 0 ? (
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
    </div>
  );
};

export default ScriptOutlinePanel;
