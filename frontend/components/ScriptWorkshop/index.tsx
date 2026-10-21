/** 剧本工作坊：一份草稿/保存逻辑，独立布局或上方预览 + 底部 Portal。 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Progress } from '@heroui/react';
import { Sparkles, Upload, FileText, Pencil, Wand2, Eye, EyeOff, X } from 'lucide-react';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import type { Project } from '../../services/projects';
import { uploadScriptFile, updateScript } from '../../services/scripts';
import { useToast } from '../../contexts/ToastContext';
import { filterModelsForTaskSlot } from '../../utils/modelCapabilities';
import ScriptPreviewRenderer from '../ScriptPreviewRenderer';
import ContentEditorPanel, { type EmbeddedEditorProps, type EditorSessionHandle, type EditorSaveStatus } from '../ContentEditorPanel';

interface AIModel {
  name: string;
  displayName?: string;
  type?: string;
  category?: string;
}

export interface ScriptWorkshopPayload {
  scriptId: number;
  content: string;
  title: string;
  projectId: number;
  episodeNumber: number;
}

export interface ScriptWorkshopProps extends EmbeddedEditorProps {
  projects: Project[];
  aiModels: AIModel[];
  defaultTextModel?: string;
  lockProjectId?: number;
  lockEpisodeNumber?: number;
  initialScriptId?: number;
  initialTitle?: string;
  initialContent?: string;
  onSuccess?: (payload?: ScriptWorkshopPayload) => void;
  onError?: (msg: string) => void;
  onClose: () => void;
}

type WorkshopMode = 'generate' | 'upload' | 'edit';
type GenerationDraft = { projectId: string; episodeInput: string; title: string; description: string; length: string; textModel: string };
type UploadDraft = { inputMode: 'file' | 'text'; textContent: string; fileContent: string; fileName: string };
type Generation = { scriptId: number; jobId: string; projectId: number; episodeNumber: number; completed: boolean };
const emptyUpload: UploadDraft = { inputMode: 'file', textContent: '', fileContent: '', fileName: '' };
const serialize = (value: unknown) => JSON.stringify(value);
const draftKey = (kind: string, project: string, episode: string) =>
  `script-workshop:${kind}:v1:project:${encodeURIComponent(project || 'unassigned')}:episode:${encodeURIComponent(episode || 'unassigned')}`;

// 只恢复白名单字符串字段，绝不从存储中合并凭据或任意对象属性。
function restoreDraft<T extends object>(key: string, defaults: T): T {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (!stored || typeof stored !== 'object') return defaults;
    return Object.fromEntries(Object.entries(defaults).map(([name, value]) =>
      [name, typeof stored[name] === 'string' ? stored[name] : value])) as T;
  } catch {
    return defaults;
  }
}

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
  projects, aiModels, defaultTextModel, lockProjectId, lockEpisodeNumber,
  initialScriptId, initialTitle = '', initialContent = '', onSuccess, onError, onClose,
  editorPortalTarget, onRegisterEditor,
}) => {
  const { showToast } = useToast();
  const embedded = editorPortalTarget !== undefined;
  const mounted = useRef(true);
  const callbacks = useRef({ onSuccess, onError, onClose, showToast });
  callbacks.current = { onSuccess, onError, onClose, showToast };
  const textModels = useMemo(() => filterModelsForTaskSlot(aiModels, 'TEXT'), [aiModels]);
  const [mode, setMode] = useState<WorkshopMode>(initialScriptId ? 'edit' : 'generate');
  const [showPreview, setShowPreview] = useState(false);
  const [statuses, setStatuses] = useState<Record<WorkshopMode, EditorSaveStatus>>({ edit: 'saved', generate: 'idle', upload: 'idle' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'generate' | 'upload' | null>(null);
  const busyRef = useRef<typeof busy>(null);
  const switching = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const generation = useRef<Generation | null>(null);
  const finalizing = useRef<Promise<boolean> | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileReader = useRef<FileReader | null>(null);
  const reading = useRef(false);
  const [isReading, setIsReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [script, scriptRef, replaceScript] = useDraft<ScriptWorkshopPayload | null>(() => initialScriptId ? {
    scriptId: initialScriptId, title: initialTitle, content: initialContent,
    projectId: lockProjectId ?? 0, episodeNumber: lockEpisodeNumber ?? 1,
  } : null);
  const savedScript = useRef(serialize(script));
  const incomingScript = useRef(serialize({ initialTitle, initialContent }));
  const [requirements, requirementsRef, replaceRequirements] = useDraft<GenerationDraft>(() => {
    const projectId = String(lockProjectId ?? projects[0]?.id ?? '');
    const episodeInput = String(lockEpisodeNumber ?? '');
    const restored = restoreDraft(draftKey('generate', projectId, episodeInput), {
      projectId, episodeInput, title: '', description: '', length: '短篇', textModel: defaultTextModel || textModels[0]?.name || '',
    });
    return { ...restored, projectId, episodeInput };
  });
  const uploadKey = draftKey('upload', String(lockProjectId ?? ''), String(lockEpisodeNumber ?? ''));
  const [upload, uploadRef, replaceUpload] = useDraft<UploadDraft>(() => {
    const restored = restoreDraft(uploadKey, emptyUpload);
    return { ...restored, inputMode: restored.inputMode === 'text' ? 'text' : 'file' };
  });
  const savedRequirements = useRef(serialize(requirements));
  const savedUpload = useRef(serialize(upload));

  const status = useCallback((target: WorkshopMode, next: EditorSaveStatus) => {
    if (mounted.current) setStatuses(prev => ({ ...prev, [target]: next }));
  }, []);
  const report = useCallback((error: unknown) => {
    if (!mounted.current) return;
    const text = error instanceof Error ? error.message : String(error);
    setMessage(text);
    callbacks.current.showToast(text, 'error');
    callbacks.current.onError?.(text);
  }, []);
  const setOperation = (next: typeof busy) => {
    busyRef.current = next;
    if (mounted.current) setBusy(next);
  };
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
        status('edit', 'saving');
        try {
          const result = await updateScript(snapshot.scriptId, snapshot.title, snapshot.content);
          assertSaved(result);
        } catch (error) {
          status('edit', 'error');
          report(error);
          return false;
        }
        savedScript.current = serialize(snapshot);
        // 只通知最终保存版本；父级回填不能覆盖保存期间产生的新输入。
        if (mounted.current && serialize(scriptRef.current) === savedScript.current) {
          status('edit', 'saved');
          setMessage('');
          callbacks.current.onSuccess?.(snapshot);
        }
      }
      return true;
    }).finally(() => { saving.current = null; });
    return saving.current;
  }, [report, scriptRef, status]);

  const persistDrafts = useCallback((skipUpload = false): boolean => {
    let ok = true;
    const persist = (target: 'generate' | 'upload', key: string, value: unknown, baseline: React.MutableRefObject<string>) => {
      const json = serialize(value);
      if (json === baseline.current) return;
      status(target, 'saving');
      try {
        localStorage.setItem(key, json);
        baseline.current = json;
        status(target, 'saved');
      } catch {
        ok = false;
        status(target, 'error');
        report('本地草稿保存失败，请检查浏览器存储空间后重试；当前输入仍保留');
      }
    };
    const draft = requirementsRef.current;
    persist('generate', draftKey('generate', draft.projectId, draft.episodeInput), draft, savedRequirements);
    if (!skipUpload) persist('upload', uploadKey, uploadRef.current, savedUpload);
    return ok;
  }, [report, requirementsRef, status, uploadKey, uploadRef]);

  const flushDrafts = useCallback(async () => {
    const localOk = persistDrafts();
    const scriptOk = await saveScript();
    return localOk && scriptOk;
  }, [persistDrafts, saveScript]);

  const acceptScript = (payload: ScriptWorkshopPayload, label: string) => {
    if (!mounted.current) return;
    replaceScript(payload);
    savedScript.current = serialize(payload);
    status('edit', 'saved');
    setMessage('');
    setMode('edit');
    callbacks.current.showToast(`${label}，已切换到编辑模式`, 'success');
    callbacks.current.onSuccess?.(payload);
  };

  // 完成工作流后仅重试落库，不重新调用生成接口（避免重复付费）。
  const finishGeneration = (): Promise<boolean> => {
    if (finalizing.current) return finalizing.current;
    const target = generation.current;
    if (!target?.completed) return Promise.resolve(false);
    setOperation('generate');
    status('generate', 'saving');
    finalizing.current = Promise.resolve().then(async () => {
      try {
        const res = await fetch('/api/scripts/save-from-workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: target.scriptId, jobId: target.jobId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || '保存生成剧本失败');
        assertSaved(data);
        if (!mounted.current || generation.current !== target) return false;
        generation.current = null;
        setJobId(null);
        setOperation(null);
        status('generate', 'saved');
        // 参数归属始终使用启动时的快照，不读取后来选择的项目/集数。
        acceptScript({ scriptId: target.scriptId, title: data.title || '', content: data.content || '',
          projectId: target.projectId, episodeNumber: target.episodeNumber }, '剧本生成成功');
        void consumeWorkflow(target.jobId).catch(error => console.warn('[ScriptWorkshop] 工作流消费失败', error));
        return true;
      } catch (error) {
        if (mounted.current && generation.current === target) {
          status('generate', 'error');
          report(error);
        }
        return false;
      } finally {
        if (generation.current === target) setOperation(null);
      }
    }).finally(() => { finalizing.current = null; });
    return finalizing.current;
  };

  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  flushRef.current = async () => {
    if (reading.current) { report('文件读取中，请稍候再切换'); return false; }
    if (generation.current?.completed) {
      if (!await finishGeneration()) return false;
    } else if (busyRef.current) {
      report('剧本生成或上传中，请完成后再切换');
      return false;
    }
    return flushDrafts();
  };
  // 只注册稳定句柄；输入、模式和 Portal 宿主变化均不重复注销/注册。
  const handle = useRef<EditorSessionHandle>({ flush: () => flushRef.current() });
  useEffect(() => {
    onRegisterEditor?.(handle.current);
    return () => onRegisterEditor?.(null);
  }, [onRegisterEditor]);

  const cleanupRef = useRef(flushDrafts);
  cleanupRef.current = flushDrafts;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      fileReader.current?.abort();
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
    if (!current || current.scriptId !== initialScriptId || saving.current || busyRef.current || serialize(current) !== savedScript.current) return;
    const next = { ...current, title: initialTitle, content: initialContent };
    savedScript.current = serialize(next);
    replaceScript(next);
    status('edit', 'saved');
  }, [initialTitle, initialContent, initialScriptId, replaceScript, scriptRef, status]);

  useEffect(() => {
    const current = requirementsRef.current;
    if (!current.textModel && (defaultTextModel || textModels.length)) {
      replaceRequirements({ ...current, textModel: defaultTextModel || textModels[0].name });
      status('generate', 'dirty');
    }
  }, [defaultTextModel, textModels, replaceRequirements, requirementsRef, status]);

  const workflow = useWorkflow(jobId, {
    onCompleted: job => {
      const target = generation.current;
      if (!mounted.current || !target || target.jobId !== job.id) return;
      target.completed = true;
      void finishGeneration();
    },
    onFailed: job => {
      if (!mounted.current || generation.current?.jobId !== job.id) return;
      generation.current = null;
      setJobId(null);
      setOperation(null);
      report(job.error_message || '剧本生成失败，请重试');
    },
    onProgress: job => {
      if (job.status === 'cancelled' && mounted.current && generation.current?.jobId === job.id) {
        generation.current = null;
        setJobId(null);
        setOperation(null);
        report('剧本生成已取消');
      }
    },
  });

  const changeMode = async (next: WorkshopMode) => {
    if (switching.current || next === mode || (next === 'edit' && !scriptRef.current)) return;
    switching.current = true;
    setTransitioning(true);
    try {
      if (await flushRef.current() && mounted.current) { setMessage(''); setMode(next); }
    } finally {
      switching.current = false;
      if (mounted.current) setTransitioning(false);
    }
  };
  const close = async () => {
    if (switching.current) return;
    switching.current = true;
    try { if (await flushRef.current() && mounted.current) callbacks.current.onClose(); }
    finally { switching.current = false; }
  };
  const editScript = (patch: Partial<Pick<ScriptWorkshopPayload, 'title' | 'content'>>) => {
    if (!scriptRef.current) return;
    replaceScript({ ...scriptRef.current, ...patch });
    status('edit', serialize(scriptRef.current) === savedScript.current && !saving.current ? 'saved' : 'dirty');
  };
  const editRequirements = (patch: Partial<GenerationDraft>) => {
    replaceRequirements({ ...requirementsRef.current, ...patch });
    status('generate', serialize(requirementsRef.current) === savedRequirements.current ? 'saved' : 'dirty');
  };
  const editUpload = (patch: Partial<UploadDraft>) => {
    replaceUpload({ ...uploadRef.current, ...patch });
    status('upload', serialize(uploadRef.current) === savedUpload.current ? 'saved' : 'dirty');
  };
  const changeDestination = async (patch: Pick<Partial<GenerationDraft>, 'projectId' | 'episodeInput'>) => {
    if (switching.current || busyRef.current) return;
    switching.current = true;
    try {
      if (!await flushRef.current() || !mounted.current) return;
      const current = { ...requirementsRef.current, ...patch };
      const restored = restoreDraft(draftKey('generate', current.projectId, current.episodeInput), {
        ...current, title: '', description: '', length: '短篇',
      });
      const next = { ...restored, projectId: current.projectId, episodeInput: current.episodeInput };
      replaceRequirements(next);
      savedRequirements.current = serialize(next);
      status('generate', 'idle');
    } finally { switching.current = false; }
  };
  const destinationRef = useRef(changeDestination);
  destinationRef.current = changeDestination;
  useEffect(() => {
    if (lockProjectId === undefined && !requirementsRef.current.projectId && projects.length) {
      void destinationRef.current({ projectId: String(projects[0].id) });
    }
  }, [projects, lockProjectId, requirementsRef]);

  const generate = async () => {
    if (busyRef.current || switching.current) return;
    if (generation.current?.completed) { await finishGeneration(); return; }
    const draft = { ...requirementsRef.current };
    const projectId = Number(draft.projectId);
    const episodeNumber = Number(draft.episodeInput);
    if (!Number.isInteger(projectId) || projectId < 1) { report('请选择项目'); return; }
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) { report('请输入有效的整数集数'); return; }
    if (!draft.textModel || !textModels.some(m => m.name === draft.textModel)) { report('请选择可用的文本模型'); return; }
    setOperation('generate'); // 在第一次 await 前锁定，防止双击并发启动。
    setMessage('');
    try {
      if (!await flushDrafts() || !mounted.current) { setOperation(null); return; }
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, episodeNumber, title: draft.title.trim() || undefined,
          description: draft.description.trim() || undefined, length: draft.length, textModel: draft.textModel }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.message || '生成启动失败');
      if (!data?.scriptId || !data?.jobId) throw new Error('生成响应缺少剧本或工作流标识');
      if (!mounted.current) return;
      generation.current = { scriptId: data.scriptId, jobId: data.jobId, projectId, episodeNumber, completed: false };
      setJobId(data.jobId);
    } catch (error) { report(error); setOperation(null); }
  };

  const selectFile = (file: File) => {
    if (busyRef.current || switching.current) return;
    if (!/\.(txt|md)$/i.test(file.name)) { report('仅支持 .txt 和 .md 文件'); return; }
    if (file.size > 5 * 1024 * 1024) { report('文件不能超过 5MB'); return; }
    fileReader.current?.abort();
    const reader = new FileReader();
    fileReader.current = reader;
    reading.current = true;
    setIsReading(true);
    reader.onload = () => {
      if (!mounted.current || fileReader.current !== reader) return;
      editUpload({ fileName: file.name, fileContent: String(reader.result || '') });
      reading.current = false;
      setIsReading(false);
    };
    reader.onerror = () => {
      if (!mounted.current || fileReader.current !== reader) return;
      reading.current = false;
      setIsReading(false);
      report('文件读取失败，请重新选择');
    };
    reader.readAsText(file);
  };

  const saveUpload = async () => {
    if (busyRef.current || switching.current || reading.current) return;
    const draft = { ...uploadRef.current };
    if (draft.inputMode === 'file' ? !draft.fileName : !draft.textContent.trim()) {
      report(draft.inputMode === 'file' ? '请先选择文件' : '请输入剧本内容'); return;
    }
    setOperation('upload');
    setMessage('');
    try {
      // 上传本身就是持久化，不让本地存储配额阻断合法的 5MB 文件上传。
      const localOk = persistDrafts(true);
      if (!await saveScript() || !localOk || !mounted.current) return;
      status('upload', 'saving');
      const result = await uploadScriptFile({
        file: draft.inputMode === 'file' ? new File([draft.fileContent], draft.fileName, { type: 'text/plain' }) : undefined,
        content: draft.inputMode === 'text' ? draft.textContent : undefined,
        projectId: lockProjectId, episodeNumber: lockEpisodeNumber,
        title: draft.inputMode === 'file' ? draft.fileName.replace(/\.[^.]+$/, '') : undefined, mode: 'save',
      });
      assertSaved(result);
      if (!result?.scriptId) throw new Error('上传响应缺少剧本标识');
      if (!mounted.current) return;
      // 成功落库才清理上传草稿；失败仍可原样重试。
      replaceUpload({ ...emptyUpload });
      savedUpload.current = serialize(emptyUpload);
      try { localStorage.removeItem(uploadKey); } catch { /* 已落库，不因清理本地缓存失败误报上传失败。 */ }
      status('upload', 'saved');
      acceptScript({ scriptId: result.scriptId, title: result.title, content: result.content,
        projectId: result.projectId ?? lockProjectId ?? 0, episodeNumber: result.episodeNumber }, '剧本上传成功');
    } catch (error) { status('upload', 'error'); report(error); }
    finally { setOperation(null); }
  };

  const tabs = [
    { id: 'generate', label: 'AI生成', icon: <Sparkles size={14} /> },
    { id: 'upload', label: '上传剧本', icon: <Upload size={14} /> },
    ...(script ? [{ id: 'edit', label: '内容', icon: <Pencil size={14} /> }] : []),
  ];
  const disabled = !!busy || transitioning;
  const previewContent = mode === 'upload' ? (upload.inputMode === 'text' ? upload.textContent : upload.fileContent) : script?.content || '';
  const panelTitle = mode === 'edit' ? script?.title : mode === 'generate' ? requirements.title : upload.fileName;
  const preview = (
    <div className="max-w-4xl mx-auto space-y-3">
      <h2 className="text-sm font-medium text-[var(--text-primary)]">{mode === 'upload' ? '上传内容预览' : script?.title || '剧本预览'}</h2>
      {previewContent ? <ScriptPreviewRenderer content={previewContent} /> : (
        <p className="text-sm text-[var(--text-muted)]">{mode === 'generate' ? '在编辑区填写生成要求，生成完成后在此预览正文。' : '暂无剧本内容'}</p>
      )}
    </div>
  );
  const actions = (
    <>
      {mode === 'generate' && <>
        <label className="content-editor-field" style={{ width: 200, maxWidth: '100%' }}>
          <span>文本模型</span>
          <select aria-label="文本模型" value={requirements.textModel} disabled={disabled || !!generation.current}
            onChange={e => editRequirements({ textModel: e.target.value })}>
            <option value="">选择文本模型</option>
            {textModels.map(model => <option key={model.name} value={model.name}>{model.displayName || model.name}</option>)}
          </select>
        </label>
        <Button size="sm" color="primary" isLoading={busy === 'generate'} isDisabled={disabled}
          startContent={<Sparkles size={14} />} onPress={generate}>
          {generation.current?.completed ? '重试保存生成结果' : busy === 'generate' ? '生成中…' : '开始生成'}
        </Button>
      </>}
      {mode === 'upload' && <Button size="sm" color="primary" isLoading={busy === 'upload'}
        isDisabled={disabled || isReading} startContent={<Upload size={14} />} onPress={saveUpload}>保存剧本</Button>}
      {mode === 'edit' && <>
        {!embedded && <Button size="sm" variant="flat" startContent={showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          onPress={() => setShowPreview(value => !value)}>{showPreview ? '隐藏预览' : '预览'}</Button>}
        <Button size="sm" variant="flat" isDisabled={disabled} startContent={<Wand2 size={14} />}
          onPress={() => { void changeMode('generate'); }}>重新生成</Button>
      </>}
      {!embedded && <Button size="sm" variant="light" isDisabled={disabled} aria-label="关闭剧本工作坊"
        startContent={<X size={14} />} onPress={close}>关闭</Button>}
    </>
  );
  const editor = (
    <ContentEditorPanel title={panelTitle || '未命名剧本'} kind="剧本" tabs={tabs} activeTab={mode}
      onTabChange={next => { void changeMode(next as WorkshopMode); }} status={statuses[mode]}
      onSave={async () => { if (await flushRef.current()) setMessage(''); }} actions={actions}>
      <div className={embedded ? 'space-y-3' : 'max-w-4xl mx-auto space-y-4'}>
        {message && <p role="alert" className="text-xs text-red-500">{message}</p>}
        <fieldset disabled={disabled || (mode === 'generate' && !!generation.current)} className="min-w-0 border-0 p-0 m-0">
          {mode === 'generate' && <div className="content-editor-fields">
            {lockProjectId === undefined && <label className="content-editor-field"><span>目标项目</span>
              <select value={requirements.projectId} onChange={e => { void changeDestination({ projectId: e.target.value }); }}>
                <option value="">选择项目</option>
                {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>}
            {lockEpisodeNumber === undefined && <label className="content-editor-field"><span>集数</span>
              <input type="number" min={1} step={1} value={requirements.episodeInput}
                onChange={e => { void changeDestination({ episodeInput: e.target.value }); }} />
            </label>}
            <label className="content-editor-field"><span>剧本标题（可选）</span>
              <input value={requirements.title} placeholder="输入剧本标题" onChange={e => editRequirements({ title: e.target.value })} />
            </label>
            <label className="content-editor-field"><span>剧本长度</span>
              <select value={requirements.length} onChange={e => editRequirements({ length: e.target.value })}>
                <option value="短篇">短篇（1~3分钟）</option><option value="中篇">中篇（3~5分钟）</option><option value="长篇">长篇（5~10分钟）</option>
              </select>
            </label>
            <label className="content-editor-field content-editor-full-width"><span>生成要求</span>
              <textarea rows={embedded ? 3 : 5} value={requirements.description} placeholder="描述想要生成的内容、风格、情节等…"
                onChange={e => editRequirements({ description: e.target.value })} />
            </label>
          </div>}
          {mode === 'edit' && script && <div className="content-editor-fields">
            <label className="content-editor-field content-editor-full-width"><span>剧本名称</span>
              <input value={script.title} placeholder="输入剧本名称" onChange={e => editScript({ title: e.target.value })} />
            </label>
            {!embedded && showPreview ? <div className="content-editor-full-width">{preview}</div> : (
              <label className="content-editor-field content-editor-full-width"><span>剧本内容</span>
                <textarea rows={embedded ? 5 : 20} value={script.content} placeholder="在此输入或编辑剧本内容…"
                  onChange={e => editScript({ content: e.target.value })} />
              </label>
            )}
          </div>}
          {mode === 'upload' && <div className="space-y-3">
            <div className="flex gap-2" role="group" aria-label="上传方式">
              <Button size="sm" variant="flat" aria-pressed={upload.inputMode === 'file'} startContent={<Upload size={14} />}
                onPress={async () => { if (await flushRef.current()) editUpload({ inputMode: 'file' }); }}>上传文件</Button>
              <Button size="sm" variant="flat" aria-pressed={upload.inputMode === 'text'} startContent={<FileText size={14} />}
                onPress={async () => { if (await flushRef.current()) editUpload({ inputMode: 'text' }); }}>直接输入</Button>
            </div>
            {upload.inputMode === 'file' ? <>
              <input ref={fileInput} type="file" accept=".txt,.md" aria-label="选择剧本文件" className="sr-only"
                onChange={e => { if (e.target.files?.[0]) selectFile(e.target.files[0]); e.target.value = ''; }} />
              <button type="button" className={`w-full border-2 border-dashed rounded-xl p-5 text-center ${dragOver ? 'border-[var(--accent)]' : 'border-[var(--border-color)]'}`}
                onClick={() => fileInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]); }}>
                <Upload size={24} className="mx-auto mb-2" />
                {isReading ? '读取中…' : upload.fileName || '点击或拖拽上传剧本文件'}
                <span className="block text-xs text-[var(--text-muted)] mt-1">支持 .txt、.md 格式，最大 5MB</span>
              </button>
            </> : <label className="content-editor-field"><span>上传剧本内容</span>
              <textarea rows={embedded ? 4 : 8} value={upload.textContent} placeholder="在此粘贴或输入剧本内容…"
                onChange={e => editUpload({ textContent: e.target.value })} />
            </label>}
            {!embedded && previewContent && <div className="max-h-48 overflow-auto">{preview}</div>}
          </div>}
        </fieldset>
        <p className="text-[11px] text-[var(--text-muted)]">
          {mode === 'edit' ? '标题和正文修改后 2 秒自动保存，也可手动保存。' : '保存/切换时将草稿保存在此浏览器（按项目与集数隔离）；生成或保存剧本后才写入项目。'}
        </p>
        {busy === 'generate' && <div className="space-y-1">
          <Progress aria-label="剧本生成进度" value={Number.isFinite(workflow.overallProgress) ? workflow.overallProgress : 0} />
          <p className="text-xs text-[var(--text-muted)]">{generation.current?.completed ? '正在保存生成结果…' : `生成中：${workflow.currentStep}/${workflow.totalSteps}`}</p>
        </div>}
        {workflow.error && busy === 'generate' && <p role="alert" className="text-xs text-red-500">工作流连接异常，正在重试：{workflow.error}</p>}
      </div>
    </ContentEditorPanel>
  );

  // null 是等待宿主，不回退到独立编辑布局；Portal 只搬运片段，所有状态仍在本实例。
  return <div className="flex flex-col h-full min-h-0 min-w-0">
    {embedded ? <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4" aria-label="剧本正文预览">{preview}</div>
      {editorPortalTarget ? createPortal(editor, editorPortalTarget) : null}
    </> : editor}
  </div>;
};

/** 对象变化建立新边界；宿主必须先 await 已注册句柄的 flush，再改变对象或卸载。 */
const ScriptWorkshop: React.FC<ScriptWorkshopProps> = props => (
  <WorkshopSession key={`${props.lockProjectId ?? 'personal'}:${props.lockEpisodeNumber ?? 'unset'}:${props.initialScriptId ?? 'new'}`} {...props} />
);

export default ScriptWorkshop;
