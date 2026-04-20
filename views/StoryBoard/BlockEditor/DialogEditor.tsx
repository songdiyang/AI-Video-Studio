/**
 * 对话框式编辑器
 * 左侧组件面板 + 右侧文本编辑区域
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tabs, Tab } from '@heroui/react';
import { Save, Trash2, Wand2, Type, Camera, Users, MapPin, Zap, History, RotateCcw, GitCompare, Sparkles, Undo2, Loader2, MessageCircle, Plus, X as XIcon, Mic } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { BLOCK_OPTIONS } from './utils/blockRegistry';
import { getAuthToken } from '../../../services/auth';
import { startWorkflow, getWorkflowStatus, WorkflowJob } from '../../../hooks/useWorkflow';

interface PromptVersion {
  id: number;
  storyboard_id: number;
  prompt_text: string;
  version_number: number;
  is_current: boolean;
  source: 'manual' | 'ai';
  created_by_name?: string;
  created_at: string;
}

interface DialogueLine {
  character: string;
  line: string;
}

interface DialogEditorProps {
  storyboardId: number;
  initialPrompt?: string;
  onChange?: (prompt: string) => void;
  onSave?: (prompt: string) => Promise<boolean> | void;
  projectId?: number;
  scriptId?: number;
  availableFrames?: { startFrame?: string; endFrame?: string };
  dialogue?: string;
  dialogues?: DialogueLine[];
  sceneCharacters?: string[] | { id: number; name: string }[];
  onUpdateDialogues?: (dialogues: DialogueLine[]) => Promise<boolean>;
  voiceover?: string;
  onUpdateVoiceover?: (voiceover: string) => Promise<boolean>;
  negativePrompt?: string;
  onUpdateNegativePrompt?: (negativePrompt: string) => Promise<boolean>;
}

interface Character {
  id: number;
  name: string;
  appearance?: string;
  personality?: string;
  description?: string;
  imageUrl?: string;
}

interface SceneItem {
  id: number;
  name: string;
  description?: string;
  environment?: string;
  lighting?: string;
  mood?: string;
  imageUrl?: string;
  reverseImageUrl?: string;
}

interface ReferenceImage {
  id: string;
  url: string;
  source: 'frame' | 'scene';
  label: string;
}

// --- 富文本编辑辅助函数 ---
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCapsuleHtml(refId: string, url: string, label: string): string {
  const imgHtml = url
    ? `<img src="${escapeHtml(url)}" style="width:20px;height:20px;border-radius:4px;object-fit:cover;flex-shrink:0" draggable="false"/>`
    : `<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:rgba(168,85,247,0.15);color:rgb(168,85,247);font-size:12px;flex-shrink:0">📷</span>`;
  return `<span contenteditable="false" data-ref-id="${escapeHtml(refId)}" style="display:inline-flex;align-items:center;gap:4px;margin:0 2px;padding:2px 8px 2px 4px;border-radius:999px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);vertical-align:middle;cursor:default;user-select:none;font-size:12px;line-height:1.4">${imgHtml}<span style="color:rgb(126,34,206);white-space:nowrap">${escapeHtml(label)}</span><span data-delete-ref="${escapeHtml(refId)}" style="margin-left:2px;color:rgba(168,85,247,0.5);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0">×</span></span>`;
}

function refTextToHtml(text: string, images: ReferenceImage[]): string {
  if (!text && images.length === 0) return '<br>';
  const imgMap = new Map(images.map(img => [img.id, img]));
  const parts = text.split(/(\[参考图:ref-\d+\])/g);
  const htmlParts = parts.map(part => {
    const m = part.match(/^\[参考图:(ref-\d+)\]$/);
    if (m) {
      const refId = m[1];
      const img = imgMap.get(refId);
      return buildCapsuleHtml(refId, img?.url || '', img?.label || '参考图');
    }
    return escapeHtml(part).replace(/\n/g, '<br>');
  });
  return htmlParts.join('') || '<br>';
}

function createCapsuleDom(img: ReferenceImage): HTMLSpanElement {
  const temp = document.createElement('div');
  temp.innerHTML = buildCapsuleHtml(img.id, img.url, img.label);
  return temp.firstChild as HTMLSpanElement;
}

function extractTextFromEditor(editor: HTMLDivElement): string {
  let result = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node instanceof HTMLElement) {
      if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.dataset?.refId) {
        result += `[参考图:${node.dataset.refId}]`;
      } else if (node.tagName === 'DIV') {
        if (result.length > 0 && !result.endsWith('\n')) {
          result += '\n';
        }
        node.childNodes.forEach(child => walk(child));
      } else {
        node.childNodes.forEach(child => walk(child));
      }
    }
  };
  editor.childNodes.forEach(child => walk(child));
  if (result.endsWith('\n')) {
    result = result.slice(0, -1);
  }
  return result;
}

function getRangeFromPoint(x: number, y: number): Range | null {
  if ((document as any).caretRangeFromPoint) {
    return (document as any).caretRangeFromPoint(x, y);
  }
  const pos = (document as any).caretPositionFromPoint?.(x, y);
  if (pos) {
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

const COMPONENT_CATEGORIES = [
  { key: 'text', label: '文本', icon: Type },
  { key: 'shot', label: '镜头', icon: Camera },
  { key: 'character', label: '角色', icon: Users },
  { key: 'dialogue', label: '台词', icon: MessageCircle },
  { key: 'voiceover', label: '画外音', icon: Mic },
  { key: 'scene', label: '场景', icon: MapPin },
  { key: 'action', label: '动作', icon: Zap },
];

const DialogEditor: React.FC<DialogEditorProps> = ({
  storyboardId,
  initialPrompt = '',
  onChange,
  onSave,
  projectId,
  scriptId,
  availableFrames,
  dialogue: initialDialogue = '',
  dialogues: initialDialogues = [],
  sceneCharacters = [],
  onUpdateDialogues,
  voiceover: initialVoiceover = '',
  onUpdateVoiceover,
  negativePrompt: initialNegativePrompt = '',
  onUpdateNegativePrompt,
}) => {
  const { showToast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedRef = useRef('');
  const [promptText, setPromptText] = useState(initialPrompt);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('shot');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const [sceneItems, setSceneItems] = useState<SceneItem[]>([]);
  const [isLoadingScenes, setIsLoadingScenes] = useState(false);

  // 版本管理状态
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // AI 优化状态
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [preOptimizeText, setPreOptimizeText] = useState<string | null>(null);
  const optimizeJobIdRef = useRef<string | null>(null);
  const optimizePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 台词编辑状态
  const [editingDialogues, setEditingDialogues] = useState<DialogueLine[]>([]);
  const [isDialogueDirty, setIsDialogueDirty] = useState(false);
  const [isSavingDialogues, setIsSavingDialogues] = useState(false);

  // 画外音编辑状态
  const [editingVoiceover, setEditingVoiceover] = useState('');
  const [isVoiceoverDirty, setIsVoiceoverDirty] = useState(false);
  const [isSavingVoiceover, setIsSavingVoiceover] = useState(false);

  // 反向提示词编辑状态
  const [editingNegativePrompt, setEditingNegativePrompt] = useState(initialNegativePrompt);
  const [isNegativePromptDirty, setIsNegativePromptDirty] = useState(false);
  const [isSavingNegativePrompt, setIsSavingNegativePrompt] = useState(false);

  // 获取当前分镜的角色名列表
  const getCharacterNames = (): string[] => {
    if (!sceneCharacters || sceneCharacters.length === 0) return [];
    return sceneCharacters.map((c: any) => typeof c === 'string' ? c : c.name);
  };

  // 初始化台词编辑状态
  useEffect(() => {
    if (initialDialogues && initialDialogues.length > 0) {
      setEditingDialogues(initialDialogues.map(d => ({ ...d })));
    } else if (initialDialogue) {
      // 从扁平字符串推断：如果只有一个角色，归属给该角色
      const charNames = getCharacterNames();
      if (charNames.length === 1) {
        setEditingDialogues([{ character: charNames[0], line: initialDialogue }]);
      } else {
        setEditingDialogues([{ character: '', line: initialDialogue }]);
      }
    } else {
      setEditingDialogues([]);
    }
    setIsDialogueDirty(false);
  }, [storyboardId]); // 切换分镜时重新初始化

  // 初始化画外音编辑状态
  useEffect(() => {
    setEditingVoiceover(initialVoiceover || '');
    setIsVoiceoverDirty(false);
  }, [storyboardId]);

  // 初始化反向提示词编辑状态
  useEffect(() => {
    setEditingNegativePrompt(initialNegativePrompt || '');
    setIsNegativePromptDirty(false);
  }, [storyboardId, initialNegativePrompt]);

  // 切换分镜时清理 AI 优化轮询
  useEffect(() => {
    return () => {
      if (optimizePollTimerRef.current) {
        clearTimeout(optimizePollTimerRef.current);
        optimizePollTimerRef.current = null;
      }
      optimizeJobIdRef.current = null;
      setIsOptimizing(false);
    };
  }, [storyboardId]);

  // AI 优化分镜描述（工作流模式 - 挂载任务球）
  const handleOptimize = async () => {
    const text = promptText.trim();
    if (!text || isOptimizing) return;

    setIsOptimizing(true);
    try {
      if (!projectId) {
        showToast('缺少项目信息', 'warning');
        return;
      }

      // 启动工作流任务
      const { jobId } = await startWorkflow('single_prompt_optimization', projectId, {
        storyboardId,
        prompt: text
      });

      optimizeJobIdRef.current = jobId;
      console.log(`[DialogEditor] AI优化任务已启动, jobId=${jobId}`);

      // 开始轮询工作流状态
      const pollOptimizeStatus = async () => {
        if (!optimizeJobIdRef.current) return;
        try {
          const job = await getWorkflowStatus(optimizeJobIdRef.current);

          if (job.status === 'completed') {
            // 从工作流结果中提取优化数据
            const lastTask = job.tasks?.[job.tasks.length - 1];
            const resultData = lastTask?.result_data;
            const optimized = resultData?.optimized || (typeof resultData === 'string' ? resultData : '');
            const negativePrompt = resultData?.negativePrompt || '';

            if (optimized) {
              // 保存原始文本用于撤回
              setPreOptimizeText(text);
              // 更新编辑器内容
              setPromptText(optimized);
              if (editorRef.current) {
                editorRef.current.innerHTML = refTextToHtml(optimized, referenceImages);
                lastRenderedRef.current = optimized;
              }
              setIsDirty(true);
              onChange?.(optimized);
              // AI 优化同时生成反向提示词，自动填充
              if (negativePrompt) {
                setEditingNegativePrompt(negativePrompt);
                setIsNegativePromptDirty(true);
              }
              showToast('AI 优化完成', 'success');
            } else {
              showToast('AI 模型返回内容为空', 'error');
            }
            // 清理
            optimizeJobIdRef.current = null;
            setIsOptimizing(false);
            return;
          } else if (job.status === 'failed') {
            const failedTask = job.tasks?.find(t => t.status === 'failed');
            const errorMsg = job.error_message || failedTask?.error_message || '优化失败';
            showToast(errorMsg, 'error');
            optimizeJobIdRef.current = null;
            setIsOptimizing(false);
            return;
          } else if (job.status === 'cancelled') {
            showToast('优化任务已取消', 'info');
            optimizeJobIdRef.current = null;
            setIsOptimizing(false);
            return;
          }

          // 继续轮询
          optimizePollTimerRef.current = setTimeout(pollOptimizeStatus, 1000);
        } catch (err: any) {
          console.error('[DialogEditor] 轮询优化任务状态失败:', err);
          // 继续轮询（网络错误时重试）
          optimizePollTimerRef.current = setTimeout(pollOptimizeStatus, 2000);
        }
      };

      // 启动轮询
      pollOptimizeStatus();
    } catch (error: any) {
      showToast(error.message || 'AI 优化失败', 'error');
      setIsOptimizing(false);
    }
  };

  // 撤回优化
  const handleUndoOptimize = () => {
    if (preOptimizeText === null) return;
    setPromptText(preOptimizeText);
    if (editorRef.current) {
      editorRef.current.innerHTML = refTextToHtml(preOptimizeText, referenceImages);
      lastRenderedRef.current = preOptimizeText;
    }
    setIsDirty(true);
    onChange?.(preOptimizeText);
    setPreOptimizeText(null);
    // 撤回优化时不自动清除反向提示词，用户可手动清除
    showToast('已撤回优化', 'info');
  };

  // 当 initialPrompt 变化时同步更新（切换分镜时）
  // 解析参考图占位符元数据，保留标记在文本中，渲染为胶囊
  useEffect(() => {
    const refRegex = /\[参考图:(ref-\d+)\]/g;
    const parsedImages: ReferenceImage[] = [];
    let match;
    while ((match = refRegex.exec(initialPrompt)) !== null) {
      parsedImages.push({
        id: match[1],
        url: '',
        source: 'frame',
        label: '参考图',
      });
    }
    setPromptText(initialPrompt);
    setReferenceImages(parsedImages);
    setPreOptimizeText(null);  // 切换分镜时重置优化撤回状态
    lastRenderedRef.current = initialPrompt;
    // 渲染富文本到编辑器
    if (editorRef.current) {
      editorRef.current.innerHTML = refTextToHtml(initialPrompt, parsedImages);
    }
    setIsDirty(false);
  }, [initialPrompt]);

  // 当文本变化时触发 onChange
  useEffect(() => {
    onChange?.(promptText);
  }, [promptText, onChange]);

  // 加载项目角色
  useEffect(() => {
    if (projectId && activeTab === 'character') {
      loadCharacters();
    }
  }, [projectId, activeTab]);

  const loadCharacters = async () => {
    if (!projectId) return;
    setIsLoadingCharacters(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/characters/project/${projectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.characters || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          appearance: c.appearance,
          personality: c.personality,
          description: c.description,
          imageUrl: c.image_url || c.imageUrl,
        }));
        setCharacters(mapped);
      }
    } catch (error) {
      console.error('[DialogEditor] 加载角色失败:', error);
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  // 加载项目场景
  useEffect(() => {
    if (projectId && activeTab === 'scene') {
      loadScenes();
    }
  }, [projectId, scriptId, activeTab]);

  const loadScenes = async () => {
    if (!projectId) return;
    setIsLoadingScenes(true);
    try {
      const token = getAuthToken();
      const url = scriptId
        ? `/api/scenes/project/${projectId}?scriptId=${scriptId}`
        : `/api/scenes/project/${projectId}`;
      const res = await fetch(url, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.scenes || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          environment: s.environment,
          lighting: s.lighting,
          mood: s.mood,
          imageUrl: s.image_url || s.imageUrl,
          reverseImageUrl: s.reverse_image_url || s.reverseImageUrl,
        }));
        setSceneItems(mapped);
      }
    } catch (error) {
      console.error('[DialogEditor] 加载场景失败:', error);
    } finally {
      setIsLoadingScenes(false);
    }
  };

  // 插入文本组件到光标位置（contentEditable）
  const insertComponent = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.appendChild(document.createTextNode(text));
    }

    // 同步状态
    const newText = extractTextFromEditor(editor);
    lastRenderedRef.current = newText;
    setPromptText(newText);
    setIsDirty(true);
  }, []);

  // 处理拖拽进入
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  // 处理放置（contentEditable）
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      if (data.type === 'reference-image') {
        const newImage: ReferenceImage = {
          id: `ref-${Date.now()}`,
          url: data.imageUrl,
          source: data.source as 'frame' | 'scene',
          label: data.sceneName ? `场景:${data.sceneName}` : data.frameType === 'start' ? '首帧' : data.frameType === 'end' ? '尾帧' : '参考',
        };
        setReferenceImages(prev => [...prev, newImage]);

        // 在拖放位置插入胶囊元素
        const editor = editorRef.current;
        if (editor) {
          const capsule = createCapsuleDom(newImage);
          const range = getRangeFromPoint(e.clientX, e.clientY);
          if (range && editor.contains(range.startContainer)) {
            range.insertNode(capsule);
            const sel = window.getSelection();
            if (sel) {
              range.setStartAfter(capsule);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else {
            editor.appendChild(capsule);
          }

          const newText = extractTextFromEditor(editor);
          lastRenderedRef.current = newText;
          setPromptText(newText);
        }
        setIsDirty(true);
      } else if (data.componentType) {
        // 在拖放位置插入文本组件
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
          const range = getRangeFromPoint(e.clientX, e.clientY);
          if (range && editor.contains(range.startContainer)) {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
        insertComponent(data.template);
      }
    } catch (error) {
      console.error('[DialogEditor] Drop error:', error);
    }
  }, [insertComponent]);

  // 删除参考图
  const removeReferenceImage = useCallback((id: string) => {
    // 从 DOM 中移除胶囊
    const capsule = editorRef.current?.querySelector(`[data-ref-id="${id}"]`);
    if (capsule) {
      capsule.remove();
    }
    // 同步状态
    const editor = editorRef.current;
    if (editor) {
      const newText = extractTextFromEditor(editor);
      lastRenderedRef.current = newText;
      setPromptText(newText);
    } else {
      setPromptText(prev => prev.replace(`[参考图:${id}]`, ''));
    }
    setReferenceImages(prev => prev.filter(img => img.id !== id));
    setIsDirty(true);
  }, []);

  // 清空
  const handleClear = useCallback(() => {
    setPromptText('');
    setReferenceImages([]);
    lastRenderedRef.current = '';
    if (editorRef.current) {
      editorRef.current.innerHTML = '<br>';
    }
    setIsDirty(true);
    showToast('已清空', 'info');
  }, [showToast]);

  // 保存
  const handleSave = useCallback(async () => {
    try {
      await onSave?.(promptText);
      setIsDirty(false);
      showToast('分镜描述已保存', 'success');
    } catch (error) {
      showToast('保存失败', 'error');
    }
  }, [promptText, onSave, showToast]);

  // 加载版本历史
  const loadVersions = useCallback(async () => {
    setLoadingVersions(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/prompt-history`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.history || []);
      }
    } catch (error) {
      console.error('[DialogEditor] 加载版本历史失败:', error);
    } finally {
      setLoadingVersions(false);
    }
  }, [storyboardId]);

  // 打开版本面板
  const handleOpenVersionPanel = useCallback(() => {
    setShowVersionPanel(true);
    setSelectedVersion(null);
    setCompareMode(false);
    setCompareVersion(null);
    loadVersions();
  }, [loadVersions]);

  // 恢复版本
  const handleRestoreVersion = useCallback(async (version: PromptVersion) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/prompt-history/${version.id}/restore`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        setPromptText(version.prompt_text);
        setIsDirty(false);
        onChange?.(version.prompt_text);
        // 重新渲染编辑器
        lastRenderedRef.current = version.prompt_text;
        if (editorRef.current) {
          editorRef.current.innerHTML = refTextToHtml(version.prompt_text, referenceImages);
        }
        showToast(`已恢复到版本 v${version.version_number}`, 'success');
        setShowVersionPanel(false);
        loadVersions();
      } else {
        showToast('恢复失败', 'error');
      }
    } catch (error) {
      showToast('恢复失败', 'error');
    }
  }, [storyboardId, onChange, showToast, loadVersions]);

  // 简单 diff 函数：逐行对比两段文本
  const computeDiff = useCallback((textA: string, textB: string) => {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');
    const maxLen = Math.max(linesA.length, linesB.length);
    const result: { text: string; type: 'same' | 'added' | 'removed' }[] = [];

    for (let i = 0; i < maxLen; i++) {
      const lineA = i < linesA.length ? linesA[i] : undefined;
      const lineB = i < linesB.length ? linesB[i] : undefined;

      if (lineA === lineB) {
        result.push({ text: lineA!, type: 'same' });
      } else {
        if (lineA !== undefined) {
          result.push({ text: lineA, type: 'removed' });
        }
        if (lineB !== undefined) {
          result.push({ text: lineB, type: 'added' });
        }
      }
    }
    return result;
  }, []);

  // 格式化时间
  const formatVersionTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // --- 台词编辑操作 ---
  const handleAddDialogueLine = () => {
    const charNames = getCharacterNames();
    const defaultChar = charNames.length > 0 ? charNames[0] : '';
    setEditingDialogues(prev => [...prev, { character: defaultChar, line: '' }]);
    setIsDialogueDirty(true);
  };

  const handleUpdateDialogueLine = (index: number, field: 'character' | 'line', value: string) => {
    setEditingDialogues(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    setIsDialogueDirty(true);
  };

  const handleRemoveDialogueLine = (index: number) => {
    setEditingDialogues(prev => prev.filter((_, i) => i !== index));
    setIsDialogueDirty(true);
  };

  const handleSaveDialogues = async () => {
    if (!onUpdateDialogues) return;
    setIsSavingDialogues(true);
    try {
      // 过滤掉空台词
      const filtered = editingDialogues.filter(d => d.line.trim());
      const success = await onUpdateDialogues(filtered);
      if (success) {
        setEditingDialogues(filtered);
        setIsDialogueDirty(false);
        showToast('台词已保存', 'success');
      }
    } catch {
      showToast('保存台词失败', 'error');
    } finally {
      setIsSavingDialogues(false);
    }
  };

  // --- 画外音保存 ---
  const handleSaveVoiceover = async () => {
    if (!onUpdateVoiceover) return;
    setIsSavingVoiceover(true);
    try {
      const success = await onUpdateVoiceover(editingVoiceover.trim());
      if (success) {
        setIsVoiceoverDirty(false);
        showToast('画外音已保存', 'success');
      }
    } catch {
      showToast('保存画外音失败', 'error');
    } finally {
      setIsSavingVoiceover(false);
    }
  };

  // 渲染组件按钮
  const renderComponentButtons = () => {
    switch (activeTab) {
      case 'shot':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">景别</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.shotSize.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}镜头，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'shotSize',
                        template: `${opt.label}镜头，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">视角</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.cameraAngle.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}视角，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'cameraAngle',
                        template: `${opt.label}视角，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">运镜</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.movement.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(opt.value === 'static' ? '镜头固定，' : `镜头${opt.label}，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'movement',
                        template: opt.value === 'static' ? '镜头固定，' : `镜头${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">焦距</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.lensType.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}镜头，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'lensType',
                        template: `${opt.label}镜头，`
                      }));
                    }}
                    title={opt.description}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'character':
        return (
          <div className="space-y-3">
            {/* 项目角色列表 */}
            {projectId && (
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2">剧集角色（可拖拽）</div>
                {isLoadingCharacters ? (
                  <div className="text-xs text-[var(--text-muted)] py-2">加载中...</div>
                ) : characters.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] py-2">暂无角色</div>
                ) : (
                  <div className="space-y-2">
                    {characters.map(char => (
                      <div
                        key={char.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            componentType: 'character',
                            template: `${char.name}，`
                          }));
                        }}
                        onClick={() => insertComponent(`${char.name}，`)}
                        className="flex items-center gap-2 p-2 rounded bg-rose-500/10 hover:bg-rose-500/20 cursor-grab transition-colors"
                      >
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-xs text-rose-600">
                            {char.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-rose-700 truncate">{char.name}</div>
                          {char.appearance && (
                            <div className="text-[10px] text-rose-500/70 truncate">{char.appearance.slice(0, 20)}...</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">位置</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.characterPosition.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`位于画面${opt.label}，`)}
                    className="px-2 py-1 rounded bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'position',
                        template: `位于画面${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">景深层次</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.verticalPosition.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`位于${opt.label}，`)}
                    className="px-2 py-1 rounded bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'depth',
                        template: `位于${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'scene':
        return (
          <div className="space-y-3">
            {/* 项目场景列表 */}
            {projectId && (
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-2">项目场景（可拖拽图片）</div>
                {isLoadingScenes ? (
                  <div className="text-xs text-[var(--text-muted)] py-2">加载中...</div>
                ) : sceneItems.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] py-2">暂无场景</div>
                ) : (
                  <div className="space-y-2">
                    {sceneItems.map(scene => (
                      <div
                        key={scene.id}
                        className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                      >
                        {scene.imageUrl ? (
                          <div
                            className="relative w-12 h-9 rounded overflow-hidden cursor-grab flex-shrink-0"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                type: 'reference-image',
                                imageUrl: scene.imageUrl,
                                source: 'scene',
                                sceneName: scene.name
                              }));
                            }}
                          >
                            <img src={scene.imageUrl} alt={scene.name} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 left-0 right-0 text-[7px] text-center text-white bg-black/50">A面</span>
                          </div>
                        ) : (
                          <div className="w-12 h-9 rounded bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-600 flex-shrink-0">
                            <MapPin size={14} />
                          </div>
                        )}
                        {scene.reverseImageUrl && (
                          <div
                            className="relative w-12 h-9 rounded overflow-hidden cursor-grab flex-shrink-0"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                type: 'reference-image',
                                imageUrl: scene.reverseImageUrl,
                                source: 'scene',
                                sceneName: `${scene.name}(B面)`
                              }));
                            }}
                          >
                            <img src={scene.reverseImageUrl} alt={`${scene.name} B面`} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 left-0 right-0 text-[7px] text-center text-white bg-black/50">B面</span>
                          </div>
                        )}
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => insertComponent(`${scene.name}场景，`)}
                        >
                          <div className="text-xs font-medium text-emerald-700 truncate">{scene.name}</div>
                          {scene.description && (
                            <div className="text-[10px] text-emerald-500/70 truncate">{scene.description.slice(0, 20)}...</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">光线</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.lighting.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}，`)}
                    className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-xs hover:bg-emerald-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'lighting',
                        template: `${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">氛围</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.atmosphere.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}氛围，`)}
                    className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-xs hover:bg-emerald-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'atmosphere',
                        template: `${opt.label}氛围，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'action':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">动作</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.actionType.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}，`)}
                    className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 text-xs hover:bg-amber-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'action',
                        template: `${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'dialogue': {
        const charNames = getCharacterNames();
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">角色台词</div>
              {isDialogueDirty && (
                <button
                  onClick={handleSaveDialogues}
                  disabled={isSavingDialogues}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSavingDialogues ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  保存台词
                </button>
              )}
            </div>

            {editingDialogues.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] py-4 text-center">
                暂无台词
              </div>
            ) : (
              <div className="space-y-2">
                {editingDialogues.map((dl, idx) => (
                  <div key={idx} className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {charNames.length > 0 ? (
                        <select
                          value={dl.character}
                          onChange={(e) => handleUpdateDialogueLine(idx, 'character', e.target.value)}
                          className="flex-1 text-xs px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          <option value="">选择角色</option>
                          {charNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={dl.character}
                          onChange={(e) => handleUpdateDialogueLine(idx, 'character', e.target.value)}
                          placeholder="角色名"
                          className="flex-1 text-xs px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      )}
                      <button
                        onClick={() => handleRemoveDialogueLine(idx)}
                        className="p-1 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        title="删除此行台词"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                    <textarea
                      value={dl.line}
                      onChange={(e) => handleUpdateDialogueLine(idx, 'line', e.target.value)}
                      placeholder="输入台词内容..."
                      rows={2}
                      className="w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAddDialogueLine}
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
            >
              <Plus className="w-3 h-3" />
              添加台词
            </button>

            {charNames.length > 0 && editingDialogues.length === 0 && (
              <div className="pt-1">
                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">快速添加角色台词</div>
                <div className="flex flex-wrap gap-1">
                  {charNames.map(name => (
                    <button
                      key={name}
                      onClick={() => {
                        setEditingDialogues(prev => [...prev, { character: name, line: '' }]);
                        setIsDialogueDirty(true);
                      }}
                      className="px-2 py-1 rounded bg-cyan-500/10 text-cyan-600 text-[10px] hover:bg-cyan-500/20 transition-colors"
                    >
                      + {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }
      case 'voiceover':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">画外音说明</div>
              {isVoiceoverDirty && (
                <button
                  onClick={handleSaveVoiceover}
                  disabled={isSavingVoiceover}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSavingVoiceover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  保存
                </button>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              描述画面中的旁白/解说声音，非角色对白。生成视频时会作为音频提示注入。
            </div>
            <textarea
              value={editingVoiceover}
              onChange={(e) => {
                setEditingVoiceover(e.target.value);
                setIsVoiceoverDirty(true);
              }}
              placeholder="例如：“时光轮转，三年过去了……”或“画外音播报新闻，语气严肃”"
              rows={4}
              className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            />
          </div>
        );
      case 'text':
        return (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-muted)] mb-2">常用句式</div>
            {['角色', '场景', '动作', '表情', '服装', '道具'].map(text => (
              <button
                key={text}
                onClick={() => insertComponent(`${text}：`)}
                className="w-full px-3 py-2 rounded bg-slate-500/10 text-slate-600 text-xs hover:bg-slate-500/20 transition-colors text-left mb-1.5"
              >
                {text}：
              </button>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-[var(--bg-body)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            导演空间
          </h2>
          {isDirty && (
            <span className="text-xs text-[var(--text-muted)]">(未保存)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
            startContent={<History className="w-3.5 h-3.5" />}
            onPress={handleOpenVersionPanel}
          >
            版本
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
            startContent={<Trash2 className="w-3.5 h-3.5" />}
            onPress={handleClear}
            isDisabled={!promptText && referenceImages.length === 0}
          >
            清空
          </Button>
          <Button
            size="sm"
            className="pro-btn-primary"
            startContent={<Save className="w-3.5 h-3.5" />}
            onPress={handleSave}
            isDisabled={!isDirty}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 主编辑区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧组件面板 */}
        <div className="w-56 bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col">
          {/* 分类标签 */}
          <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--border-color)]">
            {COMPONENT_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === cat.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <cat.icon className="w-3 h-3 inline mr-1" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* 组件列表 */}
          <div className="flex-1 overflow-y-auto p-3">
            {renderComponentButtons()}
          </div>

          {/* 参考图区域 */}
          {(availableFrames?.startFrame || availableFrames?.endFrame) && (
            <div className="p-3 border-t border-[var(--border-color)]">
              <div className="text-xs text-[var(--text-muted)] mb-2">拖拽参考图</div>
              <div className="flex gap-2">
                {availableFrames.startFrame && (
                  <div
                    className="relative w-14 h-10 rounded overflow-hidden cursor-grab group"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: availableFrames.startFrame,
                        source: 'frame',
                        frameType: 'start'
                      }));
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage({ url: availableFrames.startFrame!, title: '首帧预览' });
                    }}
                    title="点击预览，拖拽插入"
                  >
                    <img src={availableFrames.startFrame} alt="首帧" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">首帧</span>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                )}
                {availableFrames.endFrame && (
                  <div
                    className="relative w-14 h-10 rounded overflow-hidden cursor-grab group"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: availableFrames.endFrame,
                        source: 'frame',
                        frameType: 'end'
                      }));
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage({ url: availableFrames.endFrame!, title: '尾帧预览' });
                    }}
                    title="点击预览，拖拽插入"
                  >
                    <img src={availableFrames.endFrame} alt="尾帧" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">尾帧</span>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧文本编辑区域 */}
        <div className="flex-1 flex flex-col p-4">
          {/* 富文本编辑区（contentEditable） */}
          <div
            className={`flex-1 relative ${isDraggingOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                const editor = editorRef.current;
                if (!editor) return;
                const newText = extractTextFromEditor(editor);
                lastRenderedRef.current = newText;
                setPromptText(newText);
                setIsDirty(true);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text/plain');
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                  const range = selection.getRangeAt(0);
                  range.deleteContents();
                  const textNode = document.createTextNode(text);
                  range.insertNode(textNode);
                  range.setStartAfter(textNode);
                  range.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
                const editor = editorRef.current;
                if (editor) {
                  const newText = extractTextFromEditor(editor);
                  lastRenderedRef.current = newText;
                  setPromptText(newText);
                  setIsDirty(true);
                }
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const deleteRef = target.dataset?.deleteRef;
                if (deleteRef) {
                  e.preventDefault();
                  e.stopPropagation();
                  removeReferenceImage(deleteRef);
                }
              }}
              data-placeholder="点击左侧组件插入，或拖拽组件/参考图到此处..."
              className="w-full h-full p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] overflow-y-auto focus:outline-none focus:border-[var(--accent)] empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--text-muted)] empty:before:pointer-events-none"
              style={{ minHeight: '120px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            />
            {isDraggingOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/10 rounded-lg pointer-events-none">
                <span className="text-sm text-[var(--accent)]">释放以插入</span>
              </div>
            )}
          </div>

          {/* 提示 + AI优化按钮 */}
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-[var(--text-muted)]">
              提示：点击左侧组件直接插入，或拖拽组件到文本区域
            </div>
            {/* AI 优化 / 撤回按钮 */}
            {preOptimizeText !== null ? (
              <button
                onClick={handleUndoOptimize}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 text-xs hover:bg-amber-500/20 transition-colors shrink-0"
                title="撤回优化，恢复原文"
              >
                <Undo2 className="w-3.5 h-3.5" />
                撤回
              </button>
            ) : (
              <button
                onClick={handleOptimize}
                disabled={isOptimizing || !promptText.trim()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 text-xs hover:bg-purple-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="AI 优化描述"
              >
                {isOptimizing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {isOptimizing ? '优化中...' : 'AI 优化'}
              </button>
            )}
          </div>

          {/* 反向提示词区域 */}
          <div className="mt-3 border-t border-[var(--border-color)] pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">反向提示词</span>
                <span className="text-[10px] text-[var(--text-muted)]">（排除不希望出现的内容）</span>
                {isNegativePromptDirty && (
                  <span className="text-[10px] text-amber-500">未保存</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {editingNegativePrompt && (
                  <button
                    onClick={() => {
                      setEditingNegativePrompt('');
                      setIsNegativePromptDirty(true);
                    }}
                    className="text-[10px] text-[var(--text-muted)] hover:text-red-500 transition-colors"
                    title="清空反向提示词"
                  >
                    清空
                  </button>
                )}
                {isNegativePromptDirty && onUpdateNegativePrompt && (
                  <button
                    onClick={async () => {
                      if (!onUpdateNegativePrompt) return;
                      setIsSavingNegativePrompt(true);
                      try {
                        await onUpdateNegativePrompt(editingNegativePrompt);
                        setIsNegativePromptDirty(false);
                      } catch (err) {
                        // error handled by parent
                      } finally {
                        setIsSavingNegativePrompt(false);
                      }
                    }}
                    disabled={isSavingNegativePrompt}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                  >
                    {isSavingNegativePrompt ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                    保存
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={editingNegativePrompt}
              onChange={(e) => {
                setEditingNegativePrompt(e.target.value);
                setIsNegativePromptDirty(true);
              }}
              placeholder="描述不希望出现在画面中的内容，如：low quality, blurry, extra limbs, watermark..."
              rows={2}
              className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* 版本管理面板（右侧滑出） */}
      {showVersionPanel && (
        <div className="absolute inset-0 z-50 flex">
          {/* 半透明遮罩 */}
          <div 
            className="flex-1 bg-black/30"
            onClick={() => setShowVersionPanel(false)}
          />
          {/* 面板 */}
          <div className="w-[420px] bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col shadow-xl">
            {/* 面板头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">版本历史</span>
                <span className="text-xs text-[var(--text-muted)]">({versions.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {!compareMode ? (
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<GitCompare className="w-3.5 h-3.5" />}
                    onPress={() => { setCompareMode(true); setSelectedVersion(null); setCompareVersion(null); }}
                    isDisabled={versions.length < 2}
                    className="text-xs"
                  >
                    对比
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => { setCompareMode(false); setSelectedVersion(null); setCompareVersion(null); }}
                    className="text-xs"
                  >
                    取消对比
                  </Button>
                )}
                <button
                  onClick={() => setShowVersionPanel(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* 对比模式提示 */}
            {compareMode && (
              <div className="px-4 py-2 bg-blue-500/10 text-xs text-blue-600 border-b border-[var(--border-color)]">
                {!selectedVersion
                  ? '请选择第一个版本（旧版本）'
                  : !compareVersion
                  ? `已选 v${selectedVersion.version_number}，请选择第二个版本（新版本）`
                  : `对比: v${selectedVersion.version_number} → v${compareVersion.version_number}`}
              </div>
            )}

            {/* 版本列表 / 对比结果 */}
            <div className="flex-1 overflow-y-auto">
              {loadingVersions ? (
                <div className="flex items-center justify-center py-12 text-sm text-[var(--text-muted)]">
                  加载中...
                </div>
              ) : versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <History className="w-8 h-8 text-[var(--text-muted)] mb-2" />
                  <p className="text-sm text-[var(--text-muted)]">暂无版本历史</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">保存分镜描述后将自动记录版本</p>
                </div>
              ) : compareMode && selectedVersion && compareVersion ? (
                /* 对比结果视图 */
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3 text-xs text-[var(--text-muted)]">
                    <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600">v{selectedVersion.version_number} 删除</span>
                    <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">v{compareVersion.version_number} 新增</span>
                  </div>
                  <div className="rounded border border-[var(--border-color)] overflow-hidden text-xs font-mono">
                    {computeDiff(selectedVersion.prompt_text, compareVersion.prompt_text).map((line, i) => (
                      <div
                        key={i}
                        className={`px-3 py-1 border-b border-[var(--border-color)] last:border-b-0 whitespace-pre-wrap break-all ${
                          line.type === 'removed'
                            ? 'bg-red-500/10 text-red-700'
                            : line.type === 'added'
                            ? 'bg-green-500/10 text-green-700'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        <span className="inline-block w-4 mr-2 text-[var(--text-muted)] select-none">
                          {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
                        </span>
                        {line.text || ' '}
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="mt-3"
                    onPress={() => { setSelectedVersion(null); setCompareVersion(null); }}
                  >
                    重新选择
                  </Button>
                </div>
              ) : (
                /* 版本列表 */
                <div className="divide-y divide-[var(--border-color)]">
                  {versions.map((ver) => (
                    <div
                      key={ver.id}
                      className={`px-4 py-3 cursor-pointer transition-colors ${
                        (selectedVersion?.id === ver.id || compareVersion?.id === ver.id)
                          ? 'bg-[var(--accent)]/10'
                          : 'hover:bg-[var(--bg-card-hover)]'
                      }`}
                      onClick={() => {
                        if (compareMode) {
                          if (!selectedVersion) {
                            setSelectedVersion(ver);
                          } else if (!compareVersion && ver.id !== selectedVersion.id) {
                            setCompareVersion(ver);
                          }
                        } else {
                          setSelectedVersion(selectedVersion?.id === ver.id ? null : ver);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            v{ver.version_number}
                          </span>
                          {ver.is_current && (
                            <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 text-[10px]">
                              当前
                            </span>
                          )}
                          {ver.source === 'ai' && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 text-[10px]">
                              AI
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {formatVersionTime(ver.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 break-all">
                        {ver.prompt_text.slice(0, 80)}{ver.prompt_text.length > 80 ? '...' : ''}
                      </p>

                      {/* 选中时显示详细内容和操作 */}
                      {!compareMode && selectedVersion?.id === ver.id && (
                        <div className="mt-3 space-y-2">
                          <div className="p-2 rounded bg-[var(--bg-input)] text-xs text-[var(--text-primary)] max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                            {ver.prompt_text}
                          </div>
                          {!ver.is_current && (
                            <Button
                              size="sm"
                              color="primary"
                              variant="flat"
                              startContent={<RotateCcw className="w-3 h-3" />}
                              onPress={() => handleRestoreVersion(ver)}
                              className="w-full text-xs"
                            >
                              恢复此版本
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 图片预览模态框 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="absolute -top-8 left-0 text-white text-sm">{previewImage.title}</div>
            <button
              className="absolute -top-8 right-0 text-white hover:text-gray-300 text-xl"
              onClick={() => setPreviewImage(null)}
            >
              ✕
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DialogEditor;
