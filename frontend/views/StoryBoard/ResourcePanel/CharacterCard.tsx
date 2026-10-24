import React, { useState, useRef, useEffect } from 'react';
import { Card, CardBody, Tooltip } from '@heroui/react';
import { Trash2, ChevronDown, Check, Film, Edit2, Loader2, Shirt } from 'lucide-react';
import { Character, CharacterState } from './types';
import { fetchCharacterStates } from '../../../services/assets';

interface ContextMenuState {
  x: number;
  y: number;
  character: Character;
}

interface CharacterCardProps {
  character: Character;
  scenes?: any[];
  isGenerating?: boolean;
  /** 分镜面板选中的状态（不影响全局激活状态） */
  storyboardState?: { stateId: number; stateName: string; stateImage?: string; stateOutfit?: string } | null;
  onGenerateViews: (charName: string, characterId: number) => void;
  onShowDetail: (character: Character) => void;
  onDelete?: (character: Character) => void;
  /** 用户在资源面板选择了某个状态用于分镜 */
  onStoryboardStateChange?: (characterId: number, state: { stateId: number; stateName: string; stateImage?: string; stateOutfit?: string } | null) => void;
}

/**
 * 角色资源行（无头像紧凑双行）：左栏是扫读面板，头像与详情交给双击打开的
 * 资源标签页；本行只保留名称、白膜/状态指示与一行体貌摘要。
 */
