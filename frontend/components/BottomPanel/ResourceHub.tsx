import React, { useId } from 'react';
import { Users, MapPin, Film, Search } from 'lucide-react';
import type { StoryboardScene } from '../../views/StoryBoard/useSceneManager';

/** 底部面板聚合视图的三个资源页签 */
export type HubViewTab = 'characters' | 'studios' | 'storyboards';

export interface HubCharacterItem {
  id: number;
  name: string;
  image_url?: string;
  front_view_url?: string;
  active_state_image_url?: string;
  base_front_view_url?: string;
  active_state_name?: string;
  states_count?: number;
}

export interface HubStudioItem {
  id: number;
  name: string;
  description?: string;
}

export interface BottomPanelTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  title?: string;
}

/** 底部面板视图标签栏：沿用 ContentEditorPanel 的 tablist 键盘导航规范（←/→/Home/End）。 */
export const BottomPanelTabBar: React.FC<{
  tabs: BottomPanelTabItem[];
  active: string;
  onChange: (id: string) => void;
  trailing?: React.ReactNode;
}> = ({ tabs, active, onChange, trailing }) => {
  const groupId = useId();
  return (
    <div className="flex h-7 shrink-0 items-center gap-1 border-b border-(--border-color)">
      <div role="tablist" aria-label="底部面板视图" className="flex items-center gap-0.5">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            id={`${groupId}-tab-${tab.id}`}
            role="tab"
            aria-selected={active === tab.id}
            title={tab.title}
            tabIndex={active === tab.id ? 0 : -1}
            className={`flex items-center gap-1 rounded-t-md px-2 py-1 text-[11px] leading-4 transition-colors ${
              active === tab.id
                ? 'bg-(--bg-card-hover) text-(--text-primary)'
                : 'text-(--text-muted) hover:text-(--text-secondary)'
            }`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              onChange(tabs[next].id);
              document.getElementById(`${groupId}-tab-${tabs[next].id}`)?.focus();
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="text-[10px] opacity-60">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
    </div>
  );
};

export interface ResourceHubProps {
  activeTab: HubViewTab;
  /** 视图内过滤关键字，由宿主（标签栏搜索框）控制 */
  filterText: string;
  /** 角色/影棚/分镜数据全部由宿主（工作台）传入，聚合视图不自行加载 */
  characters: HubCharacterItem[];
  studios: HubStudioItem[];
  storyboards: StoryboardScene[];
  /** 当前分镜引用的角色与影棚，用于高亮聚合视图中的对应卡片 */
  currentSceneCharacters?: string[];
  currentSceneLocation?: string;
  activeStoryboardId?: number | null;
  onEditCharacter: (character: HubCharacterItem) => void;
  onEditStudio: (studio: HubStudioItem) => void;
  onOpenStoryboard: (sceneId: number) => void;
}

const CARD_BASE = 'group shrink-0 cursor-pointer rounded-lg border border-(--border-color) bg-(--bg-card) p-1.5 text-left transition-colors hover:border-(--accent)/50';
const TITLE_BASE = 'truncate text-[11px] leading-4 text-(--text-secondary) group-hover:text-(--text-primary)';

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex h-full min-h-12 items-center justify-center text-xs text-(--text-muted)">{text}</div>
);

