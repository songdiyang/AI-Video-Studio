import React, { useState } from 'react';
import { Card, CardBody, Chip, Modal, ModalContent, ModalHeader, ModalBody, Button } from '@heroui/react';
import { Cloud, Building2, LayoutGrid } from 'lucide-react';
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
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部影棚 ({scenes.length})
        </span>
      </div>

      {scenes.length === 0 && (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">📍</span>
          <p className="text-sm">暂无影棚</p>
          <p className="text-xs mt-1">请先在资源管理中创建影棚</p>
        </div>
      )}

      {scenes.map((scene) => {
        const isSelected = selectedId != null && scene.id === selectedId;
        const hasNineGrid = !!scene.nine_grid_image_url;
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
            <CardBody className="p-0">
              {/* 九宫图封面 */}
              <div
                className="relative w-full h-36 overflow-hidden group"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {hasNineGrid ? (
                  <>
                    <img
                      src={scene.nine_grid_image_url!}
                      alt={scene.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* hover 预览入口 */}
                    <div
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewScene(scene);
                      }}
                    >
                      <div className="bg-black/60 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                        <LayoutGrid className="w-3.5 h-3.5 text-white" />
                        <span className="text-white text-xs font-medium">预览九宫图</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <LayoutGrid className="w-6 h-6 opacity-30" />
                    <span className="text-[11px] opacity-50">九宫图未生成</span>
                  </div>
                )}

                {/* 选中标记 */}
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-(--accent) text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                    已选
                  </div>
                )}
              </div>

              {/* 信息 */}
              <div className="px-3 py-2.5">
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
                        startContent={<Cloud className="w-2.5 h-2.5" />}
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
                        startContent={<Building2 className="w-2.5 h-2.5" />}
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

      {/* 九宫图预览 Modal */}
      <Modal
        isOpen={!!previewScene}
        onClose={() => setPreviewScene(null)}
        size="4xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{previewScene?.name || ''} — 九宫组装图</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => setPreviewScene(null)}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-2 flex items-center justify-center bg-black">
                {previewScene?.nine_grid_image_url && (
                  <img
                    src={previewScene.nine_grid_image_url}
                    alt={`${previewScene.name} 九宫组装图`}
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default LocationsTab;
