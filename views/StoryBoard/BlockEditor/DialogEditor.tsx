/**
 * 对话框式编辑器
 * 左侧组件面板 + 右侧文本编辑区域
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tabs, Tab } from '@heroui/react';
import { Save, Trash2, MessageCircle, Mic, History, RotateCcw, GitCompare, Sparkles, Undo2, Loader2, Plus, X as XIcon, Star, ImageIcon, Film, ChevronDown, Pencil } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { BLOCK_OPTIONS } from './utils/blockRegistry';
import SketchFramesPanel from './SketchFramesPanel';
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
  promptMode?: 'image' | 'video';
  basePrompt?: string;
  /** 模型列表 */
  models?: { name: string; type?: string; category?: string; description?: string; priceSummary?: string }[];
  /** 当前图片模型 */
  imageModel?: string;
  /** 当前视频模型 */
  videoModel?: string;
  /** 图片模型切换回调 */
  onImageModelChange?: (model: string) => void;
  /** 视频模型切换回调 */
  onVideoModelChange?: (model: string) => void;
  /** 生成图片回调 */
  onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  /** 生成视频回调 */
  onGenerateVideo?: (id: number) => Promise<{ success: boolean; error?: string }>;
  /** 场景动作类型 */
  hasAction?: boolean;
  /** 图片帧标签（运动模式时 first/last） */
  imageFrameTab?: 'first' | 'last';
  /** 当前文本模型 */
  textModel?: string;
  /** 文本模型切换回调 */
  onTextModelChange?: (model: string) => void;
}

