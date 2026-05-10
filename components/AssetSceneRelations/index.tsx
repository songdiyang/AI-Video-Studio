import React, { useMemo } from 'react';
import { Camera, MapPin, Users, FileText, Shirt, Cloud, Building2, BookOpen, Layers, ExternalLink } from 'lucide-react';
import { StoryboardScene } from '../../views/StoryBoard/useSceneManager';

export interface AssetSceneRelationsProps {
  /** 当前所有分镜数据 */
  scenes: StoryboardScene[];
  /** 资产类型 */
  assetType: string;
  /** 资产名称（用于匹配分镜中的角色/场景/道具等） */
  assetName: string;
  /** 资产ID */
  assetId?: number;
  /** 点击关联分镜时的回调 */
  onSelectScene?: (sceneId: number) => void;
}

/**
 * 资产关联分镜面板
 * 显示当前资产在哪些分镜中被使用，支持点击跳转
 */
const AssetSceneRelations: React.FC<AssetSceneRelationsProps> = ({
  scenes,
  assetType,
  assetName,
  assetId,
  onSelectScene,
}) => {
  // 根据资产类型和名称，筛选出关联的分镜
  const relatedScenes = useMemo(() => {
    if (!assetName || scenes.length === 0) return [];

    return scenes.filter((scene) => {
      switch (assetType) {
        case 'character':
          return scene.characters?.some(
            (char) => char.trim() === assetName.trim()
          );
        case 'scene':
        case 'studio':
          return (
            scene.location?.trim() === assetName.trim() ||
            scene.linkedScenes?.some(
              (ls) => ls.name?.trim() === assetName.trim()
            )
          );
        case 'prop':
          return scene.props?.some(
            (prop) => prop.trim() === assetName.trim()
          );
        case 'costume':
          // 服装通过角色状态关联，这里简化处理：检查角色名称或描述中是否提及
          return scene.characters?.some((char) => {
            const charData = scene.linkedCharacters?.find(
              (lc) => lc.name === char
            );
            return (
              charData?.outfit_appearance?.includes(assetName) ||
              charData?.active_state_outfit?.includes(assetName) ||
              scene.description?.includes(assetName)
            );
          });
        case 'environment':
        case 'building':
          // 环境/建筑通过场景关联
          return (
            scene.location?.includes(assetName) ||
            scene.description?.includes(assetName)
          );
        case 'script':
          // 剧本关联所有分镜
          return true;
        default:
          return (
            scene.characters?.includes(assetName) ||
            scene.props?.includes(assetName) ||
            scene.location === assetName
          );
      }
    });
  }, [scenes, assetType, assetName]);

  // 资产类型配置
  const typeConfig = useMemo(() => {
    const configs: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string; borderColor: string }> = {
      character: {
        label: '角色',
        icon: <Users size={12} />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
      },
      scene: {
        label: '场景',
        icon: <MapPin size={12} />,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
      },
      studio: {
        label: '影棚',
        icon: <Layers size={12} />,
        color: 'text-violet-400',
        bgColor: 'bg-violet-500/10',
        borderColor: 'border-violet-500/20',
      },
      prop: {
        label: '道具',
        icon: <FileText size={12} />,
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
      },
      costume: {
        label: '服装',
        icon: <Shirt size={12} />,
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
      },
      environment: {
        label: '环境',
        icon: <Cloud size={12} />,
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/20',
      },
      building: {
        label: '建筑',
        icon: <Building2 size={12} />,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/20',
      },
      script: {
        label: '剧本',
        icon: <BookOpen size={12} />,
        color: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        borderColor: 'border-rose-500/20',
      },
    };
    return configs[assetType] || configs.character;
  }, [assetType]);

  if (relatedScenes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)]">
        <Camera size={24} className="opacity-30 mb-2" />
        <span className="text-xs">暂无关联分镜</span>
        <span className="text-[10px] opacity-60 mt-1">
          该{typeConfig.label}尚未在任何分镜中使用
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-5 h-5 rounded ${typeConfig.bgColor} ${typeConfig.color}`}>
            {typeConfig.icon}
          </div>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            关联分镜
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            {relatedScenes.length}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[120px]">
          {assetName}
        </span>
      </div>

      {/* 分镜列表 */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--border-color)]/50">
          {relatedScenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSelectScene?.(scene.id)}
              className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <div className="flex items-start gap-2">
                {/* 分镜序号 */}
                <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--bg-elevated)] text-[10px] font-medium text-[var(--text-muted)] shrink-0 mt-0.5">
                  {scene.order}
                </div>

                {/* 分镜内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {scene.baseDescription || scene.description || `分镜 #${scene.order}`}
                    </span>
                    <ExternalLink
                      size={10}
                      className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </div>

                  {/* 分镜元信息 */}
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                    {scene.characters && scene.characters.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users size={9} />
                        <span className="truncate max-w-[80px]">
                          {scene.characters.join('、')}
                        </span>
                      </div>
                    )}
                    {scene.location && (
                      <div className="flex items-center gap-1">
                        <MapPin size={9} />
                        <span className="truncate max-w-[60px]">{scene.location}</span>
                      </div>
                    )}
                    {scene.duration && (
                      <span>{scene.duration}s</span>
                    )}
                  </div>
                </div>

                {/* 预览图 */}
                {scene.imageUrl && (
                  <img
                    src={scene.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover shrink-0 border border-[var(--border-color)]"
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AssetSceneRelations;