const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  scenes,
  isGenerating = false,
  storyboardState,
  onGenerateViews,
  onShowDetail,
  onDelete,
  onStoryboardStateChange,
}) => {
  // 双击打开角色编辑标签页（有回调时优先走工作台注册的入口）
  const openEditor = () => {
    if (onShowDetail) { onShowDetail(character); return; }
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'character',
        assetId: character.id,
        assetName: character.name,
        initialData: character,
      }
    }));
  };
  const handleDoubleClick = () => openEditor();

  const hasBaseModelViews = character.has_base_model_views === true || character.has_base_model_views === 1;
  const statesCount = character.statesCount ?? 0;

  // 如果有分镜覆写状态，优先显示；否则用全局激活状态
  const displayStateName = storyboardState?.stateName ?? character.active_state_name;
  const sceneCount = scenes?.filter(s => s.characters?.includes(character.name)).length || 0;
  const appearanceSummary = character.base_appearance || character.appearance;

  // 状态选择下拉
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [statesList, setStatesList] = useState<CharacterState[] | null>(null);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStateDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setIsStateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isStateDropdownOpen]);

  const handleOpenStateDropdown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStateDropdownOpen) {
      setIsStateDropdownOpen(false);
      return;
    }
    setIsStateDropdownOpen(true);
    // 懒加载状态列表
    if (!statesList) {
      setIsLoadingStates(true);
      try {
        const states = await fetchCharacterStates(character.id);
        setStatesList(states.filter(s => !s.is_base_model)); // 只显示非白膜状态
      } catch {
        setStatesList([]);
      } finally {
        setIsLoadingStates(false);
      }
    }
  };

  const handleSelectState = (state: CharacterState) => {
    const imageUrl = state.image_url || state.front_view_url;
    onStoryboardStateChange?.(character.id, {
      stateId: state.id,
      stateName: state.name,
      stateImage: imageUrl,
      stateOutfit: state.outfit,
    });
    setIsStateDropdownOpen(false);
  };

  const handleClearStateOverride = () => {
    onStoryboardStateChange?.(character.id, null);
    setIsStateDropdownOpen(false);
  };

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, character });
  };

  const handleDeleteFromMenu = () => {
    if (!contextMenu || !onDelete) return;
    onDelete(contextMenu.character);
    setContextMenu(null);
  };

  // 状态 chip 只在确有内容时渲染：「无状态」这类默认态不占视觉
  const showStateChip = statesCount > 0 || !!displayStateName || !!storyboardState;

  return (
    <Card
      className="group w-full rounded-lg border border-(--border-color) bg-(--bg-card) shadow-none transition-colors hover:border-(--accent)/30 hover:bg-(--bg-card-hover)"
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <CardBody className="px-2.5 py-1.5">
        {/* 行 1：名称 + 白膜/状态指示 + 关联分镜数 + 悬停编辑 */}
        <div className="flex items-center gap-1.5">
          <h4 className="min-w-0 truncate text-[13px] font-semibold text-(--text-primary)">{character.name}</h4>
          {isGenerating ? (
            <Tooltip content="正在生成白膜三视图">
              <span className="shrink-0 inline-flex">
                <Loader2 className="h-3 w-3 animate-spin text-(--accent)" />
              </span>
            </Tooltip>
          ) : hasBaseModelViews ? (
            <Tooltip content="白膜三视图已生成，角色体貌一致性有保障">
              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400/90" />
            </Tooltip>
          ) : null}
          {showStateChip && (
            <div className="relative shrink-0" ref={stateDropdownRef}>
              <Tooltip content={statesCount > 0 ? `共 ${statesCount} 个状态 · 点击选择分镜使用的状态` : '暂无可切换的状态'}>
                <button
                  onClick={handleOpenStateDropdown}
                  className={`inline-flex max-w-28 items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    storyboardState
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                      : displayStateName
                        ? 'bg-pink-500/15 text-pink-400 border-pink-500/30 hover:bg-pink-500/25'
                        : 'bg-(--bg-app) text-(--text-muted) border-(--border-color) hover:bg-white/5'
                  }`}
                  disabled={statesCount === 0}
                >
                  <Shirt className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{displayStateName || '选择状态'}</span>
                  {statesCount > 0 && <ChevronDown className="w-2.5 h-2.5 shrink-0" />}
                </button>
              </Tooltip>
              {/* 状态下拉菜单 */}
              {isStateDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-44 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl p-1.5 space-y-0.5">
                  {isLoadingStates ? (
                    <div className="text-xs text-[var(--text-muted)] px-2 py-2 text-center">加载中...</div>
                  ) : !statesList || statesList.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)] px-2 py-2 text-center">暂无非白膜状态</div>
                  ) : (
                    <>
                      {storyboardState && (
                        <button
                          onClick={handleClearStateOverride}
                          className="w-full text-left px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-500/10 transition-colors flex items-center gap-1.5"
                        >
                          <div className="w-3 h-3 shrink-0" />
                          <span className="text-[var(--text-muted)]">恢复默认</span>
                        </button>
                      )}
                      {statesList.map(st => {
                        const isSelected = storyboardState?.stateId === st.id;
                        const stImg = st.image_url || st.front_view_url;
                        return (
                          <button
                            key={st.id}
                            onClick={() => handleSelectState(st)}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                              isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {isSelected ? <Check className="w-3 h-3 shrink-0" /> : <div className="w-3 h-3 shrink-0" />}
                            {stImg ? <img src={stImg} className="w-4 h-4 rounded-full object-cover shrink-0" alt="" /> : null}
                            <span className="truncate flex-1">{st.name}</span>
                            {st.outfit && <span className="text-[9px] text-pink-400/60 truncate max-w-12">{st.outfit}</span>}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <span title="关联分镜" className="inline-flex items-center gap-0.5 text-[10px] text-(--text-muted)">
              <Film className="h-3 w-3" />{sceneCount}
            </span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); openEditor(); }}
              className="rounded p-0.5 text-(--text-muted) opacity-0 transition-opacity hover:bg-white/5 hover:text-(--text-primary) group-hover:opacity-100 focus-visible:opacity-100"
              title="编辑角色"
              aria-label="编辑角色"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* 行 2：一行体貌摘要（无则整行省略） */}
        {appearanceSummary && (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-(--text-secondary)">{appearanceSummary}</p>
        )}
      </CardBody>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-2 text-xs text-left flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={handleDeleteFromMenu}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除角色
          </button>
        </div>
      )}
    </Card>
  );
};

export default CharacterCard;
