import React from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import { Scene } from './useSceneData';

interface LocationsTabProps {
  scenes: Scene[];
  /** 当前选中的影棚 id（高亮） */
  selectedId?: number | null;
  /** 点击卡片回调 */
  onSelect?: (scene: Scene) => void;
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
}) => {

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
        const envName = scene._environment?.name;
        const buildings = scene._buildings || [];

        return (
          <Card
            key={scene.id}
            isPressable
            onPress={() => onSelect?.(scene)}
            onDoubleClick={() => openAssetEditTab(scene)}
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
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {scene.name}
                </p>
                {scene.description && (
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                    {scene.description}
                  </p>
                )}

                {/* 环境 / 建筑标签 */}
                {(envName || buildings.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {envName && (
                      <Chip
                        size="sm"
                        variant="flat"
                        className="bg-sky-500/10 text-sky-300 h-5 text-[10px]"
                      >
                        {envName}
                      </Chip>
                    )}
                    {buildings.map((b) => (
                      <Chip
                        key={b.id}
                        size="sm"
                        variant="flat"
                        className="bg-amber-500/10 text-amber-300 h-5 text-[10px]"
                      >
                        {b.name}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
};

export default LocationsTab;
