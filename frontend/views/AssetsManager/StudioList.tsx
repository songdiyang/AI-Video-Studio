import React, { useState } from 'react';
import { Card, CardBody, Button, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { Trash2, Edit2, Film, MapPin, Box, LayoutGrid } from 'lucide-react';
import { Studio, generateStudioNineGrid } from '../../services/studios';

interface StudioListProps {
  studios: Studio[];
  onEdit: (studio: Studio) => void;
  onDelete: (id: number) => void;
  selectedImageModel?: string;
  selectedTextModel?: string;
}

const StudioList: React.FC<StudioListProps> = ({ studios, onEdit, onDelete, selectedImageModel, selectedTextModel }) => {
  const [generatingNineGridIds, setGeneratingNineGridIds] = useState<Set<number>>(new Set());
  const [previewNineGrid, setPreviewNineGrid] = useState<Studio | null>(null);

  const handleGenerateNineGrid = async (studio: Studio) => {
    if (!selectedImageModel) return;
    const buildingCount = ((studio as any).buildings as any[] | undefined)?.length || 0;
    // 允许仅绑定环境、仅关联建筑，或两者并存，任一为空也放行
    if (!studio.environment_id && buildingCount === 0) return;
    setGeneratingNineGridIds((prev) => new Set(prev).add(studio.id));
    try {
      await generateStudioNineGrid(studio.id, {
        imageModel: selectedImageModel,
        textModel: selectedTextModel || undefined,
      });
    } finally {
      setGeneratingNineGridIds((prev) => {
        const next = new Set(prev);
        next.delete(studio.id);
        return next;
      });
    }
  };

  if (!studios.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无影棚。点击右上角"新建影棚"创建，把场景和场景元素聚合成一个地点。</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
        {studios.map((s) => {
          const isGeneratingNineGrid = generatingNineGridIds.has(s.id);
          const envData = (s as any).environment as { id: number; name: string; image_url: string | null } | null;
          const hasNineGrid = !!s.nine_grid_image_url;
          // 封面仅显示九宫组装图
          const coverUrl = s.nine_grid_image_url;
          const nineGridStatus = s.nine_grid_generation_status;

          return (
            <Card
              key={s.id}
              className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow group"
              classNames={{ base: 'h-full', body: 'h-full' }}
            >
              <CardBody className="p-0 flex flex-col h-full">
                {/* 封面 */}
                <div className="relative w-full h-40 bg-linear-to-br from-(--accent)/10 to-(--accent)/5 overflow-hidden">
                  {coverUrl ? (
                    <Image
                      src={coverUrl}
                      alt={s.name}
                      removeWrapper
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-(--text-muted) gap-1">
                      <LayoutGrid className="w-8 h-8 opacity-30" />
                      <span className="text-xs opacity-50">九宫图未生成</span>
                    </div>
                  )}

                  {/* 角标：九宫图预览入口 */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    {hasNineGrid && (
                      <div
                        className="cursor-pointer"
                        onClick={() => setPreviewNineGrid(s)}
                        title="查看九宫组装图"
                      >
                        <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
                          <LayoutGrid className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Hover 操作层 —— 有九宫图则预览，无则提示到编辑中生成 */}
                  {hasNineGrid && (
                    <div
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 cursor-pointer"
                      onClick={() => setPreviewNineGrid(s)}
                    >
                      <div className="bg-black/60 rounded-lg px-4 py-2 flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-white" />
                        <span className="text-white text-sm font-medium">预览九宫图</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 内容 */}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-(--text-primary) truncate">
                      {s.name}
                    </h3>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onEdit(s)}
                        className="hover:bg-(--accent)/10"
                        title="编辑影棚"
                      >
                        <Edit2 className="w-4 h-4 text-(--text-secondary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onDelete(s.id)}
                        className="hover:bg-red-500/10"
                        title="删除影棚"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-(--text-secondary) line-clamp-2">
                    {s.description || '未填写描述'}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    {hasNineGrid && (
                      <Chip size="sm" variant="flat" className="bg-purple-500/10 text-purple-500 font-medium" startContent={<LayoutGrid className="w-3 h-3" />}>
                        九宫图✓
                      </Chip>
                    )}
                    {!hasNineGrid && nineGridStatus === 'generating' && (
                      <Chip size="sm" variant="flat" className="bg-purple-500/10 text-purple-500 font-medium">
                        九宫图生成中…
                      </Chip>
                    )}
                    {!hasNineGrid && nineGridStatus === 'failed' && (
                      <Chip size="sm" variant="flat" className="bg-red-500/10 text-red-500 font-medium">
                        九宫图失败
                      </Chip>
                    )}
                    <Chip
                      size="sm"
                      variant="flat"
                      startContent={<MapPin className="w-3 h-3" />}
                      className="bg-blue-500/10 text-blue-500 font-medium"
                    >
                      场景 {s.scene_count ?? 0}
                    </Chip>
                    <Chip
                      size="sm"
                      variant="flat"
                      startContent={<Box className="w-3 h-3" />}
                      className="bg-amber-500/10 text-amber-500 font-medium"
                    >
                      元素 {s.element_count ?? 0}
                    </Chip>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 影棚九宫组装图预览 Modal */}
      <Modal
        isOpen={!!previewNineGrid}
        onClose={() => setPreviewNineGrid(null)}
        size="4xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{previewNineGrid?.name || ''} — 九宫组装图</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => setPreviewNineGrid(null)}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-2 flex items-center justify-center bg-black">
                {previewNineGrid?.nine_grid_image_url && (
                  <img
                    src={previewNineGrid.nine_grid_image_url}
                    alt={`${previewNineGrid.name} 九宫组装图`}
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default StudioList;
