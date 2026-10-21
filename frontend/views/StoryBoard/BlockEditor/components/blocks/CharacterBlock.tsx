/**
 * 角色选择积木块
 */

import React from 'react';
import { BlockBase, CharacterBlockData } from '../../types/blockTypes';
import { getBlockDefinition } from '../../utils/blockRegistry';
import { ProjectCharacter } from '../../types/blockTypes';

interface CharacterBlockProps {
  block: BlockBase & { data: CharacterBlockData };
  isSelected?: boolean;
  onChange?: (data: CharacterBlockData) => void;
  characters?: ProjectCharacter[];
}

const CharacterBlock: React.FC<CharacterBlockProps> = ({
  block,
  isSelected,
  onChange,
  characters = [],
}) => {
  const definition = getBlockDefinition('character');
  const { characterId, characterName } = block.data;

  return (
    <div
      className={`
        relative rounded-lg border-2 p-3 min-w-[220px]
        ${isSelected ? 'border-rose-500 ring-2 ring-rose-200' : 'border-rose-300'}
        bg-rose-50 hover:bg-rose-100 transition-colors
      `}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{definition.icon}</span>
        <span className="text-sm font-medium text-rose-700">{definition.label}</span>
      </div>

      {/* 角色选择 */}
      <select
        value={characterId || ''}
        onChange={(e) => {
          const id = parseInt(e.target.value);
          const char = characters.find(c => c.id === id);
          onChange?.({
            characterId: id,
            characterName: char?.name || '',
          });
        }}
        className="
          w-full p-2 text-sm
          bg-white border border-rose-200 rounded
          focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400
        "
      >
        <option value="">选择角色...</option>
        {characters.map((char) => (
          <option key={char.id} value={char.id}>
            {char.name}
          </option>
        ))}
      </select>

      {/* 已选角色显示 */}
      {characterName && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-white rounded border border-rose-200">
          {characters.find(c => c.id === characterId)?.avatar ? (
            <img
              src={characters.find(c => c.id === characterId)?.avatar}
              alt={characterName}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-rose-200 flex items-center justify-center text-xs">
              {characterName.charAt(0)}
            </div>
          )}
          <span className="text-sm text-slate-700">{characterName}</span>
        </div>
      )}
    </div>
  );
};

export default CharacterBlock;
