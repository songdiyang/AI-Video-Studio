import React from 'react';
import { Card, CardBody, Button, Tooltip } from '@heroui/react';
import { Layers, Eye, Loader2, User, RefreshCw, Star, Shirt } from 'lucide-react';
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

  const hasBaseModelViews = character.has_base_model_views === true || character.has_base_model_views === 1;
  const statesCount = character.statesCount ?? 0;
  const activeStateName = character.active_state_name;
  const activeOutfit = character.active_state_outfit;
  const activeStateImage = character.active_state_image_url;

  return (
    <Card
      className="bg-slate-800/60 shadow-sm hover:shadow-md hover:shadow-blue-500/5 transition-shadow border border-slate-700/50 cursor-pointer"
      isPressable
      onPress={handleDoubleClick}
    >
      <CardBody className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              {activeStateImage || character.imageUrl ? (
                <img src={activeStateImage || character.imageUrl} alt={character.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-blue-400" />
              )}
            </div>
            {/* 白膜状态指示器 */}
            {hasBaseModelViews && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-slate-800">
                <Star className="w-2.5 h-2.5 text-white fill-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-slate-100 truncate">{character.name}</h4>
              </div>
              <span className="text-xs text-slate-500 ml-2">
                {scenes?.filter(s => s.characters?.includes(character.name)).length || 0} 次
              </span>
            </div>
            {/* 白膜/服装分层标识行 */}
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
              {activeStateName && (
                <Tooltip content={`当前激活状态: ${activeStateName}${activeOutfit ? '，服装: ' + activeOutfit : ''}`}>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-500/15 text-pink-400 border border-pink-500/30">
                    <Shirt className="w-2.5 h-2.5" />
                    {activeStateName}
                  </span>
                </Tooltip>
              )}
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
                {character.outfit_appearance && (
                  <p className="text-xs text-pink-400/80 line-clamp-1">
                    <span className="font-semibold text-pink-400/60">服装：</span>{character.outfit_appearance}
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
