import React, { useState } from 'react';
import { Card, CardBody, Button, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { Trash2, Edit2, Film, MapPin, Box, Wand2, Globe } from 'lucide-react';
import { Studio } from '../../services/studios';
import { generateEnvironmentPanorama } from '../../services/environments';
import PanoramaViewer from '../../components/PanoramaViewer';

interface StudioListProps {
  studios: Studio[];
  onEdit: (studio: Studio) => void;
  onDelete: (id: number) => void;
  selectedImageModel?: string;
  selectedTextModel?: string;
}

const StudioList: React.FC<StudioListProps> = ({ studios, onEdit, onDelete, selectedImageModel, selectedTextModel }) => {
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [previewStudio, setPreviewStudio] = useState<Studio | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  // Modal 延迟渲染
  React.useEffect(() => {
    if (previewStudio) {
      setPreviewReady(false);
      const timer = setTimeout(() => setPreviewReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setPreviewReady(false);
    }
  }, [previewStudio]);

  const handleGenerateStudioImage = async (studio: Studio) => {
    if (!studio.environment_id) return;
    if (!selectedImageModel) return;
    setGeneratingIds((prev) => new Set(prev).add(studio.id));
    try {
      await generateEnvironmentPanorama(studio.environment_id, {
        imageModel: selectedImageModel,
        textModel: selectedTextModel || undefined,
      });
    } finally {
      setGeneratingIds((prev) => {
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
          const isGenerating = generatingIds.has(s.id);
          const envData = (s as any).environment as { id: number; name: string; image_url: string | null; panorama_image_url: string | null } | null;
          const hasPanorama = !!envData?.panorama_image_url;
          const coverUrl = envData?.panorama_image_url || envData?.image_url || s.cover_image_url;

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
                    <div className="w-full h-full flex items-center justify-center text-(--text-muted)">
                      <Film className="w-12 h-12 opacity-40" />
                    </div>
                  )}

                  {/* 全景图预览入口 */}
                  {hasPanorama && (
                    <div
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
                      onClick={() => setPreviewStudio(s)}
                    >
                      <div className="bg-black/60 rounded-full p-1.5 hover:bg-black/80">
                        <Globe className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  )}

                  {/* Hover 操作层 */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                    {s.environment_id && (
                      hasPanorama ? (
                        <Button
                          size="sm"
                          variant="solid"
                          color="primary"
                          className="text-xs"
                          isLoading={isGenerating}
                          onPress={() => handleGenerateStudioImage(s)}
                          startContent={!isGenerating ? <Wand2 className="w-3 h-3" /> : undefined}
                        >
                          {isGenerating ? '生成中' : '重新生成'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="solid"
                          color="primary"
                          className="text-xs"
                          isLoading={isGenerating}
                          onPress={() => handleGenerateStudioImage(s)}
                          startContent={!isGenerating ? <Wand2 className="w-3 h-3" /> : undefined}
                        >
                          {isGenerating ? '生成中' : '生成影棚图'}
                        </Button>
                      )
                    )}
                  </div>
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
                    {hasPanorama && (
                      <Chip size="sm" variant="flat" className="bg-green-500/10 text-green-500 font-medium">
                        影棚图✓
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

      {/* 影棚全景图预览 Modal */}
      <Modal
        isOpen={!!previewStudio}
        onClose={() => setPreviewStudio(null)}
        size="5xl"
        classNames={{ base: 'bg-black border-none', wrapper: 'items-center' }}
        hideCloseButton
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex items-center justify-between bg-black/80 text-white border-b border-white/10 shrink-0">
                <span>{previewStudio?.name || ''} — 影棚全景预览</span>
                <Button
                  size="sm"
                  variant="light"
                  className="text-white"
                  onPress={() => setPreviewStudio(null)}
                >
                  关闭
                </Button>
              </ModalHeader>
              <ModalBody className="p-0 overflow-hidden flex-none" style={{ height: 500, width: '100%' }}>
                {previewReady && previewStudio && (() => {
                  const envData = (previewStudio as any).environment as { panorama_image_url: string } | null;
                  return envData?.panorama_image_url ? (
                    <PanoramaViewer
                      src={envData.panorama_image_url}
                      autoRotateSpeed={0.02}
                    />
                  ) : null;
                })()}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default StudioList;
