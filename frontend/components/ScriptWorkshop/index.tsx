/** 剧本工作坊：已有剧本的内容编辑器（AI 生成与上传入口已移至左侧大纲面板与智能体）。 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { updateScript } from '../../services/scripts';
import { useToast } from '../../contexts/ToastContext';
import ScriptPreviewRenderer from '../ScriptPreviewRenderer';
import type { EmbeddedEditorProps, EditorSessionHandle, EditorSaveStatus } from '../ContentEditorPanel';
import WritingSurface from './WritingSurface';
import './writing.css';

export interface ScriptWorkshopPayload {
  scriptId: number;
  content: string;
  title: string;
  projectId: number;
  episodeNumber: number;
}

export interface ScriptWorkshopProps extends EmbeddedEditorProps {
  /** 剧本归属项目/集数（仅用于成功回调载荷） */
  lockProjectId?: number;
  lockEpisodeNumber?: number;
  initialScriptId?: number;
  initialTitle?: string;
  initialContent?: string;
  onSuccess?: (payload?: ScriptWorkshopPayload) => void;
  onError?: (msg: string) => void;
  onClose: () => void;
}

const serialize = (value: unknown) => JSON.stringify(value);

/** 输入事件同步更新 ref；同一事件循环内的 flush 也能读到最后一个字符。 */
function useDraft<T>(initial: () => T) {
  const [value, setValue] = useState(initial);
  const ref = useRef(value);
  const replace = useCallback((next: T) => { ref.current = next; setValue(next); }, []);
  return [value, ref, replace] as const;
}

function assertSaved(result: unknown) {
  if (result === false || (result && typeof result === 'object' && 'success' in result && result.success === false)) {
    throw new Error('保存失败，请重试');
  }
}

