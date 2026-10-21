/**
 * ScriptPreviewRenderer - 剧本专用预览渲染组件
 * 按剧本结构（场景标题 → 场景描述 → 角色对白 → 动作指示）结构化渲染
 */
import React from 'react';

interface ScriptPreviewRendererProps {
  content: string;
  className?: string;
}

/** 剧本行类型 */
type ScriptLine =
  | { kind: 'scene'; title: string }
  | { kind: 'divider' }
  | { kind: 'sceneDesc'; text: string }
  | { kind: 'dialogue'; character: string; modifier?: string; content: string }
  | { kind: 'action'; text: string }
  | { kind: 'stage'; text: string }
  | { kind: 'text'; text: string };

/** 场景内容行（排除 scene） */
type SceneLine = Exclude<ScriptLine, { kind: 'scene' }>;

/** 解析剧本内容为结构化行 */
function parseScript(content: string): ScriptLine[] {
  const lines = content.split('\n');
  const out: ScriptLine[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // 场景标题：## xxx / ### xxx
    if (/^#{2,}\s+/.test(line)) {
      out.push({ kind: 'scene', title: line.replace(/^#+\s+/, '') });
      continue;
    }

    // 分割线：--- 或 ***
    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      out.push({ kind: 'divider' });
      continue;
    }

    // 场景描述：*整段斜体*
    if (/^\*[^*]+\*$/.test(line)) {
      out.push({ kind: 'sceneDesc', text: line.slice(1, -1).trim() });
      continue;
    }

    // 对白：**角色（修饰）**：“内容”
    const dialogMatch = line.match(
      /^\*\*([^*(\uFF08]+?)(?:[(\uFF08]([^)\uFF09]+)[)\uFF09])?\*\*\s*[\uFF1A:]\s*["\u201C\u2018\u300C]?(.+?)["\u201D\u2019\u300D]?$/
    );
    if (dialogMatch) {
      out.push({
        kind: 'dialogue',
        character: dialogMatch[1].trim(),
        modifier: dialogMatch[2]?.trim() || undefined,
        content: dialogMatch[3].trim(),
      });
      continue;
    }

    // 动作指示：（...） 或 (...)
    if (/^[\(\uFF08].+[\)\uFF09]$/.test(line)) {
      out.push({ kind: 'stage', text: line.slice(1, -1).trim() });
      continue;
    }

    out.push({ kind: 'text', text: line });
  }

  return out;
}

/** 渲染行内加粗 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={i} className="font-semibold text-[var(--text-primary)]">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

const ScriptPreviewRenderer: React.FC<ScriptPreviewRendererProps> = ({
  content,
  className,
}) => {
  const lines = React.useMemo(() => parseScript(content || ''), [content]);

  if (!lines.length) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)] text-sm">
        暂无剧本内容
      </div>
    );
  }

  // 将行按场景分组
  const scenes: { title: string; lines: SceneLine[] }[] = [];
  let currentScene: { title: string; lines: SceneLine[] } | null = null;

  for (const line of lines) {
    if (line.kind === 'scene') {
      currentScene = { title: line.title, lines: [] };
      scenes.push(currentScene);
    } else if (currentScene) {
      currentScene.lines.push(line as SceneLine);
    } else {
      // 场景标题前的内容，放入一个默认场景
      currentScene = { title: '', lines: [line as SceneLine] };
      scenes.push(currentScene);
    }
  }

  return (
    <div className={`space-y-6 ${className || ''}`.trim()}>
      {scenes.map((scene, sceneIdx) => (
        <div key={sceneIdx} className="space-y-3">
          {/* 场景标题 */}
          {scene.title && (
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <div className="w-6 h-6 rounded bg-cyan-500/10 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-cyan-400">
                  {sceneIdx + 1}
                </span>
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {scene.title}
              </h3>
            </div>
          )}

          {/* 场景内容 */}
          <div className="space-y-2 pl-2">
            {scene.lines.map((line, lineIdx) => {
              if (line.kind === 'sceneDesc') {
                return (
                  <p
                    key={lineIdx}
                    className="text-sm italic text-[var(--text-secondary)] leading-relaxed pl-3 border-l-2 border-[var(--border-color)]"
                  >
                    {renderInline(line.text)}
                  </p>
                );
              }
              if (line.kind === 'dialogue') {
                return (
                  <div key={lineIdx} className="py-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-[var(--success)] whitespace-nowrap shrink-0 min-w-[4rem]">
                        {line.character}
                      </span>
                      {line.modifier && (
                        <span className="text-xs text-[var(--text-muted)] italic">
                          ({line.modifier})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed pl-[4.5rem]">
                      「{line.content}」
                    </p>
                  </div>
                );
              }
              if (line.kind === 'stage') {
                return (
                  <p
                    key={lineIdx}
                    className="text-xs text-[var(--warning)] italic my-1 pl-6"
                  >
                    （{line.text}）
                  </p>
                );
              }
              if (line.kind === 'action') {
                return (
                  <p
                    key={lineIdx}
                    className="text-sm italic text-amber-300/85 leading-relaxed"
                  >
                    {renderInline(line.text)}
                  </p>
                );
              }
              if (line.kind === 'divider') {
                return (
                  <div
                    key={lineIdx}
                    className="my-2 border-t border-dashed border-[var(--border-color)]/60"
                  />
                );
              }
              // text
              return (
                <p
                  key={lineIdx}
                  className="text-sm text-[var(--text-secondary)] leading-relaxed"
                >
                  {renderInline(line.text)}
                </p>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ScriptPreviewRenderer;
