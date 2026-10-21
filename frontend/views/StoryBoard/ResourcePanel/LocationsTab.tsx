import React, { useState, useRef, useEffect } from 'react';
import { Card, CardBody, Chip, Image } from '@heroui/react';
import { LayoutGrid, Cloud, Building2, Trash2, ExternalLink, Settings } from 'lucide-react';
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
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部影棚 ({scenes.length})
        </span>
      </div>

      {scenes.length === 0 && (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <p className="text-sm">暂无影棚</p>
          <p className="text-xs mt-1">请先在资源管理中创建影棚</p>
        </div>
      )}

      {scenes.map((scene) => {
        const isSelected = selectedId != null && scene.id === selectedId;
        const env = scene._environment || null;
        const linkedBuildings = scene._buildings || [];
        const hasNineGrid = !!scene.nine_grid_image_url;

        return (
          <Card
            key={scene.id}
            isPressable
            onPress={() => onSelect?.(scene)}
            onDoubleClick={() => openAssetEditTab(scene)}
            onContextMenu={(e) => handleContextMenu(e, scene)}
            className={`border transition-all cursor-pointer ${
              isSelected
                ? 'ring-2 ring-(--accent) border-(--accent)'
                : 'hover:border-(--accent)/40'
            }`}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: isSelected ? undefined : 'var(--border)',
            }}
          >
            <CardBody className="p-3">
              <div className="flex items-start gap-3">
                {/* 九宫图缩略图作为封面 */}
                <div className="shrink-0 relative">
                  {hasNineGrid ? (
                    <Image
                      src={scene.nine_grid_image_url!}
                      alt={scene.name}
                      removeWrapper
                      className="w-14 h-14 object-cover rounded-lg border border-slate-700/50"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg border border-dashed border-slate-600 flex items-center justify-center bg-slate-800/40">
                      <LayoutGrid className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 self-stretch flex flex-col">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {scene.name}
                  </p>
                  {scene.description && (
                    <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                      {scene.description}
                    </p>
                  )}

                  {/* 环境 / 建筑标签 */}
                  <div className="flex flex-wrap gap-1 mt-auto pt-1.5">
                    {env && (
                      <Chip size="sm" variant="flat" className="bg-sky-500/10 text-sky-300 h-5 text-[10px]">
                        <Cloud className="w-2.5 h-2.5 mr-0.5 inline" />
                        {env.name}
                      </Chip>
                    )}
                    {linkedBuildings.map((b) => (
                      <Chip key={b.id} size="sm" variant="flat" className="bg-amber-500/10 text-amber-300 h-5 text-[10px]">
                        <Building2 className="w-2.5 h-2.5 mr-0.5 inline" />
                        {b.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-(--bg-card) border border-(--border-color) rounded-lg shadow-xl py-1.5 min-w-[180px] select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 打开 */}
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-(--text-primary) hover:bg-(--accent)/10 flex items-center gap-2.5 transition-colors"
            onClick={() => {
              openAssetEditTab(contextMenu.scene);
              setContextMenu(null);
            }}
          >
            <ExternalLink className="w-4 h-4 text-(--accent)" />
            打开详情
          </button>

          {/* 分割线 */}
          {onDelete && <div className="my-1 border-t border-(--border-color)" />}

          {/* 删除 */}
          {onDelete && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
              onClick={() => {
                onDelete(contextMenu.scene);
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-4 h-4" />
              删除影棚
            </button>
          )}

          {/* 底部快捷栏 */}
          <div className="mt-1.5 pt-1.5 border-t border-(--border-color) px-2 pb-1">
            <div className="flex items-center justify-around">
              <button
                className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-(--accent)/10 transition-colors"
                onClick={() => { openAssetEditTab(contextMenu.scene); setContextMenu(null); }}
                title="打开"
              >
                <ExternalLink className="w-4 h-4 text-(--accent)" />
                <span className="text-[10px] text-(--text-muted)">打开</span>
              </button>
              {onDelete && (
                <button
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-red-500/10 transition-colors"
                  onClick={() => { onDelete(contextMenu.scene); setContextMenu(null); }}
                  title="删除"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] text-red-400">删除</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationsTab;
