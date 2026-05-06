import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, Textarea, Chip, Select, SelectItem } from '@heroui/react';
import { ImageIcon, Video, Film, Camera, Users, MapPin, Zap, X, Trash2, ZoomIn, ZoomOut, RotateCw, Maximize2, Blocks, ChevronDown, ChevronUp, History, Loader2, Pencil, Check, Plus, Search, Sparkles, Clock, Wand2, Star, Shirt, Settings2, Package } from 'lucide-react';
import { StoryboardScene, DialogueLine } from './useSceneManager';
import { TaskState } from '../../hooks/useTaskRunner';
import MagicSpacePanel, { CameraGenerateParams, PaintGenerateParams } from './MagicSpace';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { validateFrameReadiness, formatValidationMessage } from './utils/validateFrameReadiness';
import SketchPanel from './SceneCard/SketchPanel';
import BlockEditor from './BlockEditor';
import FrameHistoryPanel from './FrameHistoryPanel';
import { BlockEditorState } from './BlockEditor/types/blockTypes';
import { bustCache } from '../../services/mediaCache';
import { startWorkflow, getWorkflowStatus } from '../../hooks/useWorkflow';
import StoryboardLockButton from './components/StoryboardLockButton';
import VideoHistorySidebar from './components/VideoHistorySidebar';
import { ShotSizeSelector, ShotSizeBadge } from './components/ShotSizeSelector';

