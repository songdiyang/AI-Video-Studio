import React, { useMemo } from 'react';

/**
 * 简易 Markdown 渲染组件
 * 支持：加粗、斜体、行内代码、标题、列表、链接、分隔线、代码块
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);
  // 加粗+斜体 ***text***
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // 加粗 **text**
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 斜体 *text*
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // 行内代码 `code`
  result = result.replace(/`([^`]+)`/g, '<code class="bg-slate-700/60 px-1 py-0.5 rounded text-xs text-amber-300">$1</code>');
  // 链接 [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-400 underline">$1</a>');
  return result;
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        htmlParts.push(`<pre class="bg-slate-900/80 rounded p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(codeContent.join('\n'))}</code></pre>`);
        codeContent = [];
        inCodeBlock = false;
      } else {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push('<hr class="border-slate-700/50 my-2" />');
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      const level = headingMatch[1].length;
      const sizes = ['text-lg font-bold', 'text-base font-bold', 'text-sm font-semibold', 'text-sm font-medium', 'text-xs font-medium', 'text-xs'];
      htmlParts.push(`<p class="${sizes[level - 1]} text-slate-100 mt-2 mb-1">${renderInline(headingMatch[2])}</p>`);
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^(\s*[-*+])\s+(.+)/);
    if (ulMatch) {
      if (!inList) { htmlParts.push('<ul class="list-disc list-inside space-y-0.5 ml-1">'); inList = true; }
      htmlParts.push(`<li class="text-sm text-slate-200">${renderInline(ulMatch[2])}</li>`);
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^(\s*\d+)\.\s+(.+)/);
    if (olMatch) {
      if (!inList) { htmlParts.push('<ul class="list-decimal list-inside space-y-0.5 ml-1">'); inList = true; }
      htmlParts.push(`<li class="text-sm text-slate-200">${renderInline(olMatch[2])}</li>`);
      continue;
    }

    // 普通段落
    if (inList) { htmlParts.push('</ul>'); inList = false; }
    htmlParts.push(`<p class="text-sm text-slate-200 mb-1">${renderInline(line)}</p>`);
  }

  if (inList) htmlParts.push('</ul>');
  if (inCodeBlock) {
    htmlParts.push(`<pre class="bg-slate-900/80 rounded p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(codeContent.join('\n'))}</code></pre>`);
  }

  return htmlParts.join('\n');
}

interface SimpleMarkdownProps {
  content: string;
  className?: string;
}

const SimpleMarkdown: React.FC<SimpleMarkdownProps> = ({ content, className = '' }) => {
  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className={`simple-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default SimpleMarkdown;
