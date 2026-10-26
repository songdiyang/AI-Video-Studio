import React, { useState, useRef, useEffect } from 'react';
import { Card, CardBody, Tooltip } from '@heroui/react';
import { Trash2, ExternalLink, Edit2, Cloud, Building2, MapPin } from 'lucide-react';
import { Scene } from './useSceneData';

interface LocationsTabProps {
  scenes: Scene[];
  /** 当前选中的影棚 id（高亮） */
  selectedId?: number | null;
  /** 点击卡片回调 */
  onSelect?: (scene: Scene) => void;
  /** 右键删除回调 */
  onDelete?: (scene: Scene) => void;
}

const openAssetEditTab = (scene: Scene) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'scene',
      assetId: scene.id,
      assetName: scene.name,
      initialData: scene,
    }
  }));
};

/** 影棚资源行（无封面紧凑双行）：与角色/道具行同一套密度与交互语言。
 *  关联摘要（环境/建筑）优先级高于描述——影棚多为按名空壳，关联信息区分度更高。 */
const LocationsTab: React.FC<LocationsTabProps> = ({
  scenes,
  selectedId,
  onSelect,
  onDelete,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; scene: Scene } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, scene: Scene) => {
    e.preventDefault();
    if (!onDelete) return;
    setContextMenu({ x: e.clientX, y: e.clientY, scene });
  };

  return (
    <div className="space-y-1">
      {scenes.length === 0 && (
        <div className="text-center py-6 text-(--text-muted)">
          <p className="text-xs">暂无影棚</p>
          <p className="text-[10px] mt-1 opacity-70">生成分镜后自动按地点补齐，或在资产库手动创建</p>
        </div>
      )}

      {scenes.map((scene) => {
        const isSelected = selectedId != null && scene.id === selectedId;
        const env = scene._environment || null;
        const linkedBuildings = scene._buildings || [];
        // 行 2 摘要：环境/建筑关联优先，无关联再展示描述
        const relationBits: string[] = [];
        if (env) relationBits.push(env.name);
        if (linkedBuildings.length) relationBits.push(`${linkedBuildings.map((b) => b.name).join('、')}`);
        const summary = relationBits.length ? relationBits.join(' · ') : scene.description;

        return (
          <Card
            key={scene.id}
            className={`group w-full rounded-lg border shadow-none transition-colors ${
              isSelected
                ? 'border-(--accent) bg-(--accent)/5'
                : 'border-(--border-color) bg-(--bg-card) hover:border-(--accent)/30 hover:bg-(--bg-card-hover)'
            }`}
            onClick={onSelect ? () => onSelect(scene) : undefined}
            onDoubleClick={() => openAssetEditTab(scene)}
            onContextMenu={(e) => handleContextMenu(e, scene)}
          >
            <CardBody className="px-2.5 py-1.5">
              {/* 行 1：名称 + 关联指示点 + 悬停编辑 */}
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3 shrink-0 text-(--text-muted) opacity-70" />
                <h4 className="min-w-0 truncate text-[13px] font-semibold text-(--text-primary)">{scene.name}</h4>
                {env && (
                  <Tooltip content={`环境：${env.name}`}>
                    <span className="shrink-0 inline-flex text-sky-400/90">
                      <Cloud className="h-3 w-3" />
                    </span>
                  </Tooltip>
                )}
                {linkedBuildings.length > 0 && (
                  <Tooltip content={`建筑：${linkedBuildings.map((b) => b.name).join('、')}`}>
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-amber-400/90">
                      <Building2 className="h-3 w-3" />
                      {linkedBuildings.length > 1 && <span className="text-[9px] leading-3">{linkedBuildings.length}</span>}
                    </span>
                  </Tooltip>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openAssetEditTab(scene); }}
                  className="ml-auto shrink-0 rounded p-0.5 text-(--text-muted) opacity-0 transition-opacity duration-150 hover:bg-white/5 hover:text-(--text-primary) active:bg-white/10 group-hover:opacity-100 focus-visible:opacity-100"
                  title="编辑影棚"
                  aria-label="编辑影棚"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* 行 2：关联摘要或描述 */}
              {summary && (
                <p className="mt-0.5 truncate pl-[18px] text-[11px] leading-4 text-(--text-secondary)">{summary}</p>
              )}
            </CardBody>
          </Card>
        );
      })}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-lg py-1 min-w-[140px] select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-(--text-primary) hover:bg-white/5 transition-colors"
            onClick={() => {
              openAssetEditTab(contextMenu.scene);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-3.5 h-3.5 text-(--text-muted)" />
            打开详情
          </button>

          {onDelete && (
            <>
              <div className="my-1 border-t border-[var(--border-color)]" />
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  onDelete(contextMenu.scene);
                  setContextMenu(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除影棚
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationsTab;
