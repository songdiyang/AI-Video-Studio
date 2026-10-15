import React from 'react';
import { Spinner } from '@heroui/react';
import { Wand2, Film } from 'lucide-react';
import { StoryboardScene } from '../useSceneManager';

interface SceneCardActionsProps {
  scene: StoryboardScene;
  isGeneratingVideo: boolean;
  onGenerateVideo: () => void;
}

const SceneCardActions: React.FC<SceneCardActionsProps> = ({
  scene,
  isGeneratingVideo,
  onGenerateVideo
}) => {
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/30">
      <button className="px-3 py-1.5 text-xs bg-gradient-to-r from-pink-500 to-pink-600 text-white hover:from-pink-600 hover:to-pink-700 rounded-lg flex items-center gap-1 transition-all shadow-sm hover:shadow">
        <Wand2 className="w-3 h-3" />
        特效
      </button>
      {!scene.videoUrl && (
        <button 
          onClick={onGenerateVideo}
          disabled={isGeneratingVideo}
          className="px-3 py-1.5 text-xs bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 rounded-lg flex items-center gap-1 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGeneratingVideo ? (
            <>
              <Spinner size="sm" color="white" />
              生成中...
            </>
          ) : (
            <>
              <Film className="w-3 h-3" />
              生成视频
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default SceneCardActions;
