import React, { useState } from 'react';
import { Card, CardBody, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { ZoomIn, Building2 } from 'lucide-react';
import type { Building } from '../../../services/buildings';

interface BuildingsTabProps {
  buildings: Building[];
  isLoading?: boolean;
}

const interiorExteriorLabel: Record<string, string> = {
  interior: '室内',
  exterior: '室外',
  both: '室内外',
};

const openAssetEditTab = (b: Building) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'building',
      assetId: b.id,
      assetName: b.name,
      initialData: {
        id: b.id,
        name: b.name,
        description: b.description || '',
        interiorExterior: b.interior_exterior || 'both',
        structureType: b.structure_type || '',
        project_id: b.project_id,
        exterior_image_url: b.exterior_image_url,
        interior_image_url: b.interior_image_url,
        generation_status: b.generation_status,
      },
    }
  }));
};

const STATUS_TEXT: Record<string, string> = {
  pending: '待生成',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-slate-600/30 text-slate-300',
  generating: 'bg-blue-500/10 text-blue-300',
  completed: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-red-500/10 text-red-300',
};

const BuildingsTab: React.FC<BuildingsTabProps> = ({
  buildings,
  isLoading,
}) => {
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部建筑 ({buildings.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : buildings.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">🏛️</span>
          <p className="text-sm">暂无任何建筑</p>
          <p className="text-xs mt-1">请先到资产管理中创建建筑</p>
        </div>
      ) : (
        buildings.map((b) => {
          const isGenerating = b.generation_status === 'generating';
          const statusText = STATUS_TEXT[b.generation_status] || b.generation_status;
          const statusClass = STATUS_CLASS[b.generation_status] || 'bg-slate-600/30 text-slate-300';
          const hasExterior = !!b.exterior_image_url;
          const hasInterior = !!b.interior_image_url;
          const thumbUrl = b.exterior_image_url || b.interior_image_url || b.image_url;

          return (
            <Card
              key={b.id}
              className="border transition-colors hover:border-amber-500/30 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              onDoubleClick={() => openAssetEditTab(b)}
              isPressable
            >
              <CardBody className="p-3">
                <div className="flex items-start gap-3">
                  {/* 图片缩略图 */}
                  <div className="shrink-0 relative">
                    {thumbUrl ? (
                      <div className="relative group">
                        <Image
                          src={thumbUrl}
                          alt={b.name}
                          removeWrapper
                          className="w-14 h-14 object-cover rounded-lg border border-slate-700/50 cursor-zoom-in"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ url: thumbUrl!, name: b.name });
                          }}
                        />
                        {hasInterior && hasExterior && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500/80 rounded-full flex items-center justify-center">
                            <span className="text-[8px] text-white font-bold">2</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <ZoomIn className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-slate-600 flex items-center justify-center bg-slate-800/40">
                        <Building2 className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {b.name}
                    </p>
                    {b.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                        {b.description}
                      </p>
                    )}

                    {/* 属性标签 */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {b.interior_exterior && (
                        <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-300 h-5 text-[10px]">
                          {interiorExteriorLabel[b.interior_exterior] || b.interior_exterior}
                        </Chip>
                      )}
                      {b.structure_type && (
                        <Chip size="sm" variant="flat" className="bg-slate-500/10 text-slate-300 h-5 text-[10px]">
                          {b.structure_type}
                        </Chip>
                      )}
                      <Chip size="sm" variant="flat" className={`h-5 text-[10px] ${statusClass}`}>
                        {statusText}
                      </Chip>
                    </div>

                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                      双击卡片在右侧编辑
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}


      {/* 图片预览弹窗 */}
      <Modal isOpen={!!previewImage} onOpenChange={() => setPreviewImage(null)} size="xl">
        <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
          <ModalHeader className="text-slate-100 font-bold">
            {previewImage?.name}
          </ModalHeader>
          <ModalBody className="p-2 flex items-center justify-center">
            {previewImage?.url && (
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default BuildingsTab;
