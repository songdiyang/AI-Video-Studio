import React, { useState } from 'react';
import { Chip, Button } from '@heroui/react';
import { Video, MapPin, Edit3, Camera } from 'lucide-react';
import { StoryboardScene, SpatialDescription } from '../useSceneManager';
import SpatialDescriptionEditor from './SpatialDescriptionEditor';
import { updateSpatialDescription } from '../../../services/storyboards';
import { useToast } from '../../../contexts/ToastContext';
import ShotLanguageBadge from '../components/ShotLanguageBadge';
import { ShotSizeBadge, ShotSizeSelector } from '../components/ShotSizeSelector';

interface SceneCardMetadataProps {
  scene: StoryboardScene;
  onUpdateSpatialDescription?: (spatialDescription: SpatialDescription | undefined) => void;
  onOpenShotLanguageEditor?: () => void;
  onUpdateScene?: (id: number, updates: Partial<StoryboardScene>) => void;
}

const SceneCardMetadata: React.FC<SceneCardMetadataProps> = ({ scene, onUpdateSpatialDescription, onOpenShotLanguageEditor, onUpdateScene }) => {
  const [showSpatialEditor, setShowSpatialEditor] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const handleSaveSpatialDescription = async (spatialDesc: SpatialDescription | null) => {
    setIsSaving(true);
    try {
      await updateSpatialDescription(scene.id, spatialDesc);
      if (onUpdateSpatialDescription) {
        onUpdateSpatialDescription(spatialDesc || undefined);
      }
    } catch (error: any) {
      console.error('保存空间描述失败:', error);
      showToast('保存空间描述失败，请稍后重试', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 格式化空间描述显示
  const formatSpatialSummary = (spatial: SpatialDescription): string => {
    const parts: string[] = [];
    if (spatial.characterPositions && spatial.characterPositions.length > 0) {
      parts.push(`${spatial.characterPositions.length}个角色位置`);
    }
    if (spatial.cameraAngle) parts.push(spatial.cameraAngle);
    if (spatial.spatialRelationship) parts.push('有空间关系');
    return parts.join(' · ') || '已设置';
  };

  return (
    <div className="space-y-3 mt-3">
      {/* 镜头类型和场景位置 */}
      <div className="flex items-center gap-2 flex-wrap">
        {onUpdateScene ? (
          <ShotSizeSelector
            value={scene.shotType}
            onChange={(newValue) => {
              onUpdateScene(scene.id, { shotType: newValue });
            }}
            compact={true}
          />
        ) : (
          <ShotSizeBadge value={scene.shotType} />
        )}
        {scene.location && (
          <Chip size="sm" variant="flat" className="bg-purple-500/10 text-purple-400 text-xs font-medium">
            {scene.location}
          </Chip>
        )}
        {scene.emotion && (
          <Chip size="sm" variant="flat" className="bg-pink-500/10 text-pink-400 text-xs font-medium">
            {scene.emotion}
          </Chip>
        )}
        {scene.hasAction && (
          <Chip size="sm" variant="flat" className="bg-orange-500/10 text-orange-400 text-xs font-bold">
            有动作
          </Chip>
        )}
      </div>

      {/* 空间描述区域 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="flat"
          className={`text-xs ${scene.spatialDescription ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/30 text-slate-400'}`}
          onPress={() => setShowSpatialEditor(true)}
          isLoading={isSaving}
          startContent={<MapPin className="w-3 h-3" />}
          endContent={<Edit3 className="w-3 h-3 opacity-60" />}
        >
          {scene.spatialDescription ? formatSpatialSummary(scene.spatialDescription) : '添加空间描述'}
        </Button>
      </div>

      {/* 镜头语言参数 */}
      {scene.shotLanguage && Object.keys(scene.shotLanguage).length > 0 ? (
        <div className="flex items-center gap-2">
          <ShotLanguageBadge shotLanguage={scene.shotLanguage} compact />
          {onOpenShotLanguageEditor && (
            <Button
              size="sm"
              isIconOnly
              variant="flat"
              className="bg-slate-700/30 text-slate-400 w-6 h-6 min-w-6"
              onPress={onOpenShotLanguageEditor}
            >
              <Edit3 className="w-3 h-3" />
            </Button>
          )}
        </div>
      ) : onOpenShotLanguageEditor && (
        <Button
          size="sm"
          variant="flat"
          className="text-xs bg-slate-700/30 text-slate-400"
          onPress={onOpenShotLanguageEditor}
          startContent={<Camera className="w-3 h-3" />}
        >
          添加镜头参数
        </Button>
      )}

      {/* 首尾帧 */}
      {scene.hasAction && (scene.startFrame || scene.endFrame) && (
        <div className="bg-linear-to-r from-orange-500/10 to-amber-500/10 rounded-lg p-3 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Video className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-orange-300">动作帧（用于生成视频）</span>
          </div>
          <div className="flex gap-3">
            {scene.startFrame && (
              <div className="bg-slate-800/60 rounded-md p-1.5 border border-orange-500/20">
                <span className="text-[10px] font-semibold text-emerald-400 block mb-1 text-center">首帧</span>
                <img src={scene.startFrame} alt="首帧" className="w-20 h-14 object-cover rounded" />
              </div>
            )}
            {scene.endFrame && (
              <div className="bg-slate-800/60 rounded-md p-1.5 border border-orange-500/20">
                <span className="text-[10px] font-semibold text-red-400 block mb-1 text-center">尾帧</span>
                <img src={scene.endFrame} alt="尾帧" className="w-20 h-14 object-cover rounded" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 角色列表 */}
      {scene.characters && scene.characters.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-slate-500 mb-2 block">角色</span>
          <div className="flex flex-wrap gap-2">
            {scene.characters.map((char, idx) => {
              const linked = scene.linkedCharacters?.find(lc => lc.name === char);
              return (
                <div key={idx} className="flex items-center gap-2 bg-blue-500/10 rounded-lg px-2 py-1 border border-blue-500/20">
                  {linked?.image_url ? (
                    <img src={linked.image_url} alt={char} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400">
                      {char.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-blue-400">{char}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 空间描述编辑器 */}
      <SpatialDescriptionEditor
        isOpen={showSpatialEditor}
        onClose={() => setShowSpatialEditor(false)}
        spatialDescription={scene.spatialDescription}
        characters={scene.characters || []}
        onSave={handleSaveSpatialDescription}
      />
    </div>
  );
};

export default SceneCardMetadata;
