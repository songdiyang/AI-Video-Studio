import React from 'react';
import { Card, CardBody, Textarea } from '@heroui/react';
import { Sparkles } from 'lucide-react';

interface ScriptPreviewProps {
  content: string;
  isEditing: boolean;
  loadingScript: boolean;
  onContentChange: (value: string) => void;
}

// 剧本内容渲染器：将 Markdown 格式的剧本转换为美化的 HTML
const renderScriptContent = (content: string) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // 场景标题: ## 场景X：XXX
    if (trimmedLine.startsWith('## ')) {
      const title = trimmedLine.substring(3);
      elements.push(
        <h2 key={key++} className="text-xl font-bold text-[var(--accent-light)] mt-8 mb-4 pb-2 border-b border-[var(--border-color)] first:mt-0">
          {title}
        </h2>
      );
      return;
    }

    // 分隔线: ---
    if (trimmedLine === '---') {
      elements.push(
        <hr key={key++} className="my-6 border-t border-[var(--border-color)]" />
      );
      return;
    }

    // 场景描述: *...*
    if (trimmedLine.startsWith('*') && trimmedLine.endsWith('*') && trimmedLine.length > 2) {
      const desc = trimmedLine.slice(1, -1);
      elements.push(
        <p key={key++} className="text-[var(--text-secondary)] italic my-4 pl-4 border-l-2 border-[var(--border-color)] leading-relaxed">
          {desc}
        </p>
      );
      return;
    }

   // 角色对白 A: **角色名**：（舞台指示）"对白" —— 含动作提示
    const dialogueWithActionMatch = trimmedLine.match(/^\*\*(.+?)\*\*[:：]\s*([（(].+?[）)])\s*[\u201c"](.+?)[\u201d"]*$/);
    if (dialogueWithActionMatch) {
      const [, characterName, action, dialogue] = dialogueWithActionMatch;
      elements.push(
        <div key={key++} className="my-3 flex items-start gap-3">
          <span className="font-bold text-[var(--success)] whitespace-nowrap min-w-[4rem]">{characterName}</span>
          <span className="text-[var(--text-primary)] leading-relaxed">
            <span className="text-[var(--warning)] text-sm italic mr-1">（{action.slice(1, -1)}）</span>
            "{dialogue}"
          </span>
        </div>
      );
      return;
    }
   
    // 角色对白 B: **角色名**："对白" 或 **角色名**:"对白"
    const dialogueMatch = trimmedLine.match(/^\*\*(.+?)\*\*[:：]\s*[\u201c"](.+?)[\u201d"]*$/);
    if (dialogueMatch) {
      const [, characterName, dialogue] = dialogueMatch;
      elements.push(
        <div key={key++} className="my-3 flex items-start gap-3">
          <span className="font-bold text-[var(--success)] whitespace-nowrap min-w-[4rem]">{characterName}</span>
          <span className="text-[var(--text-primary)] leading-relaxed">"{dialogue}"</span>
        </div>
      );
      return;
    }
   
    // 角色对白 C: 角色名   "对白" —— 无 ** 标记，名字后跟 2+ 空格/Tab
    const simpleDialogueMatch = trimmedLine.match(/^([^\s*（("\u201c]{1,10})\s{2,}[\u201c"](.+?)[\u201d"]*$/);
    if (simpleDialogueMatch) {
      const [, characterName, dialogue] = simpleDialogueMatch;
      elements.push(
        <div key={key++} className="my-3 flex items-start gap-3">
          <span className="font-bold text-[var(--success)] whitespace-nowrap min-w-[4rem]">{characterName}</span>
          <span className="text-[var(--text-primary)] leading-relaxed">"{dialogue}"</span>
        </div>
      );
      return;
    }

    // 动作指示: （...） 或 (...)
    if ((trimmedLine.startsWith('（') && trimmedLine.endsWith('）')) ||
        (trimmedLine.startsWith('(') && trimmedLine.endsWith(')'))) {
      const action = trimmedLine.slice(1, -1);
      elements.push(
        <p key={key++} className="text-[var(--warning)] text-sm my-2 pl-6 italic">
          （{action}）
        </p>
      );
      return;
    }

    // 空行
    if (trimmedLine === '') {
      elements.push(<div key={key++} className="h-2" />);
      return;
    }

    // 普通文本（处理行内 **加粗**）
    const inlineParts = trimmedLine.split(/(\*\*.+?\*\*)/);
    const hasInlineBold = inlineParts.length > 1;
    elements.push(
      <p key={key++} className="text-[var(--text-secondary)] my-2 leading-relaxed">
        {hasInlineBold
          ? inlineParts.map((part, i) => {
              const boldMatch = part.match(/^\*\*(.+?)\*\*$/);
              return boldMatch
                ? <strong key={i} className="font-bold text-[var(--text-primary)]">{boldMatch[1]}</strong>
                : part;
            })
          : line
        }
      </p>
    );
  });

  return elements;
};

const ScriptPreview: React.FC<ScriptPreviewProps> = ({
  content,
  isEditing,
  loadingScript,
  onContentChange
}) => {
  if (loadingScript) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)] mb-4"></div>
          <p className="text-[var(--text-muted)]">加载剧本中...</p>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-[var(--bg-input)] rounded-full flex items-center justify-center border border-[var(--border-color)]">
            <Sparkles className="w-12 h-12 text-[var(--text-muted)]" />
          </div>
          <p className="text-[var(--text-secondary)] text-lg font-semibold">开始创作你的视频剧本</p>
          <p className="text-[var(--text-muted)] text-sm font-medium">输入创意 → 生成剧本 → 选择模型 → 生成视频</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <Card className="pro-card flex-1 flex flex-col overflow-hidden">
        <CardBody className="p-6 flex-1 flex flex-col overflow-hidden">
          {isEditing ? (
            <textarea
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              className="flex-1 min-h-0 w-full bg-[var(--bg-input)] text-[var(--text-primary)] font-medium leading-relaxed text-base border border-[var(--border-color)] rounded-lg p-4 resize-none overflow-auto outline-none focus:border-[var(--accent)]/70 transition-colors font-mono"
            />
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 script-content">
              {renderScriptContent(content)}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default ScriptPreview;
