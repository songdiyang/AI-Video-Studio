import React, { useState } from 'react';
import { Character, PropItem } from '../../StoryBoard/ResourcePanel/types';
import { Scene } from '../../StoryBoard/ResourcePanel/useSceneData';
import ResourceListView from './ResourceListView';
import CharacterDetailView from './CharacterDetailView';
import SceneDetailView from './SceneDetailView';

type SidebarView =
  | { mode: 'list' }
  | { mode: 'character-detail'; character: Character }
  | { mode: 'scene-detail'; scene: Scene }
  | { mode: 'prop-detail'; prop: PropItem };

type TabType = 'character' | 'scene' | 'prop';

interface ResourceSidebarProps {
  dbCharacters: Character[];
  dbScenes: Scene[];
  props: PropItem[];
  /** 分镜中实际使用的角色名 */
  usedCharacterNames: string[];
  /** 分镜中实际使用的场景名 */
  usedSceneNames: string[];
  imageModel?: string;
  textModel?: string;
  onGenerateCharacterImage?: (characterId: number, imageModel: string) => void;
  onGenerateSceneImage?: (sceneId: number, imageModel: string) => void;
  onBatchGenerate?: () => void;
  /** 外部可以通过此回调打开指定角色详情 */
  selectedCharacterName?: string | null;
  selectedSceneName?: string | null;
  onClearSelection?: () => void;
}

const ResourceSidebar: React.FC<ResourceSidebarProps> = ({
  dbCharacters,
  dbScenes,
  props,
  usedCharacterNames,
  usedSceneNames,
  imageModel,
  textModel,
  onGenerateCharacterImage,
  onGenerateSceneImage,
  onBatchGenerate,
  selectedCharacterName,
  selectedSceneName,
  onClearSelection,
}) => {
  const [view, setView] = useState<SidebarView>({ mode: 'list' });
  const [activeTab, setActiveTab] = useState<TabType>('character');

  // 外部点击角色头像时自动切换到详情
  React.useEffect(() => {
    if (selectedCharacterName) {
      const char = dbCharacters.find(c => c.name === selectedCharacterName);
      if (char) {
        setView({ mode: 'character-detail', character: char });
      } else {
        // 角色未入库时，用名字构造一个最小化角色对象
        setView({ mode: 'character-detail', character: { id: 0, name: selectedCharacterName } as Character });
      }
      setActiveTab('character');
      onClearSelection?.();
    }
  }, [selectedCharacterName, dbCharacters]);

  React.useEffect(() => {
    if (selectedSceneName) {
      const scene = dbScenes.find(s => s.name === selectedSceneName);
      if (scene) {
        setView({ mode: 'scene-detail', scene });
        setActiveTab('scene');
      }
      onClearSelection?.();
    }
  }, [selectedSceneName, dbScenes]);

  React.useEffect(() => {
    setView((prev) => {
      if (prev.mode !== 'character-detail' || !prev.character.id) {
        return prev;
      }

      const nextCharacter = dbCharacters.find((character) => character.id === prev.character.id);
      if (!nextCharacter) {
        return prev;
      }

      return { mode: 'character-detail', character: nextCharacter };
    });
  }, [dbCharacters]);

  React.useEffect(() => {
    setView((prev) => {
      if (prev.mode !== 'scene-detail' || !prev.scene.id) {
        return prev;
      }

      const nextScene = dbScenes.find((scene) => scene.id === prev.scene.id);
      if (!nextScene) {
        return prev;
      }

      return { mode: 'scene-detail', scene: nextScene };
    });
  }, [dbScenes]);

  const goBack = () => setView({ mode: 'list' });

  return (
    <div 
      className="w-72 flex flex-col"
      style={{ 
        backgroundColor: 'var(--bg-body)', 
        borderLeft: '1px solid var(--border-color)' 
      }}
    >
      {view.mode === 'list' && (
        <ResourceListView
          dbCharacters={dbCharacters}
          dbScenes={dbScenes}
          props={props}
          usedCharacterNames={usedCharacterNames}
          usedSceneNames={usedSceneNames}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onCharacterClick={(c) => setView({ mode: 'character-detail', character: c })}
          onCharacterDoubleClick={(c) => {
            if (c.id) {
              window.dispatchEvent(new CustomEvent('openAssetEditTab', {
                detail: {
                  assetType: 'character',
                  assetId: c.id,
                  assetName: c.name,
                  initialData: c,
                }
              }));
            }
          }}
          onSceneClick={(s) => setView({ mode: 'scene-detail', scene: s })}
          onSceneDoubleClick={(s) => {
            if (s.id) {
              window.dispatchEvent(new CustomEvent('openAssetEditTab', {
                detail: {
                  assetType: 'scene',
                  assetId: s.id,
                  assetName: s.name,
                  initialData: s,
                }
              }));
            }
          }}
          onPropClick={(p) => {
            // 单击选中道具（暂无道具详情页，预留接口）
          }}
          onPropDoubleClick={(p) => {
            if (p.id) {
              window.dispatchEvent(new CustomEvent('openAssetEditTab', {
                detail: {
                  assetType: 'prop',
                  assetId: p.id,
                  assetName: p.name,
                  initialData: p,
                }
              }));
            }
          }}
          onBatchGenerate={onBatchGenerate}
        />
      )}

      {view.mode === 'character-detail' && (
        <CharacterDetailView
          character={view.character}
          onBack={goBack}
          onGenerateImage={onGenerateCharacterImage}
          imageModel={imageModel}
        />
      )}

      {view.mode === 'scene-detail' && (
        <SceneDetailView
          scene={view.scene}
          onBack={goBack}
          onGenerateImage={onGenerateSceneImage}
          imageModel={imageModel}
        />
      )}
    </div>
  );
};

export default ResourceSidebar;
