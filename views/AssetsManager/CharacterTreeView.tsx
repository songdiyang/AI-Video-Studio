import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Star,
  MoreVertical,
  Plus,
  Edit3,
  Layout,
  User,
  Shirt,
  Clock,
  Sparkles
} from 'lucide-react';
import type { Character } from '../StoryBoard/ResourcePanel/types';
import {
  fetchCharacterStates,
  activateCharacterState,
  STATE_CATEGORIES,
  type StateCategory,
  type CharacterState
} from '../../services/assets';

// 状态分类图标映射
const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  daily: User,
  costume: Shirt,
  time: Clock,
  effect: Sparkles,
};

// 状态分类颜色映射
const CATEGORY_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  daily: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  costume: { bg: 'bg-pink-500/15', text: 'text-pink-400' },
  time: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  effect: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
};

// 解析标签JSON字符串
function parseTags(tagsStr?: string): string[] {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================
// Props 接口定义
// ============================================================

interface CharacterTreeViewProps {
  characters: Character[];
  projectId: number;
  onSelectCharacter?: (character: Character) => void;
  onSelectState?: (character: Character, state: CharacterState) => void;
  onEditCharacter?: (character: Character) => void;
  onEditState?: (character: Character, state: CharacterState) => void;
  onOpenLifecycle?: (character: Character) => void;
  onStateActivated?: (character: Character, state: CharacterState) => void;
  selectedCharacterId?: number;
  selectedStateId?: number;
  className?: string;
}

// 内部选中项类型
interface SelectedItem {
  type: 'character' | 'state';
  characterId: number;
  stateId?: number;
}

// ============================================================
// 获取状态缩略图URL
// ============================================================
function getStateThumbnail(state: CharacterState): string | undefined {
  return state.image_url || state.front_view_url || undefined;
}

// 获取角色的激活状态名称
function getActiveStateName(states: CharacterState[] | undefined): string | undefined {
  if (!states) return undefined;
  const active = states.find(s => s.is_active);
  return active?.name;
}

// ============================================================
// 角色树形结构组件
// ============================================================

const CharacterTreeView: React.FC<CharacterTreeViewProps> = ({
  characters,
  projectId,
  onSelectCharacter,
  onSelectState,
  onEditCharacter,
  onEditState,
  onOpenLifecycle,
  onStateActivated,
  selectedCharacterId,
  selectedStateId,
  className = ''
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [characterStates, setCharacterStates] = useState<Record<number, CharacterState[]>>({});
  const [loadingStates, setLoadingStates] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<SelectedItem | null>(null);
  const [activatingStateId, setActivatingStateId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步外部选中状态到内部
  useEffect(() => {
    if (selectedCharacterId != null && selectedStateId != null) {
      setSelectedId({ type: 'state', characterId: selectedCharacterId, stateId: selectedStateId });
    } else if (selectedCharacterId != null) {
      setSelectedId({ type: 'character', characterId: selectedCharacterId });
    }
  }, [selectedCharacterId, selectedStateId]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  // 加载角色状态列表
  const loadStates = useCallback(async (characterId: number) => {
    setLoadingStates(prev => new Set(prev).add(characterId));
    try {
      const states = await fetchCharacterStates(characterId);
      setCharacterStates(prev => ({ ...prev, [characterId]: states }));
    } catch (error) {
      console.error('加载角色状态失败:', error);
    } finally {
      setLoadingStates(prev => {
        const next = new Set(prev);
        next.delete(characterId);
        return next;
      });
    }
  }, []);

  // 切换展开/折叠
  const toggleExpand = useCallback((character: Character) => {
    const id = character.id;
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!characterStates[id]) {
          loadStates(id);
        }
      }
      return next;
    });
    setSelectedId({ type: 'character', characterId: id });
    onSelectCharacter?.(character);
  }, [characterStates, loadStates, onSelectCharacter]);

  // 选中状态节点
  const handleSelectState = useCallback((character: Character, state: CharacterState) => {
    setSelectedId({ type: 'state', characterId: character.id, stateId: state.id });
    onSelectState?.(character, state);
  }, [onSelectState]);

  // 双击状态节点
  const handleDoubleClickState = useCallback((character: Character, state: CharacterState) => {
    onEditState?.(character, state);
  }, [onEditState]);

  // 激活状态
  const handleActivateState = useCallback(async (
    character: Character,
    state: CharacterState,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (activatingStateId !== null) return;
    setActivatingStateId(state.id);
    try {
      const activated = await activateCharacterState(character.id, state.id);
      const refreshed = await fetchCharacterStates(character.id);
      setCharacterStates(prev => ({ ...prev, [character.id]: refreshed }));
      onStateActivated?.(character, activated);
    } catch (error) {
      console.error('激活状态失败:', error);
    } finally {
      setActivatingStateId(null);
    }
  }, [activatingStateId, onStateActivated]);

  // 菜单操作
  const handleMenuAction = useCallback((action: string, character: Character) => {
    setMenuOpenId(null);
    if (action === 'edit') {
      onEditCharacter?.(character);
    } else if (action === 'addState') {
      if (!expandedIds.has(character.id)) {
        setExpandedIds(prev => new Set(prev).add(character.id));
        if (!characterStates[character.id]) loadStates(character.id);
      }
      onEditCharacter?.(character);
    } else if (action === 'lifecycle') {
      onOpenLifecycle?.(character);
    }
  }, [expandedIds, characterStates, loadStates, onEditCharacter, onOpenLifecycle]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!characters.length) return;

    // 构建扁平导航列表
    const navItems: SelectedItem[] = [];
    for (const char of characters) {
      navItems.push({ type: 'character', characterId: char.id });
      if (expandedIds.has(char.id) && characterStates[char.id]) {
        for (const st of characterStates[char.id]) {
          navItems.push({ type: 'state', characterId: char.id, stateId: st.id });
        }
      }
    }
    if (!navItems.length) return;

    const curIdx = navItems.findIndex(item => {
      if (!selectedId) return false;
      if (item.type !== selectedId.type) return false;
      if (item.characterId !== selectedId.characterId) return false;
      return item.type === 'character' || item.stateId === selectedId.stateId;
    });

    const selectItem = (item: SelectedItem) => {
      setSelectedId(item);
      if (item.type === 'character') {
        const c = characters.find(ch => ch.id === item.characterId);
        if (c) onSelectCharacter?.(c);
      } else {
        const c = characters.find(ch => ch.id === item.characterId);
        const s = characterStates[item.characterId]?.find(st => st.id === item.stateId);
        if (c && s) onSelectState?.(c, s);
      }
    };

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = curIdx < navItems.length - 1 ? curIdx + 1 : 0;
        selectItem(navItems[next]);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = curIdx > 0 ? curIdx - 1 : navItems.length - 1;
        selectItem(navItems[prev]);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (selectedId?.type === 'character') {
          const c = characters.find(ch => ch.id === selectedId.characterId);
          if (c) toggleExpand(c);
        }
        break;
      }
      case ' ': {
        e.preventDefault();
        if (selectedId?.type === 'state') {
          const c = characters.find(ch => ch.id === selectedId.characterId);
          const s = characterStates[selectedId.characterId]?.find(st => st.id === selectedId.stateId);
          if (c && s && !s.is_active) {
            // 用合成事件模拟stopPropagation
            handleActivateState(c, s, { stopPropagation: () => {} } as React.MouseEvent);
          }
        }
        break;
      }
    }
  }, [characters, expandedIds, characterStates, selectedId, toggleExpand, handleActivateState, onSelectCharacter, onSelectState]);

  // ============================================================
  // 渲染：角色根节点
  // ============================================================
  const renderCharacterNode = (character: Character) => {
    const isExpanded = expandedIds.has(character.id);
    const isSelected = selectedId?.type === 'character' && selectedId.characterId === character.id;
    const states = characterStates[character.id];
    const isLoading = loadingStates.has(character.id);
    const statesCount = character.statesCount ?? states?.length ?? 0;
    const activeStateName = getActiveStateName(states);
    const isMenuOpen = menuOpenId === character.id;

    return (
      <div key={character.id} className="select-none">
        {/* 角色行 */}
        <div
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            isSelected
              ? 'bg-slate-800 ring-1 ring-amber-500/50'
              : 'hover:bg-slate-800'
          }`}
          onClick={() => toggleExpand(character)}
          role="treeitem"
          aria-expanded={isExpanded}
          tabIndex={-1}
        >
          {/* 展开/折叠图标 */}
          <span className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-400">
            {isExpanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            }
          </span>

          {/* 角色头像 */}
          <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
            {character.imageUrl ? (
              <img
                src={character.imageUrl}
                alt={character.name}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            ) : (
              <User className="w-4 h-4 text-slate-500" />
            )}
          </div>

          {/* 角色名称 + 标签 */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm truncate">
              {character.name}
            </span>
            {statesCount > 0 && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
                {statesCount}
              </span>
            )}
            {activeStateName && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 truncate max-w-24">
                {activeStateName}
              </span>
            )}
          </div>

          {/* 更多菜单 */}
          <div className="relative shrink-0" ref={isMenuOpen ? menuRef : undefined}>
            <button
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(isMenuOpen ? null : character.id);
              }}
              aria-label="更多操作"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* 下拉菜单 */}
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-36">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleMenuAction('edit', character); }}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  编辑角色
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleMenuAction('addState', character); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加状态
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleMenuAction('lifecycle', character); }}
                >
                  <Layout className="w-3.5 h-3.5" />
                  生命周期面板
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 子状态列表 - 按分类分组 */}
        {isExpanded && (
          <div className="ml-4 border-l border-slate-600 pl-3">
            {isLoading ? (
              // 加载骨架
              <div className="space-y-2 py-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <div className="w-6 h-6 rounded bg-slate-700 animate-pulse" />
                    <div className="flex-1 h-4 rounded bg-slate-700 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : states && states.length > 0 ? (
              // 按分类分组渲染状态
              (() => {
                // 排序：白膜置顶
                const sorted = [...states].sort((a, b) => {
                  if (a.is_base_model && !b.is_base_model) return -1;
                  if (!a.is_base_model && b.is_base_model) return 1;
                  const catA = a.state_category || 'daily';
                  const catB = b.state_category || 'daily';
                  if (catA !== catB) return catA.localeCompare(catB);
                  return (a.sort_order || 0) - (b.sort_order || 0);
                });
                
                // 按分类分组
                const grouped: Record<string, CharacterState[]> = {};
                for (const s of sorted) {
                  const cat = s.state_category || 'daily';
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(s);
                }
                
                return STATE_CATEGORIES
                  .filter(cat => grouped[cat.key])
                  .map(cat => {
                    const CatIcon = CATEGORY_ICON_MAP[cat.key];
                    const colors = CATEGORY_COLOR_MAP[cat.key];
                    const catStates = grouped[cat.key];
                    return (
                      <div key={cat.key} className="mb-1">
                        {/* 分类标签头 */}
                        <div className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium ${colors.text} opacity-70`}>
                          <CatIcon className="w-3 h-3" />
                          {cat.label}
                        </div>
                        {/* 分类下的状态列表 */}
                        {catStates.map(state => renderStateNode(character, state))}
                      </div>
                    );
                  });
              })()
            ) : (
              // 空状态
              <div
                className="px-3 py-3 text-sm text-slate-500 flex items-center gap-2 cursor-pointer hover:text-slate-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); handleMenuAction('addState', character); }}
              >
                <Plus className="w-3.5 h-3.5" />
                暂无状态，点击添加
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // 渲染：状态子节点
  // ============================================================
  const renderStateNode = (character: Character, state: CharacterState) => {
    const isSelected = selectedId?.type === 'state'
      && selectedId.characterId === character.id
      && selectedId.stateId === state.id;
    const thumb = getStateThumbnail(state);
    const isActivating = activatingStateId === state.id;
    const category = state.state_category || 'daily';
    const colors = CATEGORY_COLOR_MAP[category];
    const stateTags = parseTags(state.tags);

    return (
      <div
        key={state.id}
        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-slate-800/70 ring-1 ring-amber-500/30'
            : 'hover:bg-slate-800/50'
        }`}
        onClick={() => handleSelectState(character, state)}
        onDoubleClick={() => handleDoubleClickState(character, state)}
        role="treeitem"
        tabIndex={-1}
      >
        {/* 状态缩略图 / 白膜图标 */}
        <div className={`shrink-0 w-6 h-6 rounded overflow-hidden flex items-center justify-center ${
          state.is_base_model ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-slate-700'
        }`}>
          {thumb ? (
            <img
              src={thumb}
              alt={state.name}
              className="w-full h-full object-cover object-top"
              loading="lazy"
            />
          ) : state.is_base_model ? (
            <Star className="w-3 h-3 text-amber-400" />
          ) : (
            <div className="w-full h-full bg-slate-600" />
          )}
        </div>

        {/* 状态名称 */}
        <span className="text-sm text-slate-200 truncate shrink-0 max-w-28">
          {state.name}
        </span>

        {/* 标签区域 */}
        <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
          {state.is_active && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-current" />
            </span>
          )}
          {state.is_base_model && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
              白膜
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
            {React.createElement(CATEGORY_ICON_MAP[category], { className: 'w-2.5 h-2.5 inline' })}
          </span>
          {state.age_stage && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {state.age_stage}
            </span>
          )}
          {state.outfit && (
            <span className="w-2 h-2 rounded-full bg-pink-400 shrink-0" title="有服装" />
          )}
          {stateTags.length > 0 && (
            <span className="text-xs px-1 py-0 rounded bg-slate-700/50 text-slate-400 truncate max-w-16">
              {stateTags[0]}{stateTags.length > 1 ? `+${stateTags.length - 1}` : ''}
            </span>
          )}
        </div>

        {/* 激活按钮 */}
        <button
          className={`shrink-0 p-1 rounded transition-colors ${
            state.is_active
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-amber-400 opacity-0 group-hover:opacity-100'
          } ${isActivating ? 'animate-pulse' : ''}`}
          onClick={(e) => handleActivateState(character, state, e)}
          disabled={isActivating || state.is_active}
          title={state.is_active ? '当前激活状态' : '点击激活此状态'}
          aria-label={state.is_active ? '当前激活状态' : '激活此状态'}
        >
          <Star className={`w-3.5 h-3.5 ${state.is_active ? 'fill-current' : ''}`} />
        </button>
      </div>
    );
  };

  // ============================================================
  // 主体渲染
  // ============================================================
  return (
    <div
      ref={containerRef}
      className={`bg-slate-900 rounded-lg overflow-y-auto ${className}`}
      role="tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="角色树形结构"
    >
      {characters.length > 0 ? (
        characters.map(renderCharacterNode)
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <User className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">暂无角色</p>
        </div>
      )}
    </div>
  );
};

export default CharacterTreeView;
