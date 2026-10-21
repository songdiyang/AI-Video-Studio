import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface SceneCardHeaderProps {
  index: number;
  sceneId: number;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
}

const SceneCardHeader: React.FC<SceneCardHeaderProps> = ({
  index,
  sceneId,
  isFirst,
  isLast,
  onSelect,
  onMoveUp,
  onMoveDown
}) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => onSelect(sceneId)}
        className="w-8 h-8 rounded-full bg-slate-800/80 flex items-center justify-center hover:bg-blue-500/20 transition-colors border border-slate-700/50"
      >
        <span className="text-sm font-bold text-slate-300">{index + 1}</span>
      </button>
      <div className="flex flex-col gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp(sceneId);
          }}
          disabled={isFirst}
          className="p-1 hover:bg-slate-700/50 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown(sceneId);
          }}
          disabled={isLast}
          className="p-1 hover:bg-slate-700/50 rounded text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default SceneCardHeader;
