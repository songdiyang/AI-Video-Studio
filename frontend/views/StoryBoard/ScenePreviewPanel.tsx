import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button, Textarea, Chip, Select, SelectItem } from '@heroui/react';
import { ImageIcon, Video, Film, Camera, Users, MapPin, Zap, X, Trash2, ZoomIn, ZoomOut, RotateCw, Maximize2, Blocks, ChevronDown, ChevronUp, History, Loader2, Pencil, Check, Plus, Search, Sparkles, Clock, Star, Shirt, Settings2, Package } from 'lucide-react';
import { StoryboardScene, DialogueLine } from './useSceneManager';
import { TaskState } from '../../hooks/useTaskRunner';
import MagicSpacePanel, { CameraGenerateParams, PaintGenerateParams, SketchGenerateParams } from './MagicSpace';
import { prefetchSketchEditor } from './MagicSpace/SketchCanvas';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { validateFrameReadiness, formatValidationMessage } from './utils/validateFrameReadiness';
// import SketchPanel from './SceneCard/SketchPanel'; // 草图功能已集成到魔术空间
import BlockEditor from './BlockEditor';
import FrameHistoryPanel from './FrameHistoryPanel';
import { BlockEditorState } from './BlockEditor/types/blockTypes';
import { bustCache } from '../../services/mediaCache';
import { getVideoModelCapabilities } from '../../services/localAI';
import { startWorkflow, getWorkflowStatus } from '../../hooks/useWorkflow';
import StoryboardLockButton from './components/StoryboardLockButton';
import VideoHistorySidebar from './components/VideoHistorySidebar';

const POPOVER_GAP = 4;
const POPOVER_EDGE = 8;

/**
 * 下拉弹层定位容器：portal 到 body 并按锚点实测定位。
 *
 * 原先弹层直接写在面板 DOM 内、用 position:fixed + 渲染期读取的
 * getBoundingClientRect() 定位，有两个问题：
 *  1) fixed 只在「无带 transform / filter / backdrop-filter 祖先」时才以视口为基准，
 *     而本面板处于可缩放、带动画的布局链中，视口坐标会被叠加祖先偏移，弹层整体跑偏；
 *  2) rect 仅在该次 render 读取，之后滚动、拖拽分隔条、窗口缩放都不会重算，位置变陈旧。
 * 这里把弹层挂到 body（脱离祖先定位基准与 overflow 裁剪），在布局后同时测量锚点与
 * 弹层自身尺寸，跟随 scroll / resize 重算，并在贴边时自动收边 / 向上翻转。
 */
