import React, { useState, useRef, useEffect } from 'react';
import { Card, CardBody, Button, Tooltip } from '@heroui/react';
import { Layers, Eye, Loader2, Star, Shirt, Trash2, ChevronDown, Check } from 'lucide-react';
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
  // 双击打开角色编辑标签页
  const handleDoubleClick = () => {
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'character',
        assetId: character.id,
        assetName: character.name,
        initialData: character,
      }
    }));
  };

  const hasBaseModelViews = character.has_base_model_views === true || character.has_base_model_views === 1;
  const statesCount = character.statesCount ?? 0;

  // 如果有分镜覆写状态，优先显示；否则用全局激活状态
  const displayStateName = storyboardState?.stateName ?? character.active_state_name;
  const displayStateOutfit = storyboardState?.stateOutfit ?? character.active_state_outfit;
  const displayStateImage = storyboardState?.stateImage ?? character.active_state_image_url;

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

  return (
    <Card
      className="w-full bg-slate-800/60 shadow-sm hover:shadow-md hover:shadow-blue-500/5 transition-shadow border border-slate-700/50"
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <CardBody className="p-3">
        <div className="flex items-start gap-3 mb-3 h-[88px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-slate-100 truncate">{character.name}</h4>
              </div>
              <span className="text-xs text-slate-500 ml-2">
                {scenes?.filter(s => s.characters?.includes(character.name)).length || 0} 次
              </span>
            </div>
            {/* 白膜/服装分层标识行 + 状态选择器 */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {hasBaseModelViews ? (
                <Tooltip content="白膜三视图已生成，角色体貌一致性有保障">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Star className="w-2.5 h-2.5" />
                    白膜
                  </span>
                </Tooltip>
              ) : (
                <Tooltip content="白膜未生成，建议先生成白膜保持角色一致性">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30">
                    <Star className="w-2.5 h-2.5" />
                    未生成白膜
                  </span>
                </Tooltip>
              )}
              {/* 状态选择器：可点击切换分镜使用的状态 */}
              <div className="relative" ref={stateDropdownRef}>
                <Tooltip content={statesCount > 0 ? '点击选择分镜使用的状态' : '暂无可用状态'}>
                  <button
                    onClick={handleOpenStateDropdown}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      storyboardState
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                        : displayStateName
                          ? 'bg-pink-500/15 text-pink-400 border-pink-500/30 hover:bg-pink-500/25'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/25'
                    }`}
                    disabled={statesCount === 0}
                  >
                    <Shirt className="w-2.5 h-2.5" />
                    {displayStateName || '选择状态'}
                    {statesCount > 0 && <ChevronDown className="w-2.5 h-2.5" />}
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
              {statesCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">
                  {statesCount} 状态
                </span>
              )}
            </div>
            {/* 外貌显示：优先展示白膜+服装分层信息 */}
            {character.base_appearance ? (
              <div className="space-y-0.5">
                <p className="text-xs text-cyan-400/80 line-clamp-1">
                  <span className="font-semibold text-cyan-400/60">体貌：</span>{character.base_appearance}
                </p>
                {(displayStateOutfit || character.outfit_appearance) && (
                  <p className="text-xs text-pink-400/80 line-clamp-1">
                    <span className="font-semibold text-pink-400/60">服装：</span>{displayStateOutfit || character.outfit_appearance}
                  </p>
                )}
              </div>
            ) : character.appearance ? (
              <p className="text-xs text-slate-400 line-clamp-2 mb-1">
                <span className="font-semibold">外貌：</span>{character.appearance}
              </p>
            ) : null}
            {character.personality && (
              <p className="text-xs text-slate-400 line-clamp-1">
                <span className="font-semibold">性格：</span>{character.personality}
              </p>
            )}
          </div>
        </div>
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