const WorkshopSession: React.FC<ScriptWorkshopProps> = ({
  lockProjectId, lockEpisodeNumber,
  initialScriptId, initialTitle = '', initialContent = '', onSuccess, onError,
  onRegisterEditor,
}) => {
  const { showToast } = useToast();
  const mounted = useRef(true);
  const callbacks = useRef({ onSuccess, onError, showToast });
  callbacks.current = { onSuccess, onError, showToast };
  const [showPreview, setShowPreview] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [status, setStatus] = useState<EditorSaveStatus>(initialScriptId ? 'saved' : 'idle');
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [script, scriptRef, replaceScript] = useDraft<ScriptWorkshopPayload | null>(() => initialScriptId ? {
    scriptId: initialScriptId, title: initialTitle, content: initialContent,
    projectId: lockProjectId ?? 0, episodeNumber: lockEpisodeNumber ?? 1,
  } : null);
  const savedScript = useRef(serialize(script));
  const incomingScript = useRef(serialize({ initialTitle, initialContent }));

  const report = useCallback((error: unknown) => {
    if (!mounted.current) return;
    const text = error instanceof Error ? error.message : String(error);
    callbacks.current.showToast(text, 'error');
    callbacks.current.onError?.(text);
  }, []);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // 串行排空保存：等待中的编辑继续入队，失败不更新基线，不清空草稿。
  const saveScript = useCallback((): Promise<boolean> => {
    clearTimer();
    if (saving.current) return saving.current;
    if (serialize(scriptRef.current) === savedScript.current) return Promise.resolve(true);
    saving.current = Promise.resolve().then(async () => {
      while (scriptRef.current && serialize(scriptRef.current) !== savedScript.current) {
        const snapshot = { ...scriptRef.current };
        if (mounted.current) setStatus('saving');
        try {
          const result = await updateScript(snapshot.scriptId, snapshot.title, snapshot.content);
          assertSaved(result);
        } catch (error) {
          if (mounted.current) { setStatus('error'); report(error); }
          return false;
        }
        savedScript.current = serialize(snapshot);
        // 只通知最终保存版本；父级回填不能覆盖保存期间产生的新输入。
        if (mounted.current && serialize(scriptRef.current) === savedScript.current) {
          setStatus('saved');
          callbacks.current.onSuccess?.(snapshot);
        }
      }
      return true;
    }).finally(() => { saving.current = null; });
    return saving.current;
  }, [report, scriptRef]);

  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  flushRef.current = saveScript;
  // 只注册稳定句柄；输入与 Portal 宿主变化均不重复注销/注册。
  const handle = useRef<EditorSessionHandle>({ flush: () => flushRef.current() });
  useEffect(() => {
    onRegisterEditor?.(handle.current);
    return () => onRegisterEditor?.(null);
  }, [onRegisterEditor]);

  const cleanupRef = useRef(saveScript);
  cleanupRef.current = saveScript;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      // 宿主应在卸载前 await flush；非正常卸载仍尽力保存最新 ref，绝不使用初始闭包。
      void cleanupRef.current();
    };
  }, []);

  useEffect(() => {
    if (serialize(script) === savedScript.current) return;
    timer.current = setTimeout(() => { void saveScript(); }, 2000);
    return clearTimer;
  }, [script, saveScript]);

  // 支持初始数据异步到达；脏稿/在途请求不得被父级旧数据回填覆盖。
  useEffect(() => {
    const incoming = serialize({ initialTitle, initialContent });
    if (incoming === incomingScript.current) return;
    incomingScript.current = incoming;
    const current = scriptRef.current;
    if (!current || current.scriptId !== initialScriptId || saving.current || serialize(current) !== savedScript.current) return;
    const next = { ...current, title: initialTitle, content: initialContent };
    savedScript.current = serialize(next);
    replaceScript(next);
    if (mounted.current) setStatus('saved');
  }, [initialTitle, initialContent, initialScriptId, replaceScript, scriptRef]);

  const editScript = (patch: Partial<Pick<ScriptWorkshopPayload, 'title' | 'content'>>) => {
    if (!scriptRef.current) return;
    replaceScript({ ...scriptRef.current, ...patch });
    setStatus(serialize(scriptRef.current) === savedScript.current && !saving.current ? 'saved' : 'dirty');
  };

  const previewContent = script?.content || '';
  const preview = previewContent
    ? <ScriptPreviewRenderer content={previewContent} />
    : <p className="text-sm text-[var(--text-muted)]">暂无剧本内容</p>;

  // 尚未选剧：保留引导空态（不渲染写作画布）。
  if (!script) {
    return <div className="flex flex-col h-full min-h-0 min-w-0">
      <div className="sw-scroll flex-1">
        <p className="sw-column text-sm text-[var(--text-muted)]">尚未选择剧本。请在左侧「大纲」上传剧本，或点击剧本卡片打开编辑。</p>
      </div>
    </div>;
  }

  // 沉浸式写作面：标题内联 + 正文大画布，停止输入 2 秒自动保存；预览/专注收在顶栏。
  return <div className="flex flex-col h-full min-h-0 min-w-0">
    <WritingSurface
      title={script.title}
      content={script.content}
      status={status}
      showPreview={showPreview}
      focusMode={focusMode}
      preview={preview}
      onTitleChange={value => editScript({ title: value })}
      onContentChange={value => editScript({ content: value })}
      onTogglePreview={() => setShowPreview(value => !value)}
      onToggleFocus={() => setFocusMode(value => !value)}
      onSave={() => { void flushRef.current(); }}
    />
  </div>;
};

/** 对象变化建立新边界；宿主必须先 await 已注册句柄的 flush，再改变对象或卸载。 */
const ScriptWorkshop: React.FC<ScriptWorkshopProps> = props => (
  <WorkshopSession key={`${props.lockProjectId ?? 'personal'}:${props.lockEpisodeNumber ?? 'unset'}:${props.initialScriptId ?? 'new'}`} {...props} />
);

export default ScriptWorkshop;