interface Character {
  id: number;
  name: string;
  appearance?: string;
  base_appearance?: string;        // 白膜体貌描述
  outfit_appearance?: string;      // 服装外貌描述
  personality?: string;
  description?: string;
  imageUrl?: string;
  // 白膜/服装状态概要
  has_base_model_views?: boolean | number;  // 是否已生成白膜三视图
  active_state_name?: string;      // 当前激活状态名称
  active_state_image_url?: string; // 当前激活状态正面图
  base_model_image_url?: string;   // 白膜正面图 URL
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
  { key: 'dialogue', label: '台词', icon: MessageCircle },
  { key: 'voiceover', label: '画外音', icon: Mic },
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
  promptMode = 'image',
  basePrompt,
  models = [],
  imageModel: propImageModel,
  videoModel: propVideoModel,
  onImageModelChange,
  onVideoModelChange,
  onGenerateImage,
  onGenerateVideo,
  hasAction = false,
  imageFrameTab = 'first',
  textModel,
  onTextModelChange,
}) => {
  const { showToast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedRef = useRef('');
  const [promptText, setPromptText] = useState(initialPrompt);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('dialogue');
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

  // 模型过滤
  const imageModels = React.useMemo(() => {
    const uniqueMap = new Map<string, typeof models[number]>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'IMAGE').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);
  const videoModels = React.useMemo(() => {
    const uniqueMap = new Map<string, typeof models[number]>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'VIDEO').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);

  const textModels = React.useMemo(() => {
    const uniqueMap = new Map<string, typeof models[number]>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'TEXT').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);



  // AI 生成提示词：根据当前 promptMode 自动调用对应的工作流
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

  const handleGeneratePrompt = async () => {
    if (isGeneratingPrompt || !projectId) {
      if (!projectId) showToast('缺少项目信息', 'warning');
      return;
    }
    if (!textModel && textModels.length === 0) {
      showToast('请先选择文本模型以使用 AI 生成提示词', 'warning');
      return;
    }

    // 获取当前输入框内容作为输入（输入什么就优化什么）
    const baseText = promptText.trim();
    if (!baseText) {
      showToast('请先输入内容再生成提示词', 'warning');
      return;
    }

    // 根据 promptMode 自动选择工作流类型
    const isVideo = promptMode === 'video';
    const workflowType = isVideo
      ? 'single_video_prompt_optimization'
      : 'single_image_prompt_optimization';

    setIsGeneratingPrompt(true);
    try {
      const { jobId } = await startWorkflow(workflowType, projectId, {
        storyboardId,
        prompt: baseText,
        textModel: textModel || textModels[0]?.name || undefined,
      });

      const pollStatus = async (): Promise<void> => {
        const job = await getWorkflowStatus(jobId);
        if (job.status === 'completed') {
          const lastTask = job.tasks?.[job.tasks.length - 1];
          const resultData = lastTask?.result_data;

          if (!isVideo) {
            // 图片提示词模式
            const optimized = resultData?.optimized || '';
            if (optimized) {
              setPromptText(optimized);
              if (editorRef.current) {
                editorRef.current.innerHTML = refTextToHtml(optimized, referenceImages);
                lastRenderedRef.current = optimized;
              }
              setIsDirty(false);
              onChange?.(optimized);
              // 通过 onSave 保存到数据库并更新全局状态
              await onSave?.(optimized);
              showToast('图片提示词生成成功', 'success');
            }
          } else {
            // 视频提示词模式：处理首尾帧分离的情况
            const actionAnalysis = resultData?.actionAnalysis;
            const videoPrompt = resultData?.videoPrompt;
            const videoStartPrompt = resultData?.videoStartPrompt;
            const videoEndPrompt = resultData?.videoEndPrompt;
            const negativePrompt = resultData?.negativePrompt || '';

            // 根据动作类型保存不同的字段
            const body: any = {};
            const savedFields: string[] = [];

            if (actionAnalysis?.useEndFrame === false) {
              if (videoPrompt) {
                body.video_prompt = videoPrompt;
                savedFields.push('视频提示词');
              }
            } else if (actionAnalysis?.useEndFrame === true) {
              if (videoStartPrompt) {
                body.video_start_prompt = videoStartPrompt;
                savedFields.push('视频首帧提示词');
              }
              if (videoEndPrompt) {
                body.video_end_prompt = videoEndPrompt;
                savedFields.push('视频尾帧提示词');
              }
            } else {
              const optimized = resultData?.optimized || (typeof resultData === 'string' ? resultData : '');
              if (optimized) {
                body.video_prompt = optimized;
                savedFields.push('视频提示词');
              }
            }

            if (negativePrompt) {
              body.negative_prompt = negativePrompt;
            }

            // 持久化到数据库
            if (Object.keys(body).length > 0) {
              try {
                const token = getAuthToken();
                const res = await fetch(`/api/storyboards/${storyboardId}/content`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                  },
                  body: JSON.stringify(body)
                });
                if (!res.ok) {
                  showToast('视频提示词保存失败', 'error');
                } else if (savedFields.length > 0) {
                  showToast(`${savedFields.join('、')}已生成并保存`, 'success');
                  const displayPrompt = videoStartPrompt || videoPrompt || resultData?.optimized || '';
                  if (displayPrompt) {
                    setPromptText(displayPrompt);
                    if (editorRef.current) {
                      editorRef.current.innerHTML = refTextToHtml(displayPrompt, referenceImages);
                      lastRenderedRef.current = displayPrompt;
                    }
                    setIsDirty(false);
                    onChange?.(displayPrompt);
                  }
                }
              } catch (saveErr) {
                console.error('[DialogEditor] 保存视频提示词失败:', saveErr);
                showToast('视频提示词保存失败', 'error');
              }
            }
          }
          setIsGeneratingPrompt(false);
        } else if (job.status === 'failed') {
          showToast('提示词生成失败', 'error');
          setIsGeneratingPrompt(false);
        } else {
          setTimeout(pollStatus, 2000);
        }
      };
      pollStatus();
    } catch (error: any) {
      showToast(error.message || '提示词生成失败', 'error');
      setIsGeneratingPrompt(false);
    }
  };

  // 生成中状态
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);

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

  // AI 优化：根据 promptMode 自动选择对应工作流
  const handleOptimize = async () => {
    const text = promptText.trim();
    if (!text || isOptimizing) return;
    if (!projectId) {
      showToast('缺少项目信息', 'warning');
      return;
    }

    const isVideo = promptMode === 'video';
    const workflowType = isVideo
      ? 'single_video_prompt_optimization'
      : 'single_image_prompt_optimization';

    setIsOptimizing(true);
    try {
      const { jobId } = await startWorkflow(workflowType, projectId, {
        storyboardId,
        prompt: text
      });

      optimizeJobIdRef.current = jobId;
      console.log(`[DialogEditor] AI优化任务已启动, mode=${promptMode}, jobId=${jobId}`);

      const pollOptimizeStatus = async () => {
        if (!optimizeJobIdRef.current) return;
        try {
          const job = await getWorkflowStatus(optimizeJobIdRef.current);

          if (job.status === 'completed') {
            const lastTask = job.tasks?.[job.tasks.length - 1];
            const resultData = lastTask?.result_data;

            if (!isVideo) {
              // 图片提示词：使用 optimized 字段
              const optimized = resultData?.optimized || (typeof resultData === 'string' ? resultData : '');
              const negativePrompt = resultData?.negativePrompt || '';

              if (optimized) {
                // 持久化到数据库
                try {
                  const token = getAuthToken();
                  const body: any = { prompt_template: optimized };
                  if (negativePrompt) body.negative_prompt = negativePrompt;
                  const res = await fetch(`/api/storyboards/${storyboardId}/content`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify(body)
                  });
                  if (!res.ok) {
                    showToast('图片提示词保存失败', 'error');
                  }
                } catch (saveErr) {
                  console.error('[DialogEditor] 保存图片提示词失败:', saveErr);
                  showToast('图片提示词保存失败', 'error');
                }

                setPromptText(optimized);
                if (editorRef.current) {
                  editorRef.current.innerHTML = refTextToHtml(optimized, referenceImages);
                  lastRenderedRef.current = optimized;
                }
                setIsDirty(false);
              }
            } else {
              // 视频提示词：处理首尾帧分离的情况
              const actionAnalysis = resultData?.actionAnalysis;
              const videoPrompt = resultData?.videoPrompt;
              const videoStartPrompt = resultData?.videoStartPrompt;
              const videoEndPrompt = resultData?.videoEndPrompt;
              const negativePrompt = resultData?.negativePrompt || '';

              // 根据动作类型保存不同的字段
              const body: any = {};
              const savedFields: string[] = [];

              if (actionAnalysis?.useEndFrame === false) {
                if (videoPrompt) {
                  body.video_prompt = videoPrompt;
                  savedFields.push('视频提示词');
                }
              } else if (actionAnalysis?.useEndFrame === true) {
                if (videoStartPrompt) {
                  body.video_start_prompt = videoStartPrompt;
                  savedFields.push('视频首帧提示词');
                }
                if (videoEndPrompt) {
                  body.video_end_prompt = videoEndPrompt;
                  savedFields.push('视频尾帧提示词');
                }
              } else {
                const optimized = resultData?.optimized || (typeof resultData === 'string' ? resultData : '');
                if (optimized) {
                  body.video_prompt = optimized;
                  savedFields.push('视频提示词');
                }
              }

              if (negativePrompt) {
                body.negative_prompt = negativePrompt;
              }

              // 持久化到数据库
              if (Object.keys(body).length > 0) {
                try {
                  const token = getAuthToken();
                  const res = await fetch(`/api/storyboards/${storyboardId}/content`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify(body)
                  });
                  if (!res.ok) {
                    showToast('视频提示词保存失败', 'error');
                  } else if (savedFields.length > 0) {
                    showToast(`${savedFields.join('、')}已优化并保存`, 'success');
                    const displayPrompt = videoStartPrompt || videoPrompt || resultData?.optimized || '';
                    if (displayPrompt) {
                      setPromptText(displayPrompt);
                      if (editorRef.current) {
                        editorRef.current.innerHTML = refTextToHtml(displayPrompt, referenceImages);
                        lastRenderedRef.current = displayPrompt;
                      }
                      setIsDirty(false);
                    }
                  }
                } catch (saveErr) {
                  console.error('[DialogEditor] 保存视频提示词失败:', saveErr);
                  showToast('视频提示词保存失败', 'error');
                }
              }
            }

            showToast('AI 优化完成', 'success');
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

          optimizePollTimerRef.current = setTimeout(pollOptimizeStatus, 1000);
        } catch (err: any) {
          console.error('[DialogEditor] 轮询优化任务状态失败:', err);
          optimizePollTimerRef.current = setTimeout(pollOptimizeStatus, 2000);
        }
      };

      pollOptimizeStatus();
    } catch (error: any) {
      showToast(error.message || 'AI 优化失败', 'error');
      setIsOptimizing(false);
    }
  };

  // 生成图片
  const handleGenerateImage = async () => {
    if (!onGenerateImage || !storyboardId) return;
    const text = promptText.trim();
    if (!text) {
      showToast('提示词为空，无法生成', 'warning');
      return;
    }
    setIsGeneratingMedia(true);
    try {
      const isRegenerate = false;
      const target = hasAction ? (imageFrameTab === 'first' ? 'first' : 'last') : 'both';
      const result = await onGenerateImage(storyboardId, text, target, isRegenerate);
      if (!result.success) {
        showToast(result.error || '图片生成失败', 'error');
      } else {
        showToast('图片生成任务已提交', 'success');
      }
    } catch (err: any) {
      showToast(err.message || '图片生成失败', 'error');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  // 生成视频（带预检：锁定检查 + 提示词保存 + 视频校验）
  const handleGenerateVideo = async () => {
    if (!onGenerateVideo || !storyboardId) return;
    const text = promptText.trim();
    if (!text) {
      showToast('提示词为空，无法生成', 'warning');
      return;
    }

    // 先保存当前提示词
    if (onSave) {
      const saved = await onSave(text);
      if (!saved) {
        showToast('保存提示词失败', 'error');
        return;
      }
    }

    // 视频生成前校验
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/validate?type=video`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.ready) {
          const msg = data.issues.map((i: any) => i.message).join('\n');
          showToast(`无法生成视频：${msg}`, 'error');
          return;
        }
      }
    } catch {
      // 校验失败继续尝试生成
    }

    setIsGeneratingMedia(true);
    try {
      const result = await onGenerateVideo(storyboardId);
      if (!result.success) {
        showToast(result.error || '视频生成失败', 'error');
      } else {
        showToast('视频生成任务已提交', 'success');
      }
    } catch (err: any) {
      showToast(err.message || '视频生成失败', 'error');
    } finally {
      setIsGeneratingMedia(false);
    }
  };

  // 撤回优化
  const [preOptimizeText, setPreOptimizeText] = useState<string | null>(null);
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

  // 加载项目角色（已移除角色按钮，此逻辑保留供其他用途）
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
          base_appearance: c.base_appearance,
          outfit_appearance: c.outfit_appearance,
          personality: c.personality,
          description: c.description,
          imageUrl: c.image_url || c.imageUrl,
          base_model_image_url: c.base_model_image_url,
          has_base_model_views: c.has_base_model_views,
          active_state_name: c.active_state_name,
          active_state_outfit: c.active_state_outfit,
          active_state_image_url: c.active_state_image_url,
          statesCount: c.states_count || 0,
        }));
        setCharacters(mapped);
      }
    } catch (error) {
      console.error('[DialogEditor] 加载角色失败:', error);
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  // 加载项目场景（已移除场景按钮，此逻辑保留供其他用途）
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
                      className="w-full text-xs px-2 py-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none overflow-y-auto"
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
              className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed overflow-y-auto"
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
      {/* 主编辑区 */}
      <div className="flex flex-1 overflow-hidden min-h-0">
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
          {activeTab === 'sketches' ? (
            <div className="flex-1 overflow-hidden">
              <SketchFramesPanel storyboardId={storyboardId} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3">
              {renderComponentButtons()}
            </div>
          )}

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
        <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
          {/* 富文本编辑区（contentEditable） */}
          <div
            className={`flex-1 relative min-h-0 overflow-hidden ${isDraggingOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
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
              className="w-full h-full p-4 pb-12 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] overflow-y-auto focus:outline-none focus:border-[var(--accent)] empty:before:content-[attr(data-placeholder)] empty:before:text-[var(--text-muted)] empty:before:pointer-events-none"
              style={{ minHeight: '120px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            />
            {isDraggingOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/10 rounded-lg pointer-events-none">
                <span className="text-sm text-[var(--accent)]">释放以插入</span>
              </div>
            )}
            {/* 底部工具栏 - 嵌入输入框内部右下角 */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-10">
                {/* 参考图按钮 */}
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title="添加参考图"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                {/* AI 生成提示词按钮 */}
                <button
                  onClick={handleGeneratePrompt}
                  disabled={isGeneratingPrompt || isOptimizing || !promptText.trim()}
                  className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-purple-500 disabled:opacity-40 disabled:cursor-not-allowed relative"
                  title={promptMode === 'video' ? '生成视频提示词' : '生成图片提示词'}
                >
                  {isGeneratingPrompt || isOptimizing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>

                {/* 生成图片按钮 */}
                {promptMode === 'image' && onGenerateImage && (
                  <>
                    {imageModels.length > 0 && onImageModelChange && (
                      <div className="relative">
                        <select
                          value={propImageModel || ''}
                          onChange={(e) => onImageModelChange(e.target.value)}
                          className="h-7 pl-2 pr-5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer hover:border-blue-400 transition-colors"
                          aria-label="图片模型"
                        >
                          {imageModels.map((m) => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 text-[var(--text-muted)] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}
                    <button
                      onClick={handleGenerateImage}
                      disabled={isGeneratingMedia || !promptText.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-500/15 text-blue-500 text-[11px] hover:bg-blue-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingMedia ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      生成图片
                    </button>
                  </>
                )}
                {/* 生成视频按钮 */}
                {promptMode === 'video' && onGenerateVideo && (
                  <>
                    {videoModels.length > 0 && onVideoModelChange && (
                      <div className="relative">
                        <select
                          value={propVideoModel || ''}
                          onChange={(e) => onVideoModelChange(e.target.value)}
                          className="h-7 pl-2 pr-5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] focus:outline-none focus:border-rose-500 appearance-none cursor-pointer hover:border-rose-400 transition-colors"
                          aria-label="视频模型"
                        >
                          {videoModels.map((m) => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 text-[var(--text-muted)] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}
                    <button
                      onClick={handleGenerateVideo}
                      disabled={isGeneratingMedia || !promptText.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-rose-500/15 text-rose-500 text-[11px] hover:bg-rose-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingMedia ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Film className="w-3.5 h-3.5" />
                      )}
                      生成视频
                    </button>
                  </>
                )}

            </div>
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
              className="w-full text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed overflow-y-auto"
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
