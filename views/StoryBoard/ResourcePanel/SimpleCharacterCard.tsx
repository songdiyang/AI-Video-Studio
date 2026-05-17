import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';
import { Layers, Eye, Loader2 } from 'lucide-react';
import { ResourceItem } from './types';

interface SimpleCharacterCardProps {
  name: string;
  scenes?: any[];
  isGenerating?: boolean;
  onGenerateViews: (charName: string) => void;
  onPreview: (resource: ResourceItem) => void;
}

const SimpleCharacterCard: React.FC<SimpleCharacterCardProps> = ({
  name,
  scenes,
  isGenerating = false,
  onGenerateViews,
  onPreview
}) => {
  return (
    <Card className="w-full bg-slate-800/60 shadow-sm hover:shadow-md hover:shadow-blue-500/5 transition-shadow border border-slate-700/50">
      <CardBody className="p-3">
        <div className="flex items-center justify-between mb-2 h-[56px]">
          <h4 className="font-bold text-slate-100">{name}</h4>
          <span className="text-xs text-slate-500">
            出现 {scenes?.filter(s => s.characters?.includes(name)).length || 0} 次
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-purple-500/10 text-purple-400 text-xs font-medium"
            startContent={isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
            onPress={() => onGenerateViews(name)}
            isDisabled={isGenerating}
          >
            {isGenerating ? '生成中...' : '三视图'}
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="flex-1 bg-blue-500/10 text-blue-400 text-xs font-medium"
            startContent={<Eye className="w-3 h-3" />}
            onPress={() => onPreview({ name })}
          >
            预览
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default SimpleCharacterCard;
