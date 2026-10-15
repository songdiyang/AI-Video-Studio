/**
 * 通用 Markdown 渲染组件
 * ────────────────────────────────────────────────────────────
 * 从 Extensions 页抽出，支持标题/粗体/斜体/分隔线/列表/表格/代码块。
 * 样式通过全局注入的 <style>（仅首次挂载时注入）提供，class 名以 md- 前缀。
 */
import React, { useMemo, useEffect } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const STYLE_ID = 'md-renderer-global-style';
const MD_CSS = `
  .md-h1 { font-size: 1.5rem; font-weight: 700; margin: 1.4rem 0 0.8rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
  .md-h2 { font-size: 1.2rem; font-weight: 700; margin: 1.2rem 0 0.6rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.3rem; }
  .md-h3 { font-size: 1.02rem; font-weight: 600; margin: 1rem 0 0.5rem; color: var(--text-primary); }
  .md-h4 { font-size: 0.92rem; font-weight: 600; margin: 0.8rem 0 0.4rem; color: var(--text-primary); }
  .md-p { font-size: 0.875rem; line-height: 1.75; margin: 0.35rem 0; color: var(--text-secondary, var(--text-primary)); }
  .md-hr { border: none; border-top: 1px dashed var(--border-color); margin: 1.2rem 0; }
  .md-ul, .md-ol { padding-left: 1.4rem; margin: 0.4rem 0; }
  .md-li, .md-li-ordered { font-size: 0.875rem; line-height: 1.75; color: var(--text-secondary, var(--text-primary)); margin: 0.1rem 0; }
  .md-li::marker { color: var(--accent, #3b82f6); }
  .md-code-block { background: var(--bg-input, rgba(0,0,0,0.28)); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.8rem; overflow-x: auto; margin: 0.6rem 0; }
  .md-code-block code { font-size: 0.78rem; line-height: 1.6; color: var(--text-primary); font-family: 'Fira Code', 'JetBrains Mono', monospace; }
  .md-inline-code { background: rgba(59,130,246,0.12); color: rgb(96,165,250); padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-size: 0.78rem; font-family: 'Fira Code', monospace; }
  .md-table { width: 100%; border-collapse: collapse; margin: 0.6rem 0; font-size: 0.78rem; }
  .md-td { padding: 0.45rem 0.7rem; border: 1px solid var(--border-color); color: var(--text-secondary, var(--text-primary)); }
  .md-table tr:first-child .md-td { font-weight: 600; background: var(--bg-input, rgba(0,0,0,0.08)); color: var(--text-primary); }
  .md-blockquote { border-left: 3px solid var(--accent, #3b82f6); padding: 0.2rem 0.8rem; margin: 0.6rem 0; background: rgba(59,130,246,0.06); color: var(--text-secondary, var(--text-primary)); font-size: 0.875rem; line-height: 1.75; border-radius: 0 0.3rem 0.3rem 0; }
  .markdown-body strong { color: var(--text-primary); font-weight: 600; }
  .markdown-body em { color: var(--text-secondary, var(--text-primary)); font-style: italic; }
`;

function ensureStyleInjected() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = MD_CSS;
  document.head.appendChild(el);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = md
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="md-code-block"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`)
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // 标题
    .replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    // 粗体 / 斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 分隔线
    .replace(/^---+$/gm, '<hr class="md-hr"/>')
    // 引用
    .replace(/^> (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>')
    // 表格行
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split('|').filter((c) => c.trim() !== '');
      if (cells.every((c) => /^[\s\-:]+$/.test(c))) {
        return '<!--table-sep-->';
      }
      const cellHtml = cells.map((c) => `<td class="md-td">${c.trim()}</td>`).join('');
      return `<tr>${cellHtml}</tr>`;
    })
    // 无序列表
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li-ordered">$1</li>');

  // 合并表格
  html = html.replace(/((?:<tr>.*<\/tr>\s*(?:<!--table-sep-->\s*)?)+)/g, (block) => {
    const cleaned = block.replace(/<!--table-sep-->/g, '');
    return `<table class="md-table">${cleaned}</table>`;
  });

  // 合并连续 li
  html = html.replace(/((?:<li class="md-li">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>');
  html = html.replace(/((?:<li class="md-li-ordered">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>');

  // 段落包裹（跳过已有块标签行 / 空行）
  html = html.replace(/^(?!<[a-z/!])((?!^\s*$).+)$/gm, '<p class="md-p">$1</p>');

  return html;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  useEffect(() => {
    ensureStyleInjected();
  }, []);
  const html = useMemo(() => renderMarkdown(content || ''), [content]);
  return (
    <div
      className={`markdown-body ${className || ''}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default MarkdownRenderer;