/** 角色选择器：Chip 标签 + 添加下拉 + 点击预览角色长相（增强：显示白膜/服装状态） */
const CharacterTagSelector: React.FC<{
  characters: string[];
  projectCharacters: { id: number; name: string; image_url?: string; front_view_url?: string; base_appearance?: string; outfit_appearance?: string; has_base_model?: number; has_base_model_views?: number; states_count?: number; active_state_name?: string; active_state_outfit?: string; active_state_image_url?: string; base_front_view_url?: string }[];
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
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
    <div ref={containerRef} className="relative flex items-center gap-1 flex-wrap">
      <Users className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
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
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs group/char ${
              isIncomplete
                ? 'bg-slate-500/15 text-slate-400 border border-dashed border-slate-500/30'
                : 'bg-blue-500/15 text-blue-400'
            }`}
            title={isIncomplete ? '该角色尚未生成白膜，请在资源面板完善资产' : ''}
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
            <button onClick={() => toggleCharacter(name)} className="hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 flex items-center justify-center rounded bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
        title="添加角色"
      >
        <Plus className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-[var(--border-color)] pb-1 mb-1">
            <Search className="w-3 h-3 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              placeholder="搜索或输入新角色名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-[var(--text-muted)] px-2 py-1">项目暂无角色资源</div>
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
                      ? 'opacity-50 cursor-not-allowed text-[var(--text-muted)]'
                      : selected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]'
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
              className="w-full text-left px-2 py-1 rounded text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 添加自定义角色 "{search.trim()}"
            </button>
          )}
        </div>
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
            className="fixed inset-0 z-[60] hidden items-center justify-center bg-black/90 backdrop-blur-sm"
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
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
    <div ref={containerRef} className="relative flex items-center gap-1 flex-wrap">
      <Package className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
      {selectedProps.length === 0 && (
        <span className="text-[var(--text-muted)] text-xs">道具</span>
      )}
      {selectedProps.map(name => {
        const propData = projectProps.find(p => p.name === name);
        return (
          <span
            key={name}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-teal-500/15 text-teal-400"
          >
            {propData?.image_url ? (
              <img src={propData.image_url} alt={name} className="w-3.5 h-3.5 rounded object-cover shrink-0" />
            ) : null}
            <span className="truncate max-w-20">{name}</span>
            <button onClick={() => toggleProp(name)} className="hover:text-red-400 transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 flex items-center justify-center rounded bg-teal-500/20 text-teal-500 hover:bg-teal-500/30 transition-colors"
        title="添加道具"
      >
        <Plus className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-[var(--border-color)] pb-1 mb-1">
            <Search className="w-3 h-3 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              placeholder="搜索或输入道具名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-[var(--text-muted)] px-2 py-1">项目暂无道具资源</div>
            )}
            {filtered.map(p => {
              const selected = selectedProps.includes(p.name);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProp(p.name)}
                  className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-2 ${
                    selected ? 'bg-teal-500/20 text-teal-400' : 'hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]'
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
        </div>
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
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
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] transition-colors text-xs group"
        title="点击选择影棚"
      >
        <MapPin className="w-3 h-3" />
        <span>{location || '选择影棚'}</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl p-2 space-y-1">
          <div className="flex items-center gap-1 border-b border-[var(--border-color)] pb-1 mb-1">
            <Search className="w-3 h-3 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              placeholder="搜索影棚..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && !search.trim() && (
              <div className="text-xs text-[var(--text-muted)] px-2 py-1">项目暂无影棚资源</div>
            )}
            {filtered.map(s => (
              <button
                key={s.id}
                onClick={() => selectScene(s.name)}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  s.name === location ? 'bg-green-500/20 text-green-400' : 'hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {search.trim() && !projectScenes.find(s => s.name === search.trim()) && (
            <button
              onClick={() => selectScene(search.trim())}
              className="w-full text-left px-2 py-1 rounded text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 使用自定义影棚 "{search.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// 分镜时长选择器 - Seedance 1.5 Pro 限定 4-12秒
const DURATION_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

const DurationSelector: React.FC<{
  duration: number;
  onSave: (duration: number) => void;
}> = ({ duration, onSave }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
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
    if (val >= 4 && val <= 12) {
      onSave(val);
      setIsOpen(false);
      setIsCustomMode(false);
      setCustomValue('');
    }
  };

  // 判断当前 duration 是否在预设选项中
  const isPresetValue = DURATION_OPTIONS.includes(duration);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] transition-colors text-xs group"
        title="点击选择时长"
      >
        <Clock className="w-3 h-3" />
        <span className={!isPresetValue && duration ? 'text-[var(--accent)] font-medium' : ''}>{duration || 3}s</span>
        <ChevronDown className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 py-1 min-w-[80px] max-h-[240px] overflow-y-auto">
          {DURATION_OPTIONS.map(val => (
            <button
              key={val}
              onClick={() => selectDuration(val)}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                duration === val
                  ? 'text-[var(--accent)] bg-[var(--accent)]/10 font-medium'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {val}s
            </button>
          ))}
          {/* 自定义输入 */}
          <div className="border-t border-[var(--border-color)] mt-1 pt-1 px-2">
            {isCustomMode ? (
              <div className="flex items-center gap-1">
                <input
                  ref={customInputRef}
                  type="number"
                  min="4"
                  max="12"
                  step="1"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomConfirm(); if (e.key === 'Escape') { setIsCustomMode(false); setCustomValue(''); } }}
                  placeholder="秒数"
                  className="w-16 px-1.5 py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleCustomConfirm}
                  className="px-1.5 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded transition-colors"
                  title="确认"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => { setIsCustomMode(false); setCustomValue(''); }}
                  className="px-1.5 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] rounded transition-colors"
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
                    ? 'text-[var(--accent)] bg-[var(--accent)]/10 font-medium'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {!isPresetValue && duration ? `${duration}s (自定义)` : '自定义时长...'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** 分镜描述编辑器 */
const DescriptionEditor: React.FC<{
  scene: StoryboardScene;
  projectId?: number | null;
  onUpdateBaseDescription?: (baseDescription: string) => Promise<boolean>;
}> = ({ scene, projectId, onUpdateBaseDescription }) => {
  const [text, setText] = useState(scene.baseDescription || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { showToast } = useToast();

  // 当外部 scene 变化时同步文本
  useEffect(() => {
    setText(scene.baseDescription || '');
  }, [scene.id, scene.baseDescription]);

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
          prompt: baseText
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
          const token = getAuthToken();
          const body: any = { prompt_template: imageRes.optimized };
          if (imageRes.negativePrompt) body.negative_prompt = imageRes.negativePrompt;
          const res = await fetch(`/api/storyboards/${scene.id}/content`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
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
          const token = getAuthToken();
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
                ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          分镜描述（AI将根据此描述生成图片和视频提示词）
        </span>
        {isSaving && <span className="text-[10px] text-[var(--text-muted)]">保存中...</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={scene.isLocked}
        className="flex-1 w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-3 text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)]"
        placeholder="描述这个分镜的画面内容：影棚、角色、动作、情绪、镜头等..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {text.length} 字
        </span>
        <button
          onClick={handleDualOptimize}
          disabled={isOptimizing || !text.trim() || scene.isLocked}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {isOptimizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          一键生成双提示词
        </button>
      </div>
    </div>
  );
};

interface ScenePreviewPanelProps {
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
  onGenerateHdRepair?: (id: number) => Promise<{ success: boolean; error?: string }>;
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
  onGenerateHdRepair,
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
  onVideoModelChange
}) => {
  const [showStartFrame, setShowStartFrame] = useState(true);
  const [internalDirectorSpaceExpanded, setInternalDirectorSpaceExpanded] = useState(false);
  const [promptMode, setPromptMode] = useState<'description' | 'image' | 'video'>('description');
  // 图片提示词模式下的首/尾帧子标签（两个独立编辑区）
  const [imageFrameTab, setImageFrameTab] = useState<'first' | 'last'>('first');
  // 优先使用外部控制，否则使用内部状态
  const isDirectorSpaceExpanded = directorSpaceOpen !== undefined ? directorSpaceOpen : internalDirectorSpaceExpanded;
  const [showHistory, setShowHistory] = useState(false);
  const [showVideoHistory, setShowVideoHistory] = useState(false);
  const [showMagicSpace, setShowMagicSpace] = useState(false);
  // 历史版本预览状态：临时存储预览的帧 URL，不永久修改场景数据
  const [previewFrameUrl, setPreviewFrameUrl] = useState<string | null>(null);
  const [previewFrameType, setPreviewFrameType] = useState<'first' | 'last' | null>(null);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

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

  // 追踪编辑器当前文本（可能未保存）
  const [currentEditorText, setCurrentEditorText] = useState<string>('');
  useEffect(() => {
    if (scene) {
      let text = '';
      if (promptMode === 'video') {
        text = scene.videoPrompt || '';
      } else if (promptMode === 'image') {
        text = imageFrameTab === 'first'
          ? (scene.firstFramePrompt || scene.description || '')
          : (scene.lastFramePrompt || scene.description || '');
      } else {
        text = scene.description || '';
      }
      setCurrentEditorText(text);
    }
  }, [scene?.id, scene?.description, scene?.videoPrompt, scene?.firstFramePrompt, scene?.lastFramePrompt, promptMode, imageFrameTab]);

  // 切换分镜时清除历史版本预览状态
  useEffect(() => {
    setPreviewFrameUrl(null);
    setPreviewFrameType(null);
    setShowHistory(false);
  }, [scene?.id]);

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
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${scene.id}/validate?type=video`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
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

  // 生成视频
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
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      const token = getAuthToken();
      await fetch(`/api/storyboards/${scene.id}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      <div className="h-full flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-center">
          <Film className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
          <p className="text-sm text-[var(--text-muted)]">选择一个分镜以查看详情</p>
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
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 魔术空间 - 全覆盖 */}
      {showMagicSpace && currentFrame && onGenerateWithCamera ? (
        <MagicSpacePanel
          sourceImageUrl={bustCache(currentFrame) || currentFrame}
          aspectRatio={scene.hasAction ? '16:9' : '16:9'}
          onGenerateWithCamera={async (params) => {
            const result = await onGenerateWithCamera(scene.id, params);
            if (result.success) {
              setShowMagicSpace(false);
            } else {
              showToast(result.error || '视角生成失败', 'error');
            }
          }}
          onGenerateWithPaint={async (params) => {
            const result = await onGenerateWithPaint(scene.id, params);
            if (result.success) {
              setShowMagicSpace(false);
            } else {
              showToast(result.error || '涂改生成失败', 'error');
            }
          }}
          onCancel={() => setShowMagicSpace(false)}
          isGenerating={isGeneratingImage}
        />
      ) : (
      <>
      {/* 预览区域 */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
        {/* 生成中遮罩层 */}
        {isGenerating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
            <Loader2 className="w-10 h-10 text-[var(--accent)] animate-spin mb-3" />
            <p className="text-sm font-medium text-white mb-2">
              {isGeneratingImage ? '正在生成首尾帧...' : '正在生成视频...'}
            </p>
            {generatingProgress > 0 && (
              <div className="w-48 flex flex-col items-center gap-1.5">
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, generatingProgress)}%` }}
                  />
                </div>
                <span className="text-xs text-white/70">{Math.round(generatingProgress)}%</span>
              </div>
            )}
            <p className="text-xs text-white/50 mt-2">请勿关闭页面</p>
          </div>
        )}
        {hasVideo ? (
          // 视频预览 + 侧边栏
          <div className="relative w-full h-full flex">
            {/* 视频历史侧边栏 */}
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
            {/* 视频播放区 */}
            <div className="flex-1 relative flex items-center justify-center min-w-0">
              <video
                key={scene.videoUrl}
                src={scene.videoUrl}
                controls
                className="max-w-full max-h-full rounded-lg shadow-2xl"
                style={{ maxHeight: 'calc(100% - 2rem)' }}
              />
              {/* 左上角：历史版本按钮 */}
              <button
                onClick={() => setShowHistory(true)}
                disabled={isGenerating}
                className={`absolute top-2 left-2 p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                  isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/70 hover:text-white'
                }`}
                title="查看历史版本"
              >
                <History className="w-4 h-4" />
                <span className="text-xs">历史版本</span>
              </button>
              {/* 右上角：删除视频 + 视频历史切换 */}
              <div className="absolute top-2 right-2 flex items-center gap-1">
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
          </div>
        ) : hasFrames ? (
          // 帧图片预览
          <div className="relative w-full h-full flex items-center justify-center">
            {currentFrame ? (
              <>
                <img
                  key={currentFrame}
                  src={bustCache(currentFrame) || currentFrame}
                  alt={`分镜 ${sceneIndex + 1} - ${showStartFrame ? '首帧' : '尾帧'}`}
                  className="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-zoom-in hover:ring-2 hover:ring-[var(--accent)]/50 transition-all"
                  style={{ maxHeight: 'calc(100% - 2rem)' }}
                  onClick={openLightbox}
                  title="点击放大预览，拖拽到积木编辑器"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      type: 'reference-image',
                      imageUrl: currentFrame,
                      source: 'frame',
                      frameType: showStartFrame ? 'start' : 'end',
                      sceneId: scene.id
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                />
                {/* 左上角：历史版本按钮 */}
                <button
                  onClick={() => setShowHistory(true)}
                  disabled={isGenerating}
                  className={`absolute top-2 left-2 p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                    isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/70 hover:text-white'
                  }`}
                  title="查看历史版本"
                >
                  <History className="w-4 h-4" />
                  <span className="text-xs">历史版本</span>
                </button>
                {/* 视角调整按钮 */}
                {onGenerateWithCamera && (
                  <button
                    onClick={() => setShowMagicSpace(true)}
                    disabled={isGenerating}
                    className={`absolute top-2 left-28 p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                      isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-purple-500/70 hover:text-white'
                    }`}
                    title="魔术空间 - 涂改/视角调整"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs">魔术空间</span>
                  </button>
                )}
                {/* 高清修复按钮 */}
                {onGenerateHdRepair && (
                  <button
                    onClick={async () => {
                      if (!scene) return;
                      const result = await onGenerateHdRepair(scene.id);
                      if (!result.success) {
                        showToast(result.error || '高清修复失败', 'error');
                      }
                    }}
                    disabled={isGenerating || !currentFrame}
                    className={`absolute top-2 right-12 p-2 rounded-lg bg-black/50 text-white/80 transition-colors flex items-center gap-1.5 ${
                      (isGenerating || !currentFrame) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-500/70 hover:text-white'
                    }`}
                    title="高清修复 - 增强图片分辨率和细节"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span className="text-xs">高清修复</span>
                  </button>
                )}
                {/* 放大按钮提示 */}
                <button
                  onClick={openLightbox}
                  className="absolute bottom-4 right-4 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                  title="放大预览"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              // 当前帧缺失，显示生成按钮
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-32 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center mb-3">
                  <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  {showStartFrame ? '首帧已删除，尾帧已保留' : '尾帧已删除，首帧已保留'}
                </p>
                <Button
                  size="sm"
                  className="pro-btn-primary"
                  startContent={<ImageIcon className="w-4 h-4" />}
                  onPress={handleGenerateImage}
                  isLoading={isGeneratingImage}
                  isDisabled={isGeneratingImage}
                >
                  生成{showStartFrame ? '首帧' : '尾帧'}（参考{showStartFrame ? '尾帧' : '首帧'}）
                </Button>
              </div>
            )}
            
            {/* 帧切换控制 - 动作镜头始终显示切换器 */}
            {scene.hasAction && (scene.startFrame || scene.endFrame) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                <button
                  onClick={() => setShowStartFrame(true)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    showStartFrame
                      ? (scene.startFrame ? 'bg-[var(--accent)] text-white' : 'bg-red-500/60 text-white')
                      : (scene.startFrame ? 'text-white/70 hover:text-white' : 'text-red-400/70 hover:text-red-300')
                  }`}
                >
                  首帧{!scene.startFrame ? '(已删)' : ''}
                </button>
                <button
                  onClick={() => setShowStartFrame(false)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    !showStartFrame
                      ? (scene.endFrame ? 'bg-[var(--accent)] text-white' : 'bg-red-500/60 text-white')
                      : (scene.endFrame ? 'text-white/70 hover:text-white' : 'text-red-400/70 hover:text-red-300')
                  }`}
                >
                  尾帧{!scene.endFrame ? '(已删)' : ''}
                </button>
              </div>
            )}

            {/* 删除帧按钮组 */}
            {currentFrame && (
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {/* 独立删除当前帧 */}
                {scene.hasAction && scene.startFrame && scene.endFrame && (
                  <button
                    onClick={showStartFrame ? handleDeleteFirstFrame : handleDeleteLastFrame}
                    disabled={isGenerating}
                    className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                      isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-500/80'
                    }`}
                    title={`删除${showStartFrame ? '首帧' : '尾帧'}（保留${showStartFrame ? '尾帧' : '首帧'}）`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {/* 删除全部帧 */}
                <button
                  onClick={handleDeleteFrames}
                  disabled={isGenerating}
                  className={`p-2 rounded-lg bg-black/50 text-white transition-colors ${
                    isGenerating ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-500/80'
                  }`}
                  title="删除全部帧"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          // 无媒体时的占位
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-32 h-20 rounded-lg border-2 border-dashed border-[var(--border-color)] flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">暂无预览图片</p>
            <Button
              size="sm"
              className="pro-btn-primary"
              startContent={<ImageIcon className="w-4 h-4" />}
              onPress={handleGenerateImage}
              isLoading={isGeneratingImage}
              isDisabled={isGeneratingImage}
            >
              生成首尾帧
            </Button>
          </div>
        )}
      </div>

      {/* Lightbox 放大预览 */}
      {lightboxOpen && currentFrame && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
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
            <span className="text-xs text-white/70 min-w-[3rem] text-center">{Math.round(lightboxZoom * 100)}%</span>
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

      {/* 信息和操作区域 */}
      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        {/* 元数据 */}
        <div className="px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              分镜 #{sceneIndex + 1}
            </span>
            <div className="flex items-center gap-1.5">
              <StoryboardLockButton
                storyboardId={scene.id}
                isLocked={scene.isLocked || false}
                size="md"
                onLockChange={(locked) => {
                  if (onUpdateScene) {
                    onUpdateScene({ isLocked: locked });
                  }
                }}
              />
              {/* 可编辑的景别选择器 */}
              {onUpdateScene && (
                <ShotSizeSelector
                  value={scene.shotType}
                  onChange={(newValue) => {
                    onUpdateScene({ shotType: newValue });
                  }}
                  compact={false}
                />
              )}
              {/* 只读模式：显示中文景别标签 */}
              {!onUpdateScene && (
                <ShotSizeBadge value={scene.shotType} />
              )}
              {scene.hasAction && (
                <Chip size="sm" variant="flat" className="bg-amber-500/20 text-amber-400 text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  动作镜头
                </Chip>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs items-start">
            <CharacterTagSelector
              characters={scene.characters || []}
              projectCharacters={projectCharacters}
              onSave={(chars) => {
                const charIds = chars
                  .map(name => projectCharacters.find(pc => pc.name === name)?.id)
                  .filter((id): id is number => id !== undefined);
                const curSceneId = projectScenes.find(s => s.name === scene.location)?.id;
                onUpdateCharactersAndLocation?.(chars, scene.location || '', charIds, curSceneId);
              }}
            />
            <PropsTagSelector
              props={scene.props || []}
              projectProps={projectProps}
              onSave={(props) => {
                onUpdateScene?.({ props });
                onUpdateProps?.(props);
              }}
            />
            <SceneDropdownSelector
              location={scene.location || ''}
              projectScenes={projectScenes}
              onSave={(loc) => {
                const charIds = (scene.characters || [])
                  .map(name => projectCharacters.find(pc => pc.name === name)?.id)
                  .filter((id): id is number => id !== undefined);
                const newSceneId = projectScenes.find(s => s.name === loc)?.id;
                onUpdateCharactersAndLocation?.(scene.characters || [], loc, charIds, newSceneId);
              }}
            />
            <DurationSelector
              duration={scene.duration || 3}
              onSave={(val) => {
                onUpdateScene?.({ duration: val });
                onUpdateDuration?.(val);
              }}
            />
          </div>
        </div>

        {/* 导演空间 - 可折叠 */}
        <div className="border-t border-[var(--border-color)]">
          {/* 标题栏 - 无外部控制时可点击折叠 */}
          <div
            onClick={() => directorSpaceOpen === undefined && setInternalDirectorSpaceExpanded(!internalDirectorSpaceExpanded)}
            className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${directorSpaceOpen === undefined ? 'hover:bg-[var(--bg-card-hover)] cursor-pointer' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Blocks className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                导演空间
              </span>
              {/* 生成模式状态标签 */}
              {scene.startFrame && scene.endFrame ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/20 text-rose-400">
                  视频生成
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-400">
                  图片阶段
                </span>
              )}
              {/* 提示词模式切换（展开时显示） */}
              {isDirectorSpaceExpanded && (
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptMode('description');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      promptMode === 'description'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    分镜描述
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptMode('image');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      promptMode === 'image'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    图片提示词
                  </button>
                  {promptMode === 'image' && (
                    <div className="flex items-center gap-0.5 ml-1 p-0.5 bg-[var(--bg-input)] rounded">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageFrameTab('first');
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          imageFrameTab === 'first'
                            ? 'bg-blue-500/30 text-blue-300'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
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
                            ? 'bg-blue-500/30 text-blue-300'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        尾帧
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPromptMode('video');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      promptMode === 'video'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    视频提示词
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isDirectorSpaceExpanded && (
                <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
                  {promptMode === 'video'
                    ? (scene.videoPrompt ? scene.videoPrompt.slice(0, 30) + (scene.videoPrompt.length > 30 ? '...' : '') : '无视频提示词')
                    : promptMode === 'image'
                    ? (() => {
                        const framePrompt = imageFrameTab === 'first'
                          ? (scene.firstFramePrompt || scene.description || '')
                          : (scene.lastFramePrompt || scene.description || '');
                        const label = imageFrameTab === 'first' ? '首帧' : '尾帧';
                        return framePrompt
                          ? `[${label}] ${framePrompt.slice(0, 26)}${framePrompt.length > 26 ? '...' : ''}`
                          : `无${label}提示词`;
                      })()
                    : (scene.baseDescription ? scene.baseDescription.slice(0, 30) + (scene.baseDescription.length > 30 ? '...' : '') : '无分镜描述')
                  }
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDirectorSpaceToggle) {
                    onDirectorSpaceToggle();
                  } else {
                    setInternalDirectorSpaceExpanded(!internalDirectorSpaceExpanded);
                  }
                }}
                className="p-0.5 rounded hover:bg-[var(--bg-card-hover)] transition-colors"
                title={isDirectorSpaceExpanded ? '关闭导演空间' : '打开导演空间'}
              >
                {isDirectorSpaceExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                )}
              </button>
            </div>
          </div>

          {/* 可折叠内容区 */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isDirectorSpaceExpanded ? 'max-h-[660px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-3">
              <div className="h-[580px]">
                {promptMode === 'description' ? (
                  <DescriptionEditor
                    scene={scene}
                    projectId={projectId}
                    onUpdateBaseDescription={onUpdateBaseDescription}
                  />
                ) : (
                  <BlockEditor
                    key={`${scene.id}-${promptMode}-${promptMode === 'image' ? imageFrameTab : ''}`}
                    storyboardId={scene.id}
                    projectId={projectId || undefined}
                    scriptId={scriptId || undefined}
                    promptMode={promptMode}
                    basePrompt={scene.baseDescription || ''}
                    initialBlocks={(() => {
                      const text = promptMode === 'video'
                        ? scene.videoPrompt
                        : promptMode === 'image'
                          ? (imageFrameTab === 'first'
                              ? (scene.firstFramePrompt || scene.description)
                              : (scene.lastFramePrompt || scene.description))
                          : scene.description;
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
                      const token = getAuthToken();
                      const res = await fetch(`/api/storyboards/${scene.id}/content`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
                        if (imageFrameTab === 'first' && onUpdateFirstFramePrompt) {
                          return await onUpdateFirstFramePrompt(state.generatedPrompt);
                        }
                        if (imageFrameTab === 'last' && onUpdateLastFramePrompt) {
                          return await onUpdateLastFramePrompt(state.generatedPrompt);
                        }
                      }
                      const success = await onUpdateDescription(state.generatedPrompt);
                      return success;
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 草图面板 - 已隐藏 */}
        {/*
        <div className="px-4 py-3 border-t border-[var(--border-color)]">
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

        {/* 生成操作 */}
        <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center gap-2 flex-wrap">
          {/* 图片生成 + 模型选择 */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className={hasFrames 
                ? "bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                : "pro-btn-primary"
              }
              startContent={<ImageIcon className="w-4 h-4" />}
              onPress={handleGenerateImage}
              isLoading={isGeneratingImage}
              isDisabled={isGeneratingImage || isGeneratingVideo}
            >
              {hasFrames ? '重新生成帧' : '生成首尾帧'}
            </Button>
            {imageModels.length > 0 && onImageModelChange && (
              <Select
                size="sm"
                selectedKeys={propImageModel ? [propImageModel] : []}
                onChange={(e) => onImageModelChange(e.target.value)}
                classNames={{
                  trigger: "h-8 min-w-[140px] bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50",
                  value: "text-xs",
                  selectorIcon: "text-[var(--text-muted)]"
                }}
                popoverProps={{
                  classNames: { content: "bg-[var(--bg-elevated)] border border-[var(--border-color)]" }
                }}
                aria-label="图片模型"
              >
                {imageModels.map((m) => (
                  <SelectItem key={m.name} textValue={m.name}>
                    <span className="text-xs">{m.name}</span>
                  </SelectItem>
                ))}
              </Select>
            )}
          </div>
          
          {/* 视频生成 + 模型选择 */}
          {hasFrames && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className={hasVideo
                  ? "bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }
                startContent={<Film className="w-4 h-4" />}
                onPress={handleGenerateVideo}
                isLoading={isGeneratingVideo}
                isDisabled={isGeneratingImage || isGeneratingVideo}
              >
                {hasVideo ? '重新生成视频' : '生成视频'}
              </Button>
              {videoModels.length > 0 && onVideoModelChange && (
                <Select
                  size="sm"
                  selectedKeys={propVideoModel ? [propVideoModel] : []}
                  onChange={(e) => onVideoModelChange(e.target.value)}
                  classNames={{
                    trigger: "h-8 min-w-[140px] bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50",
                    value: "text-xs",
                    selectorIcon: "text-[var(--text-muted)]"
                  }}
                  popoverProps={{
                    classNames: { content: "bg-[var(--bg-elevated)] border border-[var(--border-color)]" }
                  }}
                  aria-label="视频模型"
                >
                  {videoModels.map((m) => (
                    <SelectItem key={m.name} textValue={m.name}>
                      <span className="text-xs">{m.name}</span>
                    </SelectItem>
                  ))}
                </Select>
              )}
            </div>
          )}

          {/* 状态提示 */}
          {(isGeneratingImage || isGeneratingVideo) && (
            <span className="text-xs text-[var(--text-muted)] ml-auto">
              {isGeneratingImage ? '正在生成图片...' : '正在生成视频...'}
            </span>
          )}
        </div>
      </div>

      {/* 历史版本面板 */}
      {scene && showHistory && (
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
              // videoUrl 可以是 null（该版本无视频），也要更新
              updates.videoUrl = videoUrl || undefined;
              onUpdateScene(updates);
            }
            setPreviewFrameUrl(null);
            setPreviewFrameType(null);
            showToast('版本已恢复', 'success');
            setShowHistory(false);
          }}
        />
      )}
      </>
      )}
    </div>
  );
};

export default ScenePreviewPanel;
