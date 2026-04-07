import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { Layers, Eye, Loader2, User, RefreshCw } from 'lucide-react';
import { Character } from './types';

interface CharacterCardProps {
  character: Character;
  scenes?: any[];
  isGenerating?: boolean;
  onGenerateViews: (charName: string, characterId: number) => void;
  onShowDetail: (character: Character) => void;
  onOpenLifecycle?: (character: Character) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  scenes,
  isGenerating = false,
  onGenerateViews,
  onShowDetail,
  onOpenLifecycle
}) => {
  // 双击打开生命周期管理界面
  const handleDoubleClick = () => {
    onOpenLifecycle?.(character);
  };

  return (
    <Card 
      className="bg-slate-800/60 shadow-sm hover:shadow-md hover:shadow-blue-500/5 transition-shadow border border-slate-700/50 cursor-pointer"
      isPressable
      onPress={handleDoubleClick}
    >
      <CardBody className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
            {character.imageUrl ? (
              <img src={character.imageUrl} alt={character.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-blue-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-bold text-slate-100 truncate">{character.name}</h4>
              <span className="text-xs text-slate-500 ml-2">
                {scenes?.filter(s => s.characters?.includes(character.name)).length || 0} 次
              </span>
            </div>
            {character.appearance && (
              <p className="text-xs text-slate-400 line-clamp-2 mb-1">
                <span className="font-semibold">外貌：</span>{character.appearance}
              </p>
            )}
            {character.personality && (
              <p className="text-xs text-slate-400 line-clamp-1">
                <span className="font-semibold">性格：</span>{character.personality}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-purple-500/10 text-purple-400 text-xs font-medium"
            startContent={isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
            onPress={() => onGenerateViews(character.name, character.id)}
            isDisabled={isGenerating}
          >
            {isGenerating ? '生成中...' : '三视图'}
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-blue-500/10 text-blue-400 text-xs font-medium"
            startContent={<Eye className="w-3 h-3" />}
            onPress={() => onShowDetail(character)}
          >
            详情
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default CharacterCard;
