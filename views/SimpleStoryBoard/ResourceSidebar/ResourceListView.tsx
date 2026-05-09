import React, { useState } from 'react';
import { Plus, Search, Sparkles } from 'lucide-react';
import { Character, PropItem } from '../../StoryBoard/ResourcePanel/types';
import { Scene } from '../../StoryBoard/ResourcePanel/useSceneData';
import ResourceCard from './ResourceCard';

type TabType = 'character' | 'scene' | 'prop';

interface ResourceListViewProps {
  dbCharacters: Character[];
  dbScenes: Scene[];
  props: PropItem[];
  /** 分镜中实际使用的角色名列表 */
  usedCharacterNames: string[];
  /** 分镜中实际使用的场景名列表 */
  usedSceneNames: string[];
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onCharacterClick: (character: Character) => void;
  onCharacterDoubleClick?: (character: Character) => void;
  onSceneClick: (scene: Scene) => void;
  onPropClick: (prop: PropItem) => void;
  onBatchGenerate?: () => void;
}

const tabs: { key: TabType; label: string }[] = [
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'prop', label: '道具' },
];

const ResourceListView: React.FC<ResourceListViewProps> = ({
  dbCharacters,
  dbScenes,
  props,
  usedCharacterNames,
  usedSceneNames,
  activeTab,
  onTabChange,
  onCharacterClick,
  onCharacterDoubleClick,
  onSceneClick,
  onPropClick,
  onBatchGenerate,
}) => {
  const [search, setSearch] = useState('');

  const filteredChars = dbCharacters.filter(c => !search || c.name.includes(search));
  const filteredScenes = dbScenes.filter(s => !search || s.name.includes(search));
  const filteredProps = props.filter(p => !search || p.name.includes(search));

  return (
    <div className="flex flex-col h-full">
      {/* Tab 切换 + 批量生成 */}
      <div className="px-3 pt-3 pb-2 space-y-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: activeTab === t.key ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                color: activeTab === t.key ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: activeTab === t.key ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          {onBatchGenerate && (
            <button
              onClick={onBatchGenerate}
              className="px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1"
              style={{
                color: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              <Sparkles className="w-3 h-3" />
              批量生成
            </button>
          )}
        </div>

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`搜索${tabs.find(t => t.key === activeTab)?.label}...`}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* ========== 角色 Tab ========== */}
        {activeTab === 'character' && (
          <div className="space-y-4">
            {/* 作品中角色 */}
            {(() => {
              const inUse = filteredChars.filter(c => usedCharacterNames.includes(c.name));
              const notInUse = filteredChars.filter(c => !usedCharacterNames.includes(c.name));
              // 未入库但在分镜中使用的角色名
              const dbCharNames = new Set(dbCharacters.map(c => c.name));
              const unlinkedNames = usedCharacterNames.filter(n => !dbCharNames.has(n) && (!search || n.includes(search)));
              const totalInUse = inUse.length + unlinkedNames.length;
              return (
                <>
                  {totalInUse > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>作品中角色 ({totalInUse})</div>
                      <div className="grid grid-cols-3 gap-2">
                        {inUse.map(c => (
                          <ResourceCard
                            key={c.id}
                            type="character"
                            name={c.name}
                            imageUrl={c.imageUrl || c.frontViewUrl}
                            isActive
                            onClick={() => onCharacterClick(c)}
                            onDoubleClick={() => onCharacterDoubleClick?.(c)}
                          />
                        ))}
                        {unlinkedNames.map(name => (
                          <ResourceCard
                            key={`unlinked-${name}`}
                            type="character"
                            name={name}
                            isActive
                            onClick={() => onCharacterClick({ id: 0, name } as Character)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 分割线 */}
                  {totalInUse > 0 && <div style={{ borderTop: '1px solid var(--border-color)' }} />}

                  {/* 全部可用角色 */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>全部可用角色 ({filteredChars.length})</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div 
                        className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                      >
                        <Plus className="w-6 h-6" />
                        <span className="text-[10px]">创建</span>
                      </div>
                      {(inUse.length > 0 ? notInUse : filteredChars).map(c => (
                        <ResourceCard
                          key={c.id}
                          type="character"
                          name={c.name}
                          imageUrl={c.imageUrl || c.frontViewUrl}
                          onClick={() => onCharacterClick(c)}
                          onDoubleClick={() => onCharacterDoubleClick?.(c)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ========== 场景 Tab ========== */}
        {activeTab === 'scene' && (
          <div className="space-y-4">
            {(() => {
              const inUse = filteredScenes.filter(s => usedSceneNames.includes(s.name));
              const notInUse = filteredScenes.filter(s => !usedSceneNames.includes(s.name));
              return (
                <>
                  {inUse.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold" style={{ color: '#10b981' }}>作品中场景 ({inUse.length})</div>
                      <div className="grid grid-cols-2 gap-2">
                        {inUse.map(s => (
                          <ResourceCard key={s.id} type="scene" name={s.name} imageUrl={s.image_url} isActive onClick={() => onSceneClick(s)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {inUse.length > 0 && <div style={{ borderTop: '1px solid var(--border-color)' }} />}
                  <div className="space-y-2">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>全部场景 ({filteredScenes.length})</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div 
                        className="aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                      >
                        <Plus className="w-6 h-6" />
                        <span className="text-[10px]">创建</span>
                      </div>
                      {(inUse.length > 0 ? notInUse : filteredScenes).map(s => (
                        <ResourceCard key={s.id} type="scene" name={s.name} imageUrl={s.image_url} onClick={() => onSceneClick(s)} />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ========== 道具 Tab ========== */}
        {activeTab === 'prop' && (
          <div className="space-y-3">
            <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>全部道具 ({filteredProps.length})</div>
            <div className="grid grid-cols-3 gap-2">
              <div 
                className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
              >
                <Plus className="w-6 h-6" />
                <span className="text-[10px]">创建</span>
              </div>
              {filteredProps.map((p) => (
                <ResourceCard key={p.id || p.name} type="prop" name={p.name} imageUrl={p.image_url} onClick={() => onPropClick(p)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceListView;
