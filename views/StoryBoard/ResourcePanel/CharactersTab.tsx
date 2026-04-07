import React from 'react';
import { Character } from './types';
import CharacterCard from './CharacterCard';
import SimpleCharacterCard from './SimpleCharacterCard';

interface CharactersTabProps {
  characters: string[];
  dbCharacters: Character[];
  isLoadingCharacters: boolean;
  scenes?: any[];
  activeCharacterIds?: string[];
  onGenerateViews: (charName: string, characterId: number) => void;
  onShowDetail: (character: Character) => void;
  onPreview?: (character: Character) => void;
  onOpenLifecycle?: (character: Character) => void;
}

const CharactersTab: React.FC<CharactersTabProps> = ({
  characters,
  dbCharacters,
  isLoadingCharacters,
  scenes,
  activeCharacterIds = [],
  onGenerateViews,
  onShowDetail,
  onPreview,
  onOpenLifecycle
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-slate-300">
          全部角色 ({dbCharacters.length > 0 ? dbCharacters.length : characters.length})
        </span>
      </div>
      
      {isLoadingCharacters ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      ) : dbCharacters.length > 0 ? (
        dbCharacters.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            scenes={scenes}
            isGenerating={activeCharacterIds.includes(String(char.id))}
            onGenerateViews={onGenerateViews}
            onShowDetail={onShowDetail}
            onOpenLifecycle={onOpenLifecycle}
          />
        ))
      ) : characters.length > 0 ? (
        <>
          {characters.map((char, idx) => (
            <SimpleCharacterCard
              key={idx}
              name={char}
              scenes={scenes}
              isGenerating={false}
              onGenerateViews={(charName) => onGenerateViews(charName, 0)}
              onPreview={(resource) => onPreview?.({ id: 0, name: resource.name } as Character)}
            />
          ))}
        </>
      ) : (
        <div className="text-center py-12 text-slate-400">
          <span className="text-4xl block mb-2">👤</span>
          <p className="text-sm">暂无角色</p>
          <p className="text-xs mt-1">生成分镜后自动识别</p>
        </div>
      )}
    </div>
  );
};

export default CharactersTab;