const AnchoredPopover: React.FC<{
  anchorRef: React.RefObject<HTMLElement | null>;
  className?: string;
  children: React.ReactNode;
}> = ({ anchorRef, className = '', children }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const { offsetWidth: width = 0, offsetHeight: height = 0 } = popoverRef.current ?? {};
      let left = Math.min(rect.left, window.innerWidth - POPOVER_EDGE - width);
      let top = rect.bottom + POPOVER_GAP;
      // 下方放不下且上方更宽裕时，向上翻转
      if (top + height > window.innerHeight - POPOVER_EDGE && rect.top - POPOVER_GAP > height + POPOVER_EDGE) {
        top = rect.top - POPOVER_GAP - height;
      }
      setPosition({ left: Math.max(POPOVER_EDGE, left), top });
    };
    update();
    // capture=true：面板内部滚动容器同样会移动锚点
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      ref={popoverRef}
      data-anchored-popover=""
      className={className}
      style={{
        position: 'fixed',
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
        zIndex: 100,
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

/** 角色选择器：Chip 标签 + 添加下拉 + 点击预览角色长相（增强：显示白膜/服装状态） */
const CharacterTagSelector: React.FC<{
  characters: string[];
  projectCharacters: { id: number; name: string; image_url?: string; front_view_url?: string; base_appearance?: string; outfit_appearance?: string; has_base_model?: number | boolean; has_base_model_views?: number | boolean; states_count?: number; active_state_name?: string; active_state_outfit?: string; active_state_image_url?: string; base_front_view_url?: string }[];
  onSave: (characters: string[]) => void;
}> = ({ characters, projectCharacters, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [previewChar, setPreviewChar] = useState<{ name: string; imageUrl: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 弹层已 portal 到 body，点击弹层内部不应视为「点击外部」
      if (target.closest('[data-anchored-popover]')) return;
      if (containerRef.current && !containerRef.current.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  const toggleCharacter = (name: string) => {
    if (characters.includes(name)) {
      onSave(characters.filter(c => c !== name));
    } else {
      onSave([...characters, name]);
    }
  };

  const addCustom = () => {
    const trimmed = search.trim();
    if (trimmed && !characters.includes(trimmed)) {
      onSave([...characters, trimmed]);
      setSearch('');
    }
  };

  const filtered = projectCharacters.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative inline-flex min-h-6 items-center gap-1 flex-wrap">
      <Users className="w-3.5 h-3.5 text-(--text-muted) shrink-0" />
      {characters.map(name => {
        const charData = projectCharacters.find(c => c.name === name);
        const charImageUrl = charData?.active_state_image_url || charData?.base_front_view_url || charData?.front_view_url || charData?.image_url;
        const hasBase = charData?.has_base_model;
        const hasReadyViews = !!(charData?.has_base_model_views);
        const stateLabel = charData?.active_state_name;
        // 没有白膜/图片的角色显示灰色，提示资产不完善
        const isIncomplete = !hasReadyViews;
        return (
          <span
            key={name}
            className={`inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-md text-[11px] leading-4 group/char transition-colors ${
              isIncomplete
                ? 'bg-amber-500/10 text-amber-400/90 border border-dashed border-amber-500/30'
                : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
            }`}
            title={isIncomplete ? '该角色尚未生成白膜，请在资源面板完善资产' : stateLabel ? `${name} · ${stateLabel}` : name}
          >
            {charImageUrl ? (
              <img src={charImageUrl} alt={name} className={`w-3.5 h-3.5 rounded-full object-cover shrink-0 ${isIncomplete ? 'opacity-50' : ''}`} />
            ) : null}
            {charImageUrl ? (
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewChar({ name, imageUrl: charImageUrl }); }}
                className="hover:underline cursor-pointer"
                title="点击预览角色长相"
              >
                {name}
              </button>
            ) : (
              <span>{name}</span>
            )}
            {isIncomplete ? (
              <span className="text-[9px] text-orange-400/80">!</span>
            ) : (
              <>
                {Boolean(hasBase) && <Star className="w-2.5 h-2.5 text-amber-400" />}
                {stateLabel && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-pink-400/80 max-w-12 truncate">
                    <Shirt className="w-2 h-2 shrink-0" />
                    {stateLabel}
                  </span>
                )}
              </>
            )}
            <button
              onClick={() => toggleCharacter(name)}
              className="opacity-0 pointer-events-none group-hover/char:opacity-100 group-hover/char:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:text-red-400 transition-opacity"
              title={`移除角色 ${name}`}
              aria-label={`移除角色 ${name}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-[22px] h-[22px] flex items-center justify-center rounded-md border border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:text-(--accent) hover:border-(--accent)/40 transition-colors"
        title="添加角色"
        aria-label="添加角色"
      >
        <Plus className="w-3 h-3" />
      </button>

      {isOpen && (
        <AnchoredPopover anchorRef={containerRef} className="w-56 bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-(--border-color) pb-1 mb-1">
            <Search className="w-3 h-3 text-(--text-muted)" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-(--text-primary) placeholder-(--text-muted) outline-none"
              placeholder="搜索或输入新角色名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-(--text-muted) px-2 py-1">项目暂无角色资源</div>
            )}
            {filtered.map(c => {
              const selected = characters.includes(c.name);
              const charImg = c.active_state_image_url || c.base_front_view_url || c.front_view_url || c.image_url;
              const hasReadyState = !!(c.has_base_model_views);
              const isDisabled = !hasReadyState;
              return (
                <button
                  key={c.id}
                  onClick={() => !isDisabled && toggleCharacter(c.name)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-2 ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed text-(--text-muted)'
                      : selected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-(--bg-card-hover) text-(--text-secondary)'
                  }`}
                  title={isDisabled ? '请先生成白膜设定图后再添加到分镜' : ''}
                >
                  {selected ? <Check className="w-3 h-3 shrink-0" /> : <div className="w-3 h-3 shrink-0" />}
                  {charImg ? <img src={charImg} alt={c.name} className="w-4 h-4 rounded-full object-cover shrink-0" /> : null}
                  <span className="truncate">{c.name}</span>
                  {isDisabled ? (
                    <span className="text-[9px] text-red-400/80 shrink-0 whitespace-nowrap">缺少状态</span>
                  ) : (
                    <>
                      {Boolean(c.has_base_model) && <Star className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                      {c.active_state_name && (
                        <span className="text-[9px] text-pink-400/80 truncate max-w-16 shrink-0">
                          <Shirt className="w-2 h-2 inline" /> {c.active_state_name}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {search.trim() && !projectCharacters.find(c => c.name === search.trim()) && (
            <button
              onClick={addCustom}
              className="w-full text-left px-2 py-1 rounded text-xs text-(--accent) hover:bg-(--accent)/10 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 添加自定义角色 "{search.trim()}"
            </button>
          )}
        </AnchoredPopover>
      )}

      {/* 角色图片预览弹出层 */}
      {previewChar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewChar(null)}
        >
          <div
            className="relative max-w-sm bg-(--bg-card) rounded-xl shadow-2xl overflow-hidden border border-(--border-color)"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-(--border-color)">
              <span className="text-sm font-semibold text-(--text-primary)">{previewChar.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const overlay = document.getElementById('char-fullscreen-preview');
                    if (overlay) overlay.style.display = 'flex';
                  }}
                  className="p-1.5 rounded hover:bg-(--bg-hover) transition-colors text-(--text-muted)"
                  title="全屏放大"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewChar(null)}
                  className="p-1.5 rounded hover:bg-(--bg-hover) transition-colors text-(--text-muted)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* 图片 - 可点击放大 */}
            <div className="p-3">
              <img
                src={previewChar.imageUrl}
                alt={previewChar.name}
                className="w-full max-h-80 object-contain rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                onClick={() => {
                  const overlay = document.getElementById('char-fullscreen-preview');
                  if (overlay) overlay.style.display = 'flex';
                }}
              />
            </div>
          </div>

          {/* 全屏放大层 */}
          <div
            id="char-fullscreen-preview"
            className="fixed inset-0 z-60 hidden items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => {
              const overlay = document.getElementById('char-fullscreen-preview');
              if (overlay) overlay.style.display = 'none';
            }}
          >
            <img
              src={previewChar.imageUrl}
              alt={previewChar.name}
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={() => {
                const overlay = document.getElementById('char-fullscreen-preview');
                if (overlay) overlay.style.display = 'none';
              }}
            >
              <X className="w-5 h-5" />
            </button>
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">{previewChar.name}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/** 道具选择器：多选标签 + 添加下拉 */
const PropsTagSelector: React.FC<{
  props: string[];
  projectProps: { id: number; name: string; image_url?: string }[];
  onSave: (props: string[]) => void;
}> = ({ props: selectedProps, projectProps, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 弹层已 portal 到 body，点击弹层内部不应视为「点击外部」
      if (target.closest('[data-anchored-popover]')) return;
      if (containerRef.current && !containerRef.current.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  const toggleProp = (name: string) => {
    if (selectedProps.includes(name)) {
      onSave(selectedProps.filter(p => p !== name));
    } else {
      onSave([...selectedProps, name]);
    }
  };

  const addCustom = () => {
    const trimmed = search.trim();
    if (trimmed && !selectedProps.includes(trimmed)) {
      onSave([...selectedProps, trimmed]);
      setSearch('');
    }
  };

  const filtered = projectProps.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative inline-flex min-h-6 items-center gap-1 flex-wrap">
      <Package className="w-3.5 h-3.5 text-(--text-muted) shrink-0" />
      {selectedProps.length === 0 && (
        <span className="text-(--text-muted) text-[11px] leading-4">道具</span>
      )}
      {selectedProps.map(name => {
        const propData = projectProps.find(p => p.name === name);
        return (
          <span
            key={name}
            className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-md text-[11px] leading-4 bg-teal-500/10 text-teal-300 border border-teal-500/20 group/prop"
            title={name}
          >
            {propData?.image_url ? (
              <img src={propData.image_url} alt={name} className="w-3.5 h-3.5 rounded object-cover shrink-0" />
            ) : null}
            <span className="truncate max-w-20">{name}</span>
            <button
              onClick={() => toggleProp(name)}
              className="opacity-0 pointer-events-none group-hover/prop:opacity-100 group-hover/prop:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:text-red-400 transition-opacity"
              title={`移除道具 ${name}`}
              aria-label={`移除道具 ${name}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-[22px] h-[22px] flex items-center justify-center rounded-md border border-(--border-color) bg-(--bg-input) text-(--text-muted) hover:text-teal-400 hover:border-teal-500/40 transition-colors"
        title="添加道具"
        aria-label="添加道具"
      >
        <Plus className="w-3 h-3" />
      </button>

      {isOpen && (
        <AnchoredPopover anchorRef={containerRef} className="w-48 bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-(--border-color) pb-1 mb-1">
            <Search className="w-3 h-3 text-(--text-muted)" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-(--text-primary) placeholder-(--text-muted) outline-none"
              placeholder="搜索或输入道具名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-(--text-muted) px-2 py-1">项目暂无道具资源</div>
            )}
            {filtered.map(p => {
              const selected = selectedProps.includes(p.name);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProp(p.name)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-2 ${
                    selected ? 'bg-teal-500/20 text-teal-400' : 'hover:bg-(--bg-card-hover) text-(--text-secondary)'
                  }`}
                >
                  {selected ? <Check className="w-3 h-3 shrink-0" /> : <div className="w-3 h-3 shrink-0" />}
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-4 h-4 rounded object-cover shrink-0" /> : null}
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
          {search.trim() && !projectProps.find(p => p.name === search.trim()) && (
            <button
              onClick={addCustom}
              className="w-full text-left px-2 py-1 rounded text-xs text-teal-400 hover:bg-teal-500/10 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 添加自定义道具 "{search.trim()}"
            </button>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
};

/** 场景选择器：单选下拉 */
const SceneDropdownSelector: React.FC<{
  location: string;
  projectScenes: { id: number; name: string; description?: string }[];
  onSave: (location: string) => void;
}> = ({ location, projectScenes, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 弹层已 portal 到 body，点击弹层内部不应视为「点击外部」
      if (target.closest('[data-anchored-popover]')) return;
      if (containerRef.current && !containerRef.current.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  const selectScene = (name: string) => {
    onSave(name);
    setIsOpen(false);
    setSearch('');
  };

  const filtered = projectScenes.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[22px] max-w-[150px] items-center gap-1 px-1.5 rounded-md border border-(--border-color) bg-(--bg-input) text-(--text-secondary) cursor-pointer hover:text-(--text-primary) hover:border-(--accent)/40 transition-colors text-[11px] leading-4 group"
        title={location ? `影棚：${location}（点击更换）` : '点击选择影棚'}
      >
        <MapPin className="w-3 h-3 text-(--text-muted)" />
        <span className="truncate">{location || '选择影棚'}</span>
        <ChevronDown className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>

      {isOpen && (
        <AnchoredPopover anchorRef={containerRef} className="w-56 bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-(--border-color) pb-1 mb-1">
            <Search className="w-3 h-3 text-(--text-muted)" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-(--text-primary) placeholder-(--text-muted) outline-none"
              placeholder="搜索影棚..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-(--text-muted) px-2 py-1">项目暂无影棚资源</div>
            )}
            {filtered.map(s => (
              <button
                key={s.id}
                onClick={() => selectScene(s.name)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  s.name === location ? 'bg-green-500/20 text-green-400' : 'hover:bg-(--bg-card-hover) text-(--text-secondary)'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {search.trim() && !projectScenes.find(s => s.name === search.trim()) && (
            <button
              onClick={() => selectScene(search.trim())}
              className="w-full text-left px-2 py-1 rounded text-xs text-(--accent) hover:bg-(--accent)/10 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 使用自定义影棚 "{search.trim()}"
            </button>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
};

// 分镜时长选择器 - 可选范围由所选视频模型能力决定（默认兜底 4~12 秒）
export interface DurationRange { minDuration: number; maxDuration: number; }

const DurationSelector: React.FC<{
  duration: number;
  onSave: (duration: number) => void;
  range?: DurationRange;
}> = ({ duration, onSave, range }) => {
  const min = range?.minDuration ?? 4;
  const max = range?.maxDuration ?? 12;
  const durationOptions = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 弹层已 portal 到 body，点击弹层内部不应视为「点击外部」
      if (target.closest('[data-anchored-popover]')) return;
      if (containerRef.current && !containerRef.current.contains(target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isCustomMode) {
      customInputRef.current?.focus();
    }
  }, [isOpen, isCustomMode]);

  const selectDuration = (val: number) => {
    onSave(val);
    setIsOpen(false);
    setIsCustomMode(false);
    setCustomValue('');
  };

  const handleCustomConfirm = () => {
    const val = parseFloat(customValue);
    if (val >= min && val <= max) {
      onSave(val);
      setIsOpen(false);
      setIsCustomMode(false);
      setCustomValue('');
    }
  };

  // 判断当前 duration 是否在预设选项中
  const isPresetValue = durationOptions.includes(duration);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[22px] items-center gap-1 px-1.5 rounded-md border border-(--border-color) bg-(--bg-input) text-(--text-secondary) cursor-pointer hover:text-(--text-primary) hover:border-(--accent)/40 transition-colors text-[11px] leading-4 group"
        title={`时长 ${duration || 3}s（点击修改）`}
      >
        <Clock className="w-3 h-3 text-(--text-muted)" />
        <span className={!isPresetValue && duration ? 'text-(--accent) font-medium' : ''}>{duration || 3}s</span>
        <ChevronDown className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>

      {isOpen && (
        <AnchoredPopover anchorRef={containerRef} className="bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl py-1 min-w-20 max-h-60 overflow-y-auto">
          {durationOptions.map(val => (
            <button
              key={val}
              onClick={() => selectDuration(val)}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                duration === val
                  ? 'text-(--accent) bg-(--accent)/10 font-medium'
                  : 'text-(--text-secondary) hover:bg-(--bg-card-hover) hover:text-(--text-primary)'
              }`}
            >
              {val}s
            </button>
          ))}
          {/* 自定义输入 */}
          <div className="border-t border-(--border-color) mt-1 pt-1 px-2">
            {isCustomMode ? (
              <div className="flex items-center gap-1">
                <input
                  ref={customInputRef}
                  type="number"
                  min={min}
                  max={max}
                  step="1"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomConfirm(); if (e.key === 'Escape') { setIsCustomMode(false); setCustomValue(''); } }}
                  placeholder="秒数"
                  className="w-16 px-1.5 py-1 text-xs bg-(--bg-input) border border-(--border-color) rounded text-(--text-primary) outline-none focus:border-(--accent)"
                />
                <button
                  onClick={handleCustomConfirm}
                  className="px-1.5 py-1 text-xs text-(--accent) hover:bg-(--accent)/10 rounded transition-colors"
                  title="确认"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setIsCustomMode(false); setCustomValue(''); }}
                  className="px-1.5 py-1 text-xs text-(--text-muted) hover:bg-(--bg-card-hover) rounded transition-colors"
                  title="取消"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setIsCustomMode(true); setCustomValue(String(duration || '')); }}
                className={`w-full py-1.5 text-left text-xs transition-colors ${
                  !isPresetValue && duration
                    ? 'text-(--accent) bg-(--accent)/10 font-medium'
                    : 'text-(--text-muted) hover:bg-(--bg-card-hover) hover:text-(--text-primary)'
                }`}
              >
                {!isPresetValue && duration ? `${duration}s (自定义)` : '自定义时长...'}
              </button>
            )}
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
};

export interface SceneMetaBarProps {
  scene: StoryboardScene;
  projectCharacters: { id: number; name: string; image_url?: string; front_view_url?: string; base_appearance?: string; outfit_appearance?: string; has_base_model?: number | boolean; has_base_model_views?: number | boolean; states_count?: number; active_state_name?: string; active_state_outfit?: string; active_state_image_url?: string; base_front_view_url?: string }[];
  projectScenes: { id: number; name: string; description?: string }[];
  projectProps: { id: number; name: string; image_url?: string }[];
  videoDurationRange?: DurationRange;
  onUpdateCharactersAndLocation?: (characters: string[], location: string, characterIds?: number[], sceneId?: number) => Promise<boolean> | void;
  onUpdateProps?: (props: string[]) => Promise<boolean> | void;
  onUpdateScene?: (updates: Partial<StoryboardScene>) => void;
  onUpdateDuration?: (duration: number) => Promise<boolean> | void;
}

/** 分镜元数据栏：角色 / 道具 / 影棚 / 时长，在预览信息区与底部编辑器头部复用。 */
export const SceneMetaBar: React.FC<SceneMetaBarProps> = ({
  scene, projectCharacters, projectScenes, projectProps, videoDurationRange,
  onUpdateCharactersAndLocation, onUpdateProps, onUpdateScene, onUpdateDuration,
}) => {
  const syncCharactersAndLocation = (characters: string[], location: string) => {
    const ids = characters
      .map(name => projectCharacters.find(c => c.name === name)?.id)
      .filter((id): id is number => id !== undefined);
    void onUpdateCharactersAndLocation?.(characters, location, ids, projectScenes.find(s => s.name === location)?.id);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs min-w-0">
      <CharacterTagSelector
        characters={scene.characters || []}
        projectCharacters={projectCharacters}
        onSave={(chars) => syncCharactersAndLocation(chars, scene.location || '')}
      />
      <span className="self-center w-px h-3.5 bg-(--border-color)" aria-hidden="true" />
      <PropsTagSelector
        props={scene.props || []}
        projectProps={projectProps}
        onSave={(nextProps) => {
          onUpdateScene?.({ props: nextProps });
          void onUpdateProps?.(nextProps);
        }}
      />
      <span className="self-center w-px h-3.5 bg-(--border-color)" aria-hidden="true" />
      <SceneDropdownSelector
        location={scene.location || ''}
        projectScenes={projectScenes}
        onSave={(location) => syncCharactersAndLocation(scene.characters || [], location)}
      />
      <span className="self-center w-px h-3.5 bg-(--border-color)" aria-hidden="true" />
      <DurationSelector
        duration={scene.duration || 3}
        range={videoDurationRange}
        onSave={(value) => {
          onUpdateScene?.({ duration: value });
          void onUpdateDuration?.(value);
        }}
      />
    </div>
  );
};

/** 分镜描述编辑器 */
const DescriptionEditor: React.FC<{
  scene: StoryboardScene;
  projectId?: number | null;
  multimodalModel?: string;
  onUpdateBaseDescription?: (baseDescription: string) => Promise<boolean>;
  onUpdateDescription?: (description: string) => Promise<boolean>;
}> = ({ scene, projectId, multimodalModel, onUpdateBaseDescription, onUpdateDescription }) => {
  const [text, setText] = useState(scene.baseDescription || scene.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { showToast } = useToast();

  // 当外部 scene 变化时同步文本
  useEffect(() => {
    setText(scene.baseDescription || scene.description || '');
  }, [scene.id, scene.baseDescription, scene.description]);

  // 防抖保存
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (value: string) => {
    setText(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (onUpdateBaseDescription) {
        setIsSaving(true);
        await onUpdateBaseDescription(value);
        setIsSaving(false);
      }
    }, 800);
  };

  // 一键双优化：同时启动图片和视频提示词优化工作流
  const handleDualOptimize = async () => {
    const baseText = text.trim();
    if (!baseText) {
      showToast('请先输入分镜描述', 'warning');
      return;
    }
    if (!projectId) {
      showToast('缺少项目信息', 'warning');
      return;
    }
    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再优化提示词', 'warning');
      return;
    }

    // 轮询单个工作流直到完成，返回完整 result_data
    const pollUntilDone = async (jobId: number | string): Promise<any> => {
      const maxAttempts = 180; // 最长 ~3 分钟
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const job = await getWorkflowStatus(String(jobId));
          if (job.status === 'completed') {
            const lastTask = job.tasks?.[job.tasks.length - 1];
            return lastTask?.result_data || null;
          }
          if (job.status === 'failed' || job.status === 'cancelled') {
            return null;
          }
        } catch (e) {
          console.warn('[DescriptionEditor] 轮询失败:', e);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      return null;
    };

    setIsOptimizing(true);
    try {
      // 并发启动两个工作流
      const [imageJob, videoJob] = await Promise.all([
        startWorkflow('single_image_prompt_optimization', projectId, {
          storyboardId: scene.id,
          prompt: baseText
        }),
        startWorkflow('single_video_prompt_optimization', projectId, {
          storyboardId: scene.id,
          prompt: baseText,
          multimodalModel
        })
      ]);
      console.log('[DescriptionEditor] 双优化任务已启动:', { image: imageJob.jobId, video: videoJob.jobId });
      showToast('提示词优化中，请稍候...', 'info');

      // 并发轮询两个任务
      const [imageRes, videoRes] = await Promise.all([
        pollUntilDone(imageJob.jobId),
        pollUntilDone(videoJob.jobId)
      ]);

      // 分别持久化图片和视频结果
      const savedResults: string[] = [];
      
      // 图片提示词持久化
      if (imageRes?.optimized) {
        try {
          const body: any = { prompt_template: imageRes.optimized };
          if (imageRes.negativePrompt) body.negative_prompt = imageRes.negativePrompt;
          const res = await fetch(`/api/storyboards/${scene.id}/content`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
          });
          if (res.ok) savedResults.push('图片提示词');
        } catch (e) {
          console.error('[DescriptionEditor] 保存图片提示词失败:', e);
        }
      }

      // 视频提示词持久化（根据动作类型选择字段）
      const actionAnalysis = videoRes?.actionAnalysis;
      if (videoRes) {
        try {
          const body: any = {};

          if (actionAnalysis?.useEndFrame === false) {
            // 自由运动模式：保存单个 video_prompt
            if (videoRes.videoPrompt) {
              body.video_prompt = videoRes.videoPrompt;
              savedResults.push('视频提示词');
            }
          } else if (actionAnalysis?.useEndFrame === true) {
            // 强约束模式：保存首尾帧
            if (videoRes.videoStartPrompt) {
              body.video_start_prompt = videoRes.videoStartPrompt;
              savedResults.push('视频首帧提示词');
            }
            if (videoRes.videoEndPrompt) {
              body.video_end_prompt = videoRes.videoEndPrompt;
              savedResults.push('视频尾帧提示词');
            }
          } else {
            // 兼容旧格式
            if (videoRes.optimized) {
              body.video_prompt = videoRes.optimized;
              savedResults.push('视频提示词');
            }
          }

          if (videoRes.negativePrompt) body.negative_prompt = videoRes.negativePrompt;

          if (Object.keys(body).length > 0) {
            const res = await fetch(`/api/storyboards/${scene.id}/content`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body)
            });
            if (!res.ok) {
              // 移除失败的结果
              savedResults.splice(savedResults.indexOf('视频提示词'), 1);
              savedResults.splice(savedResults.indexOf('视频首帧提示词'), 1);
              savedResults.splice(savedResults.indexOf('视频尾帧提示词'), 1);
            }
          }
        } catch (e) {
          console.error('[DescriptionEditor] 保存视频提示词失败:', e);
        }
      }

      if (savedResults.length > 0) {
        showToast(`${savedResults.join('、')}已保存`, 'success');
      } else {
        showToast('提示词生成失败，请重试', 'error');
      }
    } catch (err: any) {
      console.error('[DescriptionEditor] 一键双优化失败:', err);
      showToast(err.message || '优化任务启动失败', 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-2">
      {/* 原始分镜描述 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-(--text-muted)">
          分镜描述（AI将根据此描述生成图片和视频提示词）
        </span>
        {isSaving && <span className="text-[10px] text-(--text-muted)">保存中...</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={scene.isLocked}
        className="flex-1 w-full bg-(--bg-input) border border-(--border-color) rounded-lg p-3 text-sm text-(--text-primary) resize-none focus:outline-none focus:border-(--accent) overflow-y-auto"
        placeholder="描述这个分镜的画面内容：影棚、角色、动作、情绪、镜头等..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-(--text-muted)">
          {text.length} 字
        </span>
        <button
          onClick={handleDualOptimize}
          disabled={isOptimizing || !text.trim() || scene.isLocked}
          className="px-3 py-1.5 rounded-lg bg-(--accent) text-white text-xs font-medium hover:bg-(--accent)/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isOptimizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          一键生成双提示词
        </button>
      </div>

      {/* AI优化后的图片提示词（只读展示） */}
      {scene.description && (
        <>
          <div className="border-t border-(--border-color) pt-2 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-400">
                图片提示词（AI优化后）
              </span>
              <span className="text-[10px] text-(--text-muted)">只读</span>
            </div>
            <div className="mt-1.5 w-full bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-sm text-(--text-secondary) overflow-y-auto max-h-30">
              {scene.description}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export interface ScenePreviewPanelProps {
  scene: StoryboardScene | null;
  sceneIndex: number;
  projectId?: number | null;
  scriptId?: number | null;
  onUpdateDescription: (description: string) => Promise<boolean>;
  onUpdateBaseDescription?: (baseDescription: string) => Promise<boolean>;
  onUpdateVideoPrompt?: (videoPrompt: string) => Promise<boolean>;
  onUpdateFirstFramePrompt?: (firstFramePrompt: string) => Promise<boolean>;
  onUpdateLastFramePrompt?: (lastFramePrompt: string) => Promise<boolean>;
  onUpdateDialogues?: (dialogues: DialogueLine[]) => Promise<boolean>;
  onUpdateVoiceover?: (voiceover: string) => Promise<boolean>;
  onUpdateCharactersAndLocation?: (characters: string[], location: string, characterIds?: number[], sceneId?: number) => Promise<boolean>;
  projectCharacters?: { id: number; name: string; image_url?: string; front_view_url?: string; base_appearance?: string; outfit_appearance?: string; has_base_model?: number; has_base_model_views?: number; states_count?: number; active_state_name?: string; active_state_outfit?: string; active_state_image_url?: string; base_front_view_url?: string }[];
  projectScenes?: { id: number; name: string; description?: string }[];
  projectProps?: { id: number; name: string; image_url?: string }[];
  onUpdateProps?: (props: string[]) => Promise<boolean>;
  onGenerateImage: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onGenerateWithCamera?: (id: number, cameraParams: CameraGenerateParams) => Promise<{ success: boolean; error?: string }>;
  onGenerateWithPaint?: (id: number, paintParams: PaintGenerateParams) => Promise<{ success: boolean; error?: string }>;
  onGenerateWithSketch?: (id: number, sketchParams: SketchGenerateParams) => Promise<{ success: boolean; error?: string }>;

  onUpdateScene?: (updates: Partial<StoryboardScene>) => void;
  onUpdateDuration?: (duration: number) => Promise<boolean>;
  imageTask?: TaskState;
  videoTask?: TaskState;
  /** 外部控制导演空间显隐（未提供时使用内部状态） */
  directorSpaceOpen?: boolean;
  /** 导演空间切换回调（外部控制时用于切换显隐） */
  onDirectorSpaceToggle?: () => void;
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
  /** 当前多模态模型（用于视觉分析） */
  multimodalModel?: string;
  /** 多模态模型切换回调 */
  onMultimodalModelChange?: (model: string) => void;
  /** 隐藏导演空间（用于在BottomPanel中独立显示） */
  hideDirectorSpace?: boolean;
}

const ScenePreviewPanel: React.FC<ScenePreviewPanelProps> = ({
  scene,
  sceneIndex,
  projectId,
  scriptId,
  onUpdateDescription,
  onUpdateBaseDescription,
  onUpdateVideoPrompt,
  onUpdateFirstFramePrompt,
  onUpdateLastFramePrompt,
  onUpdateDialogues,
  onUpdateVoiceover,
  onUpdateCharactersAndLocation,
  projectCharacters = [],
  projectScenes = [],
  projectProps = [],
  onUpdateProps,
  onGenerateImage,
  onGenerateVideo,
  onGenerateWithCamera,
  onGenerateWithPaint,
  onGenerateWithSketch,
  multimodalModel,
  onMultimodalModelChange,

  onUpdateScene,
  onUpdateDuration,
  imageTask,
  videoTask,
  directorSpaceOpen,
  onDirectorSpaceToggle,
  models = [],
  imageModel: propImageModel,
  videoModel: propVideoModel,
  onImageModelChange,
  onVideoModelChange,
  hideDirectorSpace = false
}) => {
  const [showStartFrame, setShowStartFrame] = useState(true);
  const [promptMode, setPromptMode] = useState<'description' | 'image' | 'video'>('description');
  // 图片提示词模式下的首/尾帧子标签（两个独立编辑区）
  const [imageFrameTab, setImageFrameTab] = useState<'first' | 'last'>('first');
  const [showHistory, setShowHistory] = useState(false);
  const [historyVersions, setHistoryVersions] = useState<{ id: number | string; label: string; firstFrameUrl?: string; lastFrameUrl?: string; videoUrl?: string | null }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // 历史版本面板拖拽状态
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const [historyPanelPos, setHistoryPanelPos] = useState({ x: 0, y: 0 });
  const isDraggingHistory = useRef(false);
  const dragStartHistory = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  const [showVideoHistory, setShowVideoHistory] = useState(false);
  const [showMagicSpace, setShowMagicSpace] = useState(false);
  const [magicSpaceInitialMode, setMagicSpaceInitialMode] = useState<'camera' | 'paint' | 'expand' | 'sketch'>('paint');
  // 历史版本预览状态：临时存储预览的帧 URL，不永久修改场景数据
  const [previewFrameUrl, setPreviewFrameUrl] = useState<string | null>(null);
  const [previewFrameType, setPreviewFrameType] = useState<'first' | 'last' | null>(null);
  // 预览阶段切换：sketch | first | last | video
  const [previewStage, setPreviewStage] = useState<'sketch' | 'first' | 'last' | 'video'>('first');
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 空闲预热草图编辑器（Excalidraw chunk 较大）：面板挂载后趁空闲提前下载，
  // 用户真正打开草图时 React.lazy 直接命中缓存，几乎无转场等待。
  useEffect(() => {
    const w = window as any;
    let handle: ReturnType<typeof setTimeout> | number | undefined;
    if (typeof w.requestIdleCallback === 'function') {
      handle = w.requestIdleCallback(() => prefetchSketchEditor(), { timeout: 4000 });
    } else {
      handle = setTimeout(() => prefetchSketchEditor(), 1500);
    }
    return () => {
      if (typeof w.cancelIdleCallback === 'function' && typeof handle === 'number') w.cancelIdleCallback(handle);
      else if (typeof handle === 'number') clearTimeout(handle);
    };
  }, []);

  // 模型过滤
  const imageModels = useMemo(() => {
    const uniqueMap = new Map<string, typeof models[number]>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'IMAGE').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);
  const videoModels = useMemo(() => {
    const uniqueMap = new Map<string, typeof models[number]>();
    models.filter(m => (m.type || m.category)?.toUpperCase() === 'VIDEO').forEach(m => {
      if (!uniqueMap.has(m.name)) uniqueMap.set(m.name, m);
    });
    return Array.from(uniqueMap.values());
  }, [models]);

  // 当前选中视频模型的时长能力范围（供分镜时长选择器使用）
  const videoDurationRange: DurationRange = useMemo(() => {
    const cap = getVideoModelCapabilities(propVideoModel || '');
    return { minDuration: cap.minDuration, maxDuration: cap.maxDuration };
  }, [propVideoModel]);

  // 追踪编辑器当前文本（可能未保存）
  const [currentEditorText, setCurrentEditorText] = useState<string>('');
  useEffect(() => {
    if (scene) {
      let text = '';
      if (promptMode === 'video') {
        text = scene.videoPrompt || '';
      } else if (promptMode === 'image') {
        if (scene.hasAction) {
          text = imageFrameTab === 'first'
            ? (scene.firstFramePrompt || scene.description || '')
            : (scene.lastFramePrompt || scene.description || '');
        } else {
          text = scene.firstFramePrompt || scene.description || '';
        }
      } else {
        text = scene.baseDescription || scene.description || '';
      }
      setCurrentEditorText(text);
    }
  }, [scene?.id, scene?.description, scene?.videoPrompt, scene?.firstFramePrompt, scene?.lastFramePrompt, promptMode, imageFrameTab]);

  // 切换分镜时清除历史版本预览状态
  useEffect(() => {
    setPreviewFrameUrl(null);
    setPreviewFrameType(null);
    setShowHistory(false);
    setHistoryVersions([]);
  }, [scene?.id]);

  // 加载历史版本列表（用于右上角下拉选择）
  const loadHistoryVersions = async () => {
    if (!scene) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/storyboards/${scene.id}/frame-history`);
      if (res.ok) {
        const data = await res.json();
        const versions = (data.versions || []).map((v: any, idx: number) => ({
          id: v.batchId || `v${v.versionNumber}-${idx}`,
          label: `版本 ${v.versionNumber}${v.isCurrent ? ' (当前)' : ''}`,
          firstFrameUrl: v.firstFrame?.frame_url,
          lastFrameUrl: v.lastFrame?.frame_url,
          videoUrl: v.videoUrl,
        }));
        setHistoryVersions(versions);
      }
    } catch (e) {
      console.error('[ScenePreviewPanel] 加载历史版本失败:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 恢复指定历史版本
  const restoreHistoryVersion = async (version: typeof historyVersions[0]) => {
    if (!scene || !version) return;
    try {
      const body: Record<string, unknown> = {};
      if (typeof version.id === 'string' && version.id.startsWith('v')) {
        body.historyId = parseInt(version.id.split('-')[0].replace('v', ''));
      } else {
        body.batchId = version.id;
      }
      const res = await fetch(`/api/storyboards/${scene.id}/frame-history/restore`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const result = await res.json();
        if (onUpdateScene) {
          const updates: Partial<StoryboardScene> = {};
          if (result.restoredFirstFrame || version.firstFrameUrl) {
            updates.startFrame = result.restoredFirstFrame || version.firstFrameUrl;
            updates.imageUrl = result.restoredFirstFrame || version.firstFrameUrl;
          }
          if (result.restoredLastFrame || version.lastFrameUrl) {
            updates.endFrame = result.restoredLastFrame || version.lastFrameUrl;
          }
          updates.videoUrl = result.restoredVideoUrl !== undefined ? result.restoredVideoUrl : (version.videoUrl || undefined);
          onUpdateScene(updates);
        }
        showToast('版本已恢复', 'success');
        setHistoryVersions([]);
      }
    } catch (e) {
      console.error('[ScenePreviewPanel] 恢复版本失败:', e);
      showToast('恢复版本失败', 'error');
    }
  };

  const isGeneratingImage = imageTask?.status === 'pending' || imageTask?.status === 'running';
  const isGeneratingVideo = videoTask?.status === 'pending' || videoTask?.status === 'running';
  const isGenerating = isGeneratingImage || isGeneratingVideo;

  // 生成进度百分比
  const generatingProgress = isGeneratingImage
    ? (imageTask?.progress ?? 0)
    : isGeneratingVideo
      ? (videoTask?.progress ?? 0)
      : 0;

  // 预检：生成首尾帧前校验
  const validateForFrame = async (): Promise<{ ready: boolean; blocking: boolean; message?: string }> => {
    if (!projectId || !scene) return { ready: true, blocking: false };
    try {
      const result = await validateFrameReadiness(
        projectId,
        scene.characters || [],
        scene.location || '',
        scriptId || undefined,
        scene.id
      );
      if (!result.ready) {
        const msg = formatValidationMessage(result);
        return {
          ready: false,
          blocking: result.blockingIssues.length > 0,
          message: msg
        };
      }
      return { ready: true, blocking: false };
    } catch {
      return { ready: true, blocking: false };
    }
  };

  // 预检：生成视频前校验
  const validateForVideo = async (): Promise<{ ready: boolean; message?: string }> => {
    if (!scene) return { ready: true };
    try {
      const res = await fetch(`/api/storyboards/${scene.id}/validate?type=video`);
      if (!res.ok) return { ready: true };
      const data = await res.json();
      if (!data.ready) {
        const msg = data.issues.map((i: any) => i.message).join('\n');
        return { ready: false, message: msg };
      }
      return { ready: true };
    } catch {
      return { ready: true };
    }
  };

  // 生成前先保存当前编辑器文本
  const saveBeforeGenerate = async (): Promise<boolean> => {
    if (!scene) return false;
    const textToSave = currentEditorText.trim();
    if (!textToSave) {
      showToast('分镜描述不能为空', 'error');
      return false;
    }
    // 如果文本与已保存的不同，先保存
    if (textToSave !== scene.description) {
      try {
        const success = await onUpdateDescription(textToSave);
        if (!success) {
          showToast('保存分镜描述失败', 'error');
          return false;
        }
      } catch {
        showToast('保存分镜描述失败', 'error');
        return false;
      }
    }
    return true;
  };

  // 生成首尾帧
  const handleGenerateImage = async () => {
    if (!scene) return;

    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再生成图片', 'warning');
      return;
    }

    // 先保存当前编辑器文本
    const saved = await saveBeforeGenerate();
    if (!saved) return;
    
    const check = await validateForFrame();
    if (!check.ready) {
      if (check.blocking) {
        showToast(`无法生成首尾帧：${check.message}`, 'error');
        return;
      }
      const proceed = await confirm({
        title: '资产不完整',
        message: `以下资产不完整，生成效果可能不一致：\n\n${check.message}\n\n是否仍然继续生成？`,
        type: 'warning',
        confirmText: '继续生成'
      });
      if (!proceed) return;
    }
    
    // 判断是否为重新生成（已有帧时）
    const isRegenerate = !!(scene.startFrame || scene.endFrame);
    
    // 使用当前编辑器文本（而非 scene.description）
    // 重新生成时传递 forceRegenerate: true，确保不使用现有帧作为参考
    const result = await onGenerateImage(scene.id, currentEditorText.trim(), undefined, isRegenerate);
    if (!result.success) {
      showToast(result.error || '图片生成失败', 'error');
    }
  };

  // 生成视频（已移至 BlockEditor 输入框内，保留此函数供其他组件调用）
  const handleGenerateVideo = async () => {
    if (!scene) return;

    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再生成视频', 'warning');
      return;
    }

    // 先保存当前编辑器文本
    const saved = await saveBeforeGenerate();
    if (!saved) return;
    
    const check = await validateForVideo();
    if (!check.ready) {
      showToast(`无法生成视频：${check.message}`, 'error');
      return;
    }
    
    const result = await onGenerateVideo(scene.id);
    if (!result.success) {
      showToast(result.error || '视频生成失败', 'error');
    }
  };

  // 删除帧（全部）
  const handleDeleteFrames = useCallback(async () => {
    if (!scene) return;
    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再删除帧', 'warning');
      return;
    }
    try {
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startFrame: null, endFrame: null })
      });
      if (onUpdateScene) {
        onUpdateScene({ startFrame: undefined, endFrame: undefined, imageUrl: undefined });
      }
      showToast('已删除首尾帧', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除首尾帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast]);

  // 独立删除首帧
  const handleDeleteFirstFrame = useCallback(async () => {
    if (!scene) return;
    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再删除首帧', 'warning');
      return;
    }
    const confirmed = await confirm({
      title: '删除首帧',
      message: scene.videoUrl
        ? '该分镜已生成视频，删除首帧可能需要重新生成视频。\n\n确定要删除首帧吗？尾帧将保留。'
        : '确定要删除首帧吗？尾帧将保留，下次生成时可以参考尾帧。',
      type: scene.videoUrl ? 'warning' : 'danger',
      confirmText: '删除首帧',
      cancelText: '取消'
    });
    if (!confirmed) return;
    try {
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firstFrameUrl: null })
      });
      if (onUpdateScene) {
        onUpdateScene({ startFrame: undefined, imageUrl: scene.endFrame || undefined });
      }
      setShowStartFrame(false); // 切换到尾帧显示
      showToast('已删除首帧，尾帧已保留', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除首帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast, confirm]);

  // 独立删除尾帧
  const handleDeleteLastFrame = useCallback(async () => {
    if (!scene) return;
    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再删除尾帧', 'warning');
      return;
    }
    const confirmed = await confirm({
      title: '删除尾帧',
      message: '确定要删除尾帧吗？首帧将保留，下次生成时可以参考首帧。',
      type: 'danger',
      confirmText: '删除尾帧',
      cancelText: '取消'
    });
    if (!confirmed) return;
    try {
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lastFrameUrl: null })
      });
      if (onUpdateScene) {
        onUpdateScene({ endFrame: undefined });
      }
      setShowStartFrame(true); // 切换到首帧显示
      showToast('已删除尾帧，首帧已保留', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除尾帧失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast, confirm]);

  // 删除视频
  const handleDeleteVideo = useCallback(async () => {
    if (!scene) return;
    if (scene.isLocked) {
      showToast('该分镜已锁定，请先解锁后再删除视频', 'warning');
      return;
    }
    try {
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl: null })
      });
      if (onUpdateScene) {
        onUpdateScene({ videoUrl: undefined });
      }
      showToast('已删除视频', 'success');
    } catch (err) {
      console.error('[ScenePreviewPanel] 删除视频失败:', err);
      showToast('删除失败', 'error');
    }
  }, [scene, onUpdateScene, showToast]);

  // Lightbox 放大预览状态（必须在任何 early return 之前，避免 Hooks 数量不一致导致 React error #300）
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPos, setLightboxPos] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const handleLightboxWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setLightboxZoom(z => Math.min(5, Math.max(0.5, z + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  const handleLightboxMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, posX: lightboxPos.x, posY: lightboxPos.y };
  }, [lightboxPos]);

  const handleLightboxMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setLightboxPos({
      x: dragStart.current.posX + (e.clientX - dragStart.current.x),
      y: dragStart.current.posY + (e.clientY - dragStart.current.y)
    });
  }, []);

  const handleLightboxMouseUp = useCallback(() => { isDragging.current = false; }, []);

  // 空状态
  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center bg-(--bg-app)">
        <div className="text-center">
          <Film className="w-16 h-16 mx-auto mb-4 text-(--text-muted) opacity-30" />
          <p className="text-sm text-(--text-muted)">选择一个分镜以查看详情</p>
        </div>
      </div>
    );
  }

  // 判断当前显示的媒体
  const hasFrames = scene.startFrame || scene.endFrame;
  const hasVideo = !!scene.videoUrl;
  // 优先使用预览的帧 URL（如果有），否则使用场景的当前帧
  const currentFrame = previewFrameUrl && previewFrameType === (showStartFrame ? 'first' : 'last')
    ? previewFrameUrl
    : (showStartFrame ? scene.startFrame : scene.endFrame);

  const openLightbox = () => {
    setLightboxZoom(1);
    setLightboxPos({ x: 0, y: 0 });
    setLightboxOpen(true);
  };

  return (
    <div className="h-full flex flex-col bg-(--bg-app)">
      {/* 草图绘制面板 - 直接嵌入（草图阶段） */}
      {showMagicSpace && previewStage === 'sketch' && onGenerateWithSketch ? (
        <div className="h-full flex flex-col bg-(--bg-app)">
          <MagicSpacePanel
            sourceImageUrl={scene.startFrame || scene.imageUrl || ''}
            aspectRatio={scene.hasAction ? '16:9' : '16:9'}
            initialMode="sketch"
            onGenerateWithCamera={async () => {}}
            onGenerateWithPaint={async () => {}}
            onGenerateWithSketch={async (params) => {
              const result = await onGenerateWithSketch(scene.id, params);
              if (result.success) {
                setShowMagicSpace(false);
              } else {
                showToast(result.error || '草图生成失败', 'error');
              }
            }}
            onCancel={() => setShowMagicSpace(false)}
            isGenerating={isGeneratingImage}
          />
        </div>
      ) : showMagicSpace && previewStage === 'first' && onGenerateWithSketch ? (
        // 首帧草图绘制面板
        <div className="h-full flex flex-col bg-(--bg-app)">
          <MagicSpacePanel
            sourceImageUrl={scene.startFrame || scene.imageUrl || ''}
            aspectRatio={scene.hasAction ? '16:9' : '16:9'}
            initialMode="sketch"
            onGenerateWithCamera={async () => {}}
            onGenerateWithPaint={async () => {}}
            onGenerateWithSketch={async (params) => {
              // 上传草图并保存到 startSketchUrl
              try {
                const base64Data = params.sketchImageBase64;
                const byteString = atob(base64Data.split(',')[1]);
                const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                  ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                const formData = new FormData();
                formData.append('file', blob, `start_sketch_${scene.id}_${Date.now()}.png`);
                formData.append('path_prefix', 'images/sketches');

                const uploadRes = await fetch('/api/upload/general', {
                  method: 'POST',
                  body: formData,
                });

                if (!uploadRes.ok) throw new Error(`上传草图失败: HTTP ${uploadRes.status}`);
                const uploadData = await uploadRes.json();
                const sketchUrl = uploadData.url || uploadData.fileUrl || uploadData.filePath || '';
                if (!sketchUrl) throw new Error('上传草图返回无效URL');

                // 保存到场景数据
                if (onUpdateScene) {
                  onUpdateScene({
                    startSketchUrl: sketchUrl,
                    startSketchType: 'storyboard_sketch',
                    startSketchData: params.sketchImageBase64,
                  });
                }
                setShowMagicSpace(false);
                showToast('首帧草图已保存', 'success');
              } catch (err: any) {
                showToast(err.message || '保存草图失败', 'error');
              }
            }}
            onCancel={() => setShowMagicSpace(false)}
            isGenerating={isGeneratingImage}
          />
        </div>
      ) : showMagicSpace && previewStage === 'last' && onGenerateWithSketch ? (
        // 尾帧草图绘制面板
        <div className="h-full flex flex-col bg-(--bg-app)">
          <MagicSpacePanel
            sourceImageUrl={scene.endFrame || scene.startFrame || scene.imageUrl || ''}
            aspectRatio={scene.hasAction ? '16:9' : '16:9'}
            initialMode="sketch"
            onGenerateWithCamera={async () => {}}
            onGenerateWithPaint={async () => {}}
            onGenerateWithSketch={async (params) => {
              // 上传草图并保存到 endSketchUrl
              try {
                const base64Data = params.sketchImageBase64;
                const byteString = atob(base64Data.split(',')[1]);
                const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                  ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                const formData = new FormData();
                formData.append('file', blob, `end_sketch_${scene.id}_${Date.now()}.png`);
                formData.append('path_prefix', 'images/sketches');

                const uploadRes = await fetch('/api/upload/general', {
                  method: 'POST',
                  body: formData,
                });

                if (!uploadRes.ok) throw new Error(`上传草图失败: HTTP ${uploadRes.status}`);
                const uploadData = await uploadRes.json();
                const sketchUrl = uploadData.url || uploadData.fileUrl || uploadData.filePath || '';
                if (!sketchUrl) throw new Error('上传草图返回无效URL');

                // 保存到场景数据
                if (onUpdateScene) {
                  onUpdateScene({
                    endSketchUrl: sketchUrl,
                    endSketchType: 'storyboard_sketch',
                    endSketchData: params.sketchImageBase64,
                  });
                }
                setShowMagicSpace(false);
                showToast('尾帧草图已保存', 'success');
              } catch (err: any) {
                showToast(err.message || '保存草图失败', 'error');
              }
            }}
            onCancel={() => setShowMagicSpace(false)}
            isGenerating={isGeneratingImage}
          />
        </div>
      ) : showMagicSpace && currentFrame && onGenerateWithCamera ? (
        <MagicSpacePanel
          sourceImageUrl={bustCache(currentFrame) || currentFrame}
          aspectRatio={scene.hasAction ? '16:9' : '16:9'}
          initialMode={magicSpaceInitialMode}
          onGenerateWithCamera={async (params) => {
            const result = await onGenerateWithCamera(scene.id, params);
            if (result.success) {
              setShowMagicSpace(false);
            } else {
              showToast(result.error || '视角生成失败', 'error');
            }
          }}
          onGenerateWithPaint={async (params) => {
            if (!onGenerateWithPaint) return;
            const result = await onGenerateWithPaint(scene.id, params);
            if (result.success) {
              setShowMagicSpace(false);
            } else {
              showToast(result.error || '涂改生成失败', 'error');
            }
          }}
          onGenerateWithSketch={async (params) => {
            if (!onGenerateWithSketch) return;
            const result = await onGenerateWithSketch(scene.id, params);
            if (result.success) {
              setShowMagicSpace(false);
            } else {
              showToast(result.error || '草图生成失败', 'error');
            }
          }}
          onCancel={() => setShowMagicSpace(false)}
          isGenerating={isGeneratingImage}
        />
      ) : (
      <>
      {/* 预览区域 */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* 阶段导航栏 - 左上角：统一标签样式 */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-(--bg-card)/90 backdrop-blur-sm rounded-lg p-1 border border-(--border-color) shadow-lg">
          {/* 草图阶段 */}
          <button
            onClick={() => setPreviewStage('sketch')}
            onMouseEnter={() => prefetchSketchEditor()}
            title="草图"
            aria-label="草图阶段"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              previewStage === 'sketch'
                ? 'bg-(--accent) text-white shadow-sm'
                : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            {scene.sketchUrl && (
              <span className={`w-1.5 h-1.5 rounded-full ${previewStage === 'sketch' ? 'bg-white' : 'bg-amber-500'}`} />
            )}
          </button>

          {/* 首帧/图片阶段 */}
          <button
            onClick={() => setPreviewStage('first')}
            title={scene.hasAction ? '首帧' : '图片'}
            aria-label={scene.hasAction ? '首帧阶段' : '图片阶段'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              previewStage === 'first'
                ? 'bg-(--accent) text-white shadow-sm'
                : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            {scene.startFrame && (
              <span className={`w-1.5 h-1.5 rounded-full ${previewStage === 'first' ? 'bg-white' : 'bg-emerald-500'}`} />
            )}
          </button>

          {/* 尾帧阶段 - 仅运动模式 */}
          {scene.hasAction && (
            <button
              onClick={() => setPreviewStage('last')}
              title="尾帧"
              aria-label="尾帧阶段"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                previewStage === 'last'
                  ? 'bg-(--accent) text-white shadow-sm'
                  : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {scene.endFrame && (
                <span className={`w-1.5 h-1.5 rounded-full ${previewStage === 'last' ? 'bg-white' : 'bg-rose-500'}`} />
              )}
            </button>
          )}

          {/* 视频阶段 */}
          <button
            onClick={() => setPreviewStage('video')}
            title="视频"
            aria-label="视频阶段"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              previewStage === 'video'
                ? 'bg-(--accent) text-white shadow-sm'
                : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-hover)'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            {scene.videoUrl && (
              <span className={`w-1.5 h-1.5 rounded-full ${previewStage === 'video' ? 'bg-white' : 'bg-emerald-500'}`} />
            )}
          </button>
        </div>

        {/* 预览内容区 */}
        <div className="flex-1 flex items-center justify-center min-h-0 relative">
          {/* 生成中遮罩层 */}
          {isGenerating && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
              <Loader2 className="w-10 h-10 text-(--accent) animate-spin mb-3" />
              <p className="text-sm font-medium text-white mb-2">
                {isGeneratingImage
                  ? (scene.hasAction ? '正在生成首尾帧...' : '正在生成图片...')
                  : '正在生成视频...'}
              </p>
              {generatingProgress > 0 && (
                <div className="w-48 flex flex-col items-center gap-1.5">
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-(--accent) rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, generatingProgress)}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/70">{Math.round(generatingProgress)}%</span>
                </div>
              )}
              <p className="text-xs text-white/50 mt-2">请勿关闭页面</p>
            </div>
          )}

          {/* 根据 previewStage 渲染对应内容 */}
          {previewStage === 'sketch' && (
            // 草图预览
            <div className="relative w-full h-full flex items-center justify-center">
              {scene.sketchUrl ? (
                <>
                  <img
                    src={scene.sketchUrl}
                    alt="分镜草图"
                    className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-zoom-in hover:ring-2 hover:ring-(--accent)/50 transition-all"
                    style={{ maxHeight: 'calc(100% - 2rem)' }}
                    onClick={() => {
                      setLightboxZoom(1);
                      setLightboxPos({ x: 0, y: 0 });
                      setLightboxOpen(true);
                    }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: scene.sketchUrl,
                        source: 'sketch',
                        sceneId: scene.id
                      }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  />
                  {/* 编辑/删除/历史版本按钮 */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-500/70 hover:text-white'
                      }`}
                      title="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {onGenerateWithSketch && (
                      <button
                        onClick={() => {
                          setMagicSpaceInitialMode('sketch');
                          setShowMagicSpace(true);
                        }}
                        disabled={isGenerating}
                        className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                          isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-500/70 hover:text-white'
                        }`}
                        title="编辑草图"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (onUpdateScene) {
                          onUpdateScene({ sketchUrl: undefined, sketchType: undefined, sketchData: undefined });
                        }
                      }}
                      disabled={isGenerating}
                      className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                        isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/80'
                      }`}
                      title="删除草图"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 放大按钮 */}
                  <button
                    onClick={() => {
                      setLightboxZoom(1);
                      setLightboxPos({ x: 0, y: 0 });
                      setLightboxOpen(true);
                    }}
                    className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                    title="放大预览"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-500/70 hover:text-white'
                      }`}
                      title="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-32 h-20 rounded-lg border-2 border-dashed border-(--border-color) flex items-center justify-center mb-4">
                    <Pencil className="w-8 h-8 text-(--text-muted)" />
                  </div>
                  <p className="text-sm text-(--text-muted) mb-4">暂无草图</p>
                  {onGenerateWithSketch && (
                    <Button
                      size="sm"
                      variant="flat"
                      className="bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      startContent={<Pencil className="w-4 h-4" />}
                      onPress={() => {
                        setMagicSpaceInitialMode('sketch');
                        setShowMagicSpace(true);
                      }}
                    >
                      绘制草图
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {previewStage === 'first' && (
            // 首帧预览
            <div className="relative w-full h-full flex items-center justify-center">
              {scene.startFrame ? (
                <>
                  <img
                    key={scene.startFrame}
                    src={bustCache(scene.startFrame) || scene.startFrame}
                    alt={`分镜 ${sceneIndex + 1} - 首帧`}
                    className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-zoom-in hover:ring-2 hover:ring-(--accent)/50 transition-all"
                    style={{ maxHeight: 'calc(100% - 2rem)' }}
                    onClick={openLightbox}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: scene.startFrame,
                        source: 'frame',
                        frameType: 'start',
                        sceneId: scene.id
                      }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  />
                  {/* 历史版本/删除帧按钮 */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500/70 hover:text-white'
                      }`}
                      title="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDeleteFirstFrame}
                      disabled={isGenerating}
                      className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                        isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-500/80'
                      }`}
                      title="删除首帧"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 放大按钮 */}
                  <button
                    onClick={openLightbox}
                    className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                    title="放大预览"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center px-6">
                  {/* 历史按钮 - 右上角 */}
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-(--border-color) bg-(--bg-card)/85 backdrop-blur-sm p-0.5 shadow-lg">
                    
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-(--accent)/15 text-(--accent)' : 'text-(--text-secondary) hover:bg-(--accent)/10 hover:text-(--accent)'} ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title="历史版本"
                      aria-label="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-[15px] font-semibold text-(--text-primary) mb-1">
                    {scene.hasAction ? '暂无首帧' : '暂无图片'}
                  </h3>

                  {/* 草图提示 */}
                  {scene.hasAction && scene.startSketchUrl && (
                    <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <Pencil className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-amber-500">已设置首帧草图参考</span>
                    </div>
                  )}

                  {/* 操作按钮组 */}
                  <div className="mt-5 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="px-5 rounded-lg bg-(--accent) text-white font-medium hover:bg-(--accent-dark) shadow-none"
                        onPress={handleGenerateImage}
                        isLoading={isGeneratingImage}
                        isDisabled={isGeneratingImage}
                      >
                        {scene.hasAction ? '生成首尾帧' : '生成图片'}
                      </Button>
                      {scene.hasAction && onGenerateWithSketch && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="px-4 bg-(--bg-card) border border-(--border-color) text-(--text-secondary) hover:border-amber-500/50 hover:text-amber-500"
                          startContent={<Pencil className="w-4 h-4" />}
                          onPress={() => {
                            setMagicSpaceInitialMode('sketch');
                            setShowMagicSpace(true);
                          }}
                        >
                          {scene.startSketchUrl ? '编辑草图' : '绘制草图'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 静止模式不显示尾帧阶段 */}
          {scene.hasAction && previewStage === 'last' && (
            // 尾帧预览
            <div className="relative w-full h-full flex items-center justify-center">
              {scene.endFrame ? (
                <>
                  <img
                    key={scene.endFrame}
                    src={bustCache(scene.endFrame) || scene.endFrame}
                    alt={`分镜 ${sceneIndex + 1} - 尾帧`}
                    className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-zoom-in hover:ring-2 hover:ring-(--accent)/50 transition-all"
                    style={{ maxHeight: 'calc(100% - 2rem)' }}
                    onClick={openLightbox}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: scene.endFrame,
                        source: 'frame',
                        frameType: 'end',
                        sceneId: scene.id
                      }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  />
                  {/* 历史版本/删除帧按钮 */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500/70 hover:text-white'
                      }`}
                      title="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDeleteLastFrame}
                      disabled={isGenerating}
                      className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                        isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-500/80'
                      }`}
                      title="删除尾帧"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 放大按钮 */}
                  <button
                    onClick={openLightbox}
                    className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                    title="放大预览"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center px-6">
                  {/* 历史按钮 - 右上角 */}
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-(--border-color) bg-(--bg-card)/85 backdrop-blur-sm p-0.5 shadow-lg">
                    
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-(--accent)/15 text-(--accent)' : 'text-(--text-secondary) hover:bg-(--accent)/10 hover:text-(--accent)'} ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                      title="历史版本"
                      aria-label="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 标题 */}
                  <h3 className="text-[15px] font-semibold text-(--text-primary) mb-1">
                    暂无尾帧
                  </h3>

                  {/* 草图提示 */}
                  {scene.endSketchUrl && (
                    <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <Pencil className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-amber-500">已设置尾帧草图参考</span>
                    </div>
                  )}

                  {/* 操作按钮组 */}
                  <div className="mt-5 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        className="px-5 rounded-lg bg-(--accent) text-white font-medium hover:bg-(--accent-dark) shadow-none"
                        onPress={handleGenerateImage}
                        isLoading={isGeneratingImage}
                        isDisabled={isGeneratingImage}
                      >
                        生成首尾帧
                      </Button>
                      {onGenerateWithSketch && (
                        <Button
                          size="sm"
                          variant="flat"
                          className="px-4 bg-(--bg-card) border border-(--border-color) text-(--text-secondary) hover:border-amber-500/50 hover:text-amber-500"
                          startContent={<Pencil className="w-4 h-4" />}
                          onPress={() => {
                            setMagicSpaceInitialMode('sketch');
                            setShowMagicSpace(true);
                          }}
                        >
                          {scene.endSketchUrl ? '编辑草图' : '绘制草图'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 视频阶段 - 两种模式都显示 */}
          {previewStage === 'video' && (
            // 视频预览
            <div className="relative w-full h-full flex">
              {scene.videoUrl ? (
                <>
                  <VideoHistorySidebar
                    storyboardId={scene.id}
                    currentVideoUrl={scene.videoUrl}
                    firstFrameUrl={scene.startFrame}
                    lastFrameUrl={scene.endFrame}
                    isOpen={showVideoHistory}
                    onToggle={() => setShowVideoHistory(prev => !prev)}
                    onSwitchVersion={(data) => {
                      if (onUpdateScene) {
                        const updates: Partial<StoryboardScene> = {};
                        if (data.videoUrl !== undefined) updates.videoUrl = data.videoUrl || undefined;
                        if (data.firstFrameUrl) {
                          updates.startFrame = data.firstFrameUrl;
                          updates.imageUrl = data.firstFrameUrl;
                        }
                        if (data.lastFrameUrl) updates.endFrame = data.lastFrameUrl;
                        onUpdateScene(updates);
                      }
                    }}
                  />
                  <div className="flex-1 relative flex items-center justify-center min-w-0">
                    <video
                      key={scene.videoUrl}
                      src={scene.videoUrl}
                      controls
                      className="max-w-full max-h-full rounded-lg shadow-2xl"
                      style={{ maxHeight: 'calc(100% - 2rem)' }}
                    />
                    {/* 历史版本/视频历史切换/删除 */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      
                      <button
                        onClick={async () => {
                          if (!showHistory && historyVersions.length === 0) {
                            await loadHistoryVersions();
                          }
                          setShowHistory(!showHistory);
                        }}
                        disabled={isGenerating || historyLoading}
                        className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                          isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-rose-500/70 hover:text-white'
                        }`}
                        title="历史版本"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowVideoHistory(prev => !prev)}
                        disabled={isGenerating}
                        className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1 ${
                          showVideoHistory
                            ? 'bg-rose-500/40 text-rose-300'
                            : 'hover:bg-rose-500/30 hover:text-rose-300'
                        }`}
                        title={showVideoHistory ? '收起视频历史' : '视频历史'}
                      >
                        <Film className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleDeleteVideo}
                        disabled={isGenerating}
                        className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                          isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/80'
                        }`}
                        title="删除视频"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center relative">
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    
                    <button
                      onClick={async () => {
                        if (!showHistory && historyVersions.length === 0) {
                          await loadHistoryVersions();
                        }
                        setShowHistory(!showHistory);
                      }}
                      disabled={isGenerating || historyLoading}
                      className={`p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                        isGenerating || historyLoading ? 'opacity-40 cursor-not-allowed' : 'hover:bg-rose-500/70 hover:text-white'
                      }`}
                      title="历史版本"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-32 h-20 rounded-lg border-2 border-dashed border-(--border-color) flex items-center justify-center mb-4">
                    <Video className="w-8 h-8 text-(--text-muted)" />
                  </div>
                  <p className="text-sm text-(--text-muted) mb-4">暂无视频</p>
                  {hasFrames && (
                    <Button
                      size="sm"
                      className="bg-rose-500/20 text-rose-400 border border-rose-500/30"
                      startContent={<Film className="w-4 h-4" />}
                      onPress={handleGenerateVideo}
                      isLoading={isGeneratingVideo}
                      isDisabled={isGeneratingImage || isGeneratingVideo}
                    >
                      生成视频
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox 放大预览 */}
      {lightboxOpen && currentFrame && (
        <div
          className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
          onWheel={handleLightboxWheel}
          onMouseMove={handleLightboxMouseMove}
          onMouseUp={handleLightboxMouseUp}
          onMouseLeave={handleLightboxMouseUp}
          style={{ cursor: isDragging.current ? 'grabbing' : 'default' }}
        >
          {/* 顶部工具栏 */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 z-10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxZoom(z => Math.min(5, z + 0.5))} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="放大">
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/70 min-w-12 text-center">{Math.round(lightboxZoom * 100)}%</span>
            <button onClick={() => setLightboxZoom(z => Math.max(0.5, z - 0.5))} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="缩小">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/20" />
            <button onClick={() => { setLightboxZoom(1); setLightboxPos({ x: 0, y: 0 }); }} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="重置">
              <RotateCw className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/20" />
            <button onClick={() => setLightboxOpen(false)} className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-colors" title="关闭">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 图片 */}
          <img
            key={`lightbox-${currentFrame}`}
            src={bustCache(currentFrame) || currentFrame}
            alt={`分镜 ${sceneIndex + 1} 放大预览`}
            className="select-none"
            style={{
              transform: `translate(${lightboxPos.x}px, ${lightboxPos.y}px) scale(${lightboxZoom})`,
              transition: isDragging.current ? 'none' : 'transform 0.15s ease',
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              cursor: lightboxZoom > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
              borderRadius: '8px'
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={handleLightboxMouseDown}
            draggable={false}
          />

          {/* 底部帧信息 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
            分镜 #{sceneIndex + 1} · {showStartFrame ? '首帧' : '尾帧'} · 滚轮缩放 · 拖拽平移 · 点击空白关闭
          </div>
        </div>
      )}

      {/* 信息和操作区域（独立布局用；内嵌时由顶部工具栏控制底部编辑面板） */}
      <div className="bg-(--bg-card) shrink-0">
        {/* 元数据：仅在独立布局展示；内嵌底部编辑器时由编辑器头部统一承载 */}
        {!hideDirectorSpace && (
          <div className="px-4 pt-2.5 pb-2 border-b border-(--border-color)">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-semibold text-(--text-secondary) tracking-wide whitespace-nowrap">
                  分镜 #{sceneIndex + 1}
                </span>
                {scene.hasAction && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--bg-input) border border-(--border-color) text-[10px] text-(--text-muted) whitespace-nowrap">
                    <Zap className="w-2.5 h-2.5" />
                    动作镜头
                  </span>
                )}
              </div>
              <StoryboardLockButton
                storyboardId={scene.id}
                isLocked={scene.isLocked || false}
                size="sm"
                onLockChange={(locked) => {
                  onUpdateScene?.({ isLocked: locked });
                }}
              />
            </div>

            <SceneMetaBar
              scene={scene}
              projectCharacters={projectCharacters}
              projectScenes={projectScenes}
              projectProps={projectProps}
              videoDurationRange={videoDurationRange}
              onUpdateCharactersAndLocation={onUpdateCharactersAndLocation}
              onUpdateProps={onUpdateProps}
              onUpdateScene={onUpdateScene}
              onUpdateDuration={onUpdateDuration}
            />
          </div>
        )}

        {/* 导演空间 - 当 hideDirectorSpace=true 时完全隐藏（由 BottomPanel 独立显示） */}
        {!hideDirectorSpace && (
        <div className="border-t border-(--border-color) flex flex-col flex-1 min-h-0">
          {/* 标题栏 */}
          <div
            className="w-full px-4 py-3 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <Blocks className="w-4 h-4 text-(--accent)" />
              <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider">
                导演空间
              </span>
              {/* 生成模式状态标签 - 轻量化 */}
              {!scene.hasAction ? (
                // 静止模式
                scene.startFrame ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    已生成
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-(--bg-input) text-(--text-muted) border border-(--border-color)">
                    图片阶段
                  </span>
                )
              ) : (
                // 运动模式
                scene.startFrame && scene.endFrame ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    视频生成
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-(--bg-input) text-(--text-muted) border border-(--border-color)">
                    图片阶段
                  </span>
                )
              )}
              {/* 提示词模式切换 - 统一标签样式 */}
              <div className="flex items-center gap-1 ml-2 p-0.5 bg-(--bg-input) rounded-lg">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromptMode('description');
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    promptMode === 'description'
                      ? 'bg-(--accent) text-white shadow-sm'
                      : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
                  }`}
                >
                  分镜描述
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromptMode('image');
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    promptMode === 'image'
                      ? 'bg-(--accent) text-white shadow-sm'
                      : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
                  }`}
                >
                  图片提示词
                </button>
                {/* 运动模式才显示首帧/尾帧子标签 */}
                {scene.hasAction && promptMode === 'image' && (
                  <div className="flex items-center gap-0.5 ml-1 p-0.5 bg-(--bg-card) rounded-md border border-(--border-color)">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageFrameTab('first');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        imageFrameTab === 'first'
                          ? 'bg-(--accent)/20 text-(--accent)'
                          : 'text-(--text-muted) hover:text-(--text-secondary)'
                      }`}
                    >
                      首帧
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageFrameTab('last');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        imageFrameTab === 'last'
                          ? 'bg-(--accent)/20 text-(--accent)'
                          : 'text-(--text-muted) hover:text-(--text-secondary)'
                      }`}
                    >
                      尾帧
                    </button>
                  </div>
                )}
                {/* 静止模式：图片提示词直接保存到 first_frame_prompt */}
                {!scene.hasAction && promptMode === 'image' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-(--bg-card) text-(--text-muted) ml-1 border border-(--border-color)">
                    单图
                  </span>
                )}
                {/* 运动模式才显示视频提示词 */}
                {scene.hasAction && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptMode('video');
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      promptMode === 'video'
                        ? 'bg-(--accent) text-white shadow-sm'
                        : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-hover)'
                    }`}
                  >
                    视频提示词
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 内容区 - 始终展开 */}
          <div className="overflow-hidden px-4 pb-3 flex-1 min-h-0">
            <div className="h-full">
              {promptMode === 'description' ? (
                <DescriptionEditor
                  scene={scene}
                  projectId={projectId}
                  multimodalModel={multimodalModel}
                  onUpdateBaseDescription={onUpdateBaseDescription}
                  onUpdateDescription={onUpdateDescription}
                />
              ) : (
                <BlockEditor
                  key={`${scene.id}-${promptMode}-${promptMode === 'image' ? (scene.hasAction ? imageFrameTab : 'single') : ''}`}
                  storyboardId={scene.id}
                  projectId={projectId || undefined}
                  scriptId={scriptId || undefined}
                  promptMode={promptMode}
                  basePrompt={scene.baseDescription || ''}
                  initialBlocks={(() => {
                    const text = promptMode === 'video'
                      ? scene.videoPrompt
                      : promptMode === 'image'
                        ? (scene.hasAction
                            ? (imageFrameTab === 'first'
                                ? (scene.firstFramePrompt || scene.description)
                                : (scene.lastFramePrompt || scene.description))
                            : (scene.firstFramePrompt || scene.description))
                        : scene.baseDescription || scene.description;
                    return text
                      ? [{ id: 'init-text', type: 'text' as const, category: 'text' as const, data: { text }, position: { x: 0, y: 0 } }]
                      : [];
                  })()}
                  availableFrames={{
                    startFrame: scene.startFrame,
                    endFrame: scene.endFrame
                  }}
                  dialogue={scene.dialogue}
                  dialogues={scene.dialogues}
                  characters={scene.characters}
                  onUpdateDialogues={onUpdateDialogues}
                  voiceover={scene.voiceover}
                  onUpdateVoiceover={onUpdateVoiceover}
                  negativePrompt={scene.negativePrompt}
                  onUpdateNegativePrompt={async (negativePrompt: string) => {
                    const res = await fetch(`/api/storyboards/${scene.id}/content`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ negative_prompt: negativePrompt })
                    });
                    if (!res.ok) throw new Error('保存反向提示词失败');
                    return true;
                  }}
                  onChange={(state: BlockEditorState) => {
                    // 同步编辑器当前文本到组件状态
                    if (state.generatedPrompt !== undefined) {
                      setCurrentEditorText(state.generatedPrompt);
                    }
                  }}
                  onSave={async (state: BlockEditorState) => {
                    if (promptMode === 'video' && onUpdateVideoPrompt) {
                      const success = await onUpdateVideoPrompt(state.generatedPrompt);
                      return success;
                    }
                    if (promptMode === 'image') {
                      if (scene.hasAction) {
                        // 运动模式：首帧/尾帧分开保存
                        if (imageFrameTab === 'first' && onUpdateFirstFramePrompt) {
                          return await onUpdateFirstFramePrompt(state.generatedPrompt);
                        }
                        if (imageFrameTab === 'last' && onUpdateLastFramePrompt) {
                          return await onUpdateLastFramePrompt(state.generatedPrompt);
                        }
                      } else {
                        // 静止模式：图片提示词统一保存到 first_frame_prompt
                        if (onUpdateFirstFramePrompt) {
                          return await onUpdateFirstFramePrompt(state.generatedPrompt);
                        }
                      }
                    }
                    const success = await onUpdateDescription(state.generatedPrompt);
                    return success;
                  }}
                  models={models}
                  imageModel={propImageModel}
                  videoModel={propVideoModel}
                  onImageModelChange={onImageModelChange}
                  onVideoModelChange={onVideoModelChange}
                  onGenerateImage={onGenerateImage}
                  onGenerateVideo={onGenerateVideo}
                  hasAction={scene.hasAction}
                  imageFrameTab={imageFrameTab}
                />
              )}
            </div>
          </div>
        </div>
        )}

        {/* 草图面板 - 已隐藏 */}
        {/*
        <div className="px-4 py-3 border-t border-(--border-color)">
          <SketchPanel
            storyboardId={scene.id}
            sketchUrl={scene.sketchUrl}
            sketchType={scene.sketchType}
            sketchData={scene.sketchData}
            controlStrength={scene.controlStrength}
            backgroundImage={scene.startFrame}
            onSketchChange={(updates) => {
              if (onUpdateScene) {
                onUpdateScene(updates);
              }
            }}
          />
        </div>
        */}

        {/* 生成操作已移至 BlockEditor 输入框内 */}
      </div>

      {/* 历史版本可拖拽浮动面板 */}
      {showHistory && (
        <div
          ref={historyPanelRef}
          className="fixed z-100 bg-(--bg-card) border border-(--border-color) rounded-xl shadow-2xl w-80 max-w-[90vw] overflow-hidden"
          style={{
            left: historyPanelPos.x || '50%',
            top: historyPanelPos.y || 'auto',
            bottom: historyPanelPos.y ? 'auto' : '80px',
            transform: historyPanelPos.x ? 'none' : 'translateX(-50%)',
          }}
        >
          {/* 拖拽头部 */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-(--border-color) cursor-move select-none"
            onMouseDown={(e) => {
              isDraggingHistory.current = true;
              dragStartHistory.current = {
                x: e.clientX,
                y: e.clientY,
                panelX: historyPanelPos.x,
                panelY: historyPanelPos.y,
              };
              const handleMove = (ev: MouseEvent) => {
                if (!isDraggingHistory.current) return;
                const dx = ev.clientX - dragStartHistory.current.x;
                const dy = ev.clientY - dragStartHistory.current.y;
                setHistoryPanelPos({
                  x: dragStartHistory.current.panelX + dx,
                  y: dragStartHistory.current.panelY + dy,
                });
              };
              const handleUp = () => {
                isDraggingHistory.current = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
              };
              document.addEventListener('mousemove', handleMove);
              document.addEventListener('mouseup', handleUp);
            }}
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-medium text-(--text-primary)">历史版本</h3>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 rounded-md hover:bg-(--bg-hover) text-(--text-muted) transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* 面板内容 */}
          <div className="max-h-72 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-(--text-muted)">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载中...
              </div>
            ) : historyVersions.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-sm text-(--text-muted)">
                <Clock className="w-8 h-8 mb-2 opacity-30" />
                暂无历史版本
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {historyVersions.map((version) => (
                  <button
                    key={String(version.id)}
                    onClick={() => {
                      restoreHistoryVersion(version);
                      setShowHistory(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-(--text-secondary) hover:bg-(--bg-hover) transition-colors group"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-md bg-(--bg-input) flex items-center justify-center">
                      <Clock className="w-4 h-4 text-(--text-muted) group-hover:text-amber-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{version.label}</div>
                      <div className="text-xs text-(--text-muted) mt-0.5 flex items-center gap-2">
                        {version.firstFrameUrl && <span className="text-emerald-400/70">首帧</span>}
                        {version.lastFrameUrl && <span className="text-emerald-400/70">尾帧</span>}
                        {version.videoUrl && <span className="text-amber-400/70">视频</span>}
                      </div>
                    </div>
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-amber-400 font-medium">恢复</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 旧版历史版本面板 - 已改为弹窗，此处保留组件以备恢复 */}
      {/* {scene && showHistory && (
        <FrameHistoryPanel
          storyboardId={scene.id}
          isOpen={showHistory}
          onClose={() => {
            setShowHistory(false);
            setPreviewFrameUrl(null);
            setPreviewFrameType(null);
          }}
          onRestoreVersion={({ firstFrameUrl, lastFrameUrl, videoUrl }) => {
            if (onUpdateScene) {
              const updates: Partial<StoryboardScene> = {};
              if (firstFrameUrl) {
                updates.startFrame = firstFrameUrl;
                updates.imageUrl = firstFrameUrl;
              }
              if (lastFrameUrl) {
                updates.endFrame = lastFrameUrl;
              }
              updates.videoUrl = videoUrl || undefined;
              onUpdateScene(updates);
            }
            setPreviewFrameUrl(null);
            setPreviewFrameType(null);
            showToast('版本已恢复', 'success');
            setShowHistory(false);
          }}
        />
      )} */}
      </>
      )}
    </div>
  );
};

export default ScenePreviewPanel;