/** 底部面板聚合视图：角色 / 影棚 / 分镜三类项目资源的统一浏览入口。 */
export const ResourceHub: React.FC<ResourceHubProps> = ({
  activeTab, filterText, characters, studios, storyboards,
  currentSceneCharacters, currentSceneLocation, activeStoryboardId,
  onEditCharacter, onEditStudio, onOpenStoryboard,
}) => {
  const query = filterText.trim().toLowerCase();

  if (activeTab === 'characters') {
    const filtered = characters.filter(c => !query || c.name.toLowerCase().includes(query));
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex gap-2 overflow-x-auto py-2">
          {filtered.length === 0 && <EmptyHint text={query ? '没有匹配的角色' : '项目暂无角色，可在左侧资源面板创建'} />}
          {filtered.map(c => {
            const thumb = c.active_state_image_url || c.base_front_view_url || c.front_view_url || c.image_url;
            const inScene = currentSceneCharacters?.includes(c.name);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onEditCharacter(c)}
                title={c.name}
                className={`${CARD_BASE} w-[88px]${inScene ? ' border-(--accent)/60' : ''}`}
              >
                {thumb ? (
                  <img src={thumb} alt={c.name} loading="lazy" className="h-16 w-full rounded-md object-cover" />
                ) : (
                  <span className="flex h-16 w-full items-center justify-center rounded-md bg-(--bg-input)">
                    <Users className="w-5 h-5 text-(--text-muted)" />
                  </span>
                )}
                <div className={`${TITLE_BASE} mt-1`}>{c.name}</div>
                <div className="truncate text-[10px] leading-3.5 text-(--text-muted)">
                  {inScene ? '当前分镜' : c.active_state_name || (c.states_count ? `${c.states_count} 个状态` : '白膜')}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeTab === 'studios') {
    const filtered = studios.filter(s => !query || s.name.toLowerCase().includes(query) || (s.description || '').toLowerCase().includes(query));
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex gap-2 overflow-x-auto py-2">
          {filtered.length === 0 && <EmptyHint text={query ? '没有匹配的影棚' : '项目暂无影棚资源'} />}
          {filtered.map(s => {
            const inScene = !!currentSceneLocation && s.name === currentSceneLocation;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onEditStudio(s)}
                title={s.description || s.name}
                className={`${CARD_BASE} w-[124px]${inScene ? ' border-(--accent)/60' : ''}`}
              >
                <span className={`flex h-11 w-full items-center justify-center rounded-md ${inScene ? 'bg-(--accent)/10' : 'bg-(--bg-input)'}`}>
                  <MapPin className={`w-5 h-5 ${inScene ? 'text-(--accent)' : 'text-(--text-muted)'}`} />
                </span>
                <div className={`${TITLE_BASE} mt-1`}>{s.name}</div>
                <div className="truncate text-[10px] leading-3.5 text-(--text-muted)">
                  {inScene ? '当前分镜' : s.description || '未填写描述'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const filtered = storyboards.filter(s => !query
    || (s.location || '').toLowerCase().includes(query)
    || (s.description || '').toLowerCase().includes(query)
    || (s.characters || []).some(name => name.toLowerCase().includes(query))
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 overflow-x-auto py-2">
        {filtered.length === 0 && <EmptyHint text={query ? '没有匹配的分镜' : '当前集还没有分镜'} />}
        {filtered.map((s, index) => {
          const sceneIndex = storyboards.findIndex(item => item.id === s.id) + 1;
          const thumb = s.startFrame || s.imageUrl || s.videoUrl;
          const isActive = activeStoryboardId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenStoryboard(s.id)}
              title={s.description || `分镜 #${sceneIndex}`}
              className={`${CARD_BASE} w-[116px]${isActive ? ' border-(--accent)/60' : ''}`}
            >
              {thumb ? (
                <img src={thumb} alt="" loading="lazy" className="h-16 w-full rounded-md object-cover" />
              ) : (
                <span className="flex h-16 w-full items-center justify-center rounded-md bg-(--bg-input)">
                  <Film className="w-5 h-5 text-(--text-muted)" />
                </span>
              )}
              <div className={`${TITLE_BASE} mt-1`}>分镜 #{sceneIndex}{isActive ? '（当前）' : ''}</div>
              <div className="truncate text-[10px] leading-3.5 text-(--text-muted)">
                {s.location || '未选影棚'} · {s.duration || 0}s
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** 聚合视图标签栏右侧的轻量搜索框（各视图内按名称/描述过滤）。 */
export const HubSearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <span className="flex h-5.5 w-36 items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-input) px-1.5">
    <Search className="w-3 h-3 shrink-0 text-(--text-muted)" />
    <input
      className="min-w-0 flex-1 bg-transparent text-[11px] leading-4 text-(--text-primary) placeholder-(--text-muted) outline-none"
      placeholder="搜索..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </span>
);
