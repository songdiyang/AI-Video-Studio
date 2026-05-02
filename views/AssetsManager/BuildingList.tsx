import React, { useState } from 'react';
import { Card, CardBody, Button, Chip, Image, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
import { Edit2, Trash2, Building2, ZoomIn } from 'lucide-react';
import { Building } from '../../services/buildings';

interface BuildingListProps {
  buildings: Building[];
  onEdit: (b: Building) => void;
  onDelete: (id: number) => void;
  /** 保留字段以兼容老调用方；新版交互入口在「编辑建筑」Modal 中，这里不再触发生成。 */
  onGenerateImage?: (b: Building, viewType?: 'interior' | 'exterior' | 'both') => Promise<void>;
  onDeleteImage?: (id: number) => Promise<void>;
}

const BuildingList: React.FC<BuildingListProps> = ({ buildings, onEdit, onDelete, onDeleteImage }) => {
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  if (!buildings.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无建筑。点击右上角"新建建筑"创建，如小屋、宫殿、桥梁等。</p>
      </div>
    );
  }

  const typeLabel = (type?: string | null) => {
    switch (type) {
      case 'interior': return '室内';
      case 'exterior': return '室外';
      case 'both': return '室内+室外';
      default: return type || '未指定';
    }
  };

  const hasAnyImage = (b: Building) => !!(b.image_url || b.exterior_image_url || b.interior_image_url);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
        {buildings.map((b) => {
          const isGenerating = b.generation_status === 'generating';
          const ie = b.interior_exterior || 'both';
          const showExterior = ie === 'exterior' || ie === 'both';
          const showInterior = ie === 'interior' || ie === 'both';
          // 封面用外景优先；外景缺失退回内景再退回旧 image_url
          const coverUrl = b.exterior_image_url || b.image_url || b.interior_image_url || null;

          return (
            <Card
              key={b.id}
              className={`bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow ${isGenerating ? 'pointer-events-none select-none' : ''}`}
              classNames={{ base: 'h-full', body: 'h-full' }}
              isPressable
              onPress={() => onEdit(b)}
            >
              <CardBody className="p-0 flex flex-col h-full relative">
                {/* 生成中遮罩层 */}
                {isGenerating && (
                  <div className="absolute inset-0 z-30 bg-black/20 flex items-center justify-center rounded-lg">
                    <div className="bg-black/60 rounded-lg px-4 py-2 flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-white/80 animate-pulse" />
                      <span className="text-white text-sm font-medium">生成中…</span>
                    </div>
                  </div>
                )}
                {/* 封面/图片（16:9） */}
                <div className="relative w-full aspect-video bg-linear-to-br from-(--accent)/10 to-(--accent)/5 overflow-hidden group">
                  {coverUrl ? (
                    <Image
                      src={coverUrl}
                      alt={b.name}
                      removeWrapper
                      className={`w-full h-full object-cover transition-opacity ${isGenerating ? 'opacity-50' : ''}`}
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-(--text-muted) ${isGenerating ? 'opacity-50' : ''}`}>
                      <Building2 className="w-12 h-12 opacity-40" />
                    </div>
                  )}

                  {/* Hover 预览层 */}
                  {coverUrl && !isGenerating && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImagePreview({ url: coverUrl, title: `${b.name} · 外景四方位` });
                      }}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <div className="flex items-center gap-1.5 text-white text-xs">
                        <ZoomIn className="w-4 h-4" />查看大图
                      </div>
                    </button>
                  )}
                </div>

                {/* 内容 */}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-(--text-primary) truncate">
                      {b.name}
                    </h3>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onEdit(b)}
                        className="hover:bg-(--accent)/10"
                        title="编辑建筑 / 生成设定图"
                      >
                        <Edit2 className="w-4 h-4 text-(--text-secondary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onDelete(b.id)}
                        className="hover:bg-red-500/10"
                        title="删除建筑"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-(--text-secondary) line-clamp-2">
                    {b.description || '未填写描述'}
                  </p>

                  {/* 外景 / 内景 双缩略图（按 interior_exterior 过滤） */}
                  <div className="flex gap-2">
                    {showExterior && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (b.exterior_image_url) {
                            setImagePreview({ url: b.exterior_image_url, title: `${b.name} · 外景四方位` });
                          } else {
                            onEdit(b);
                          }
                        }}
                        className="flex-1 relative group/thumb"
                        title={b.exterior_image_url ? '点击查看大图' : '去编辑弹窗生成外景'}
                      >
                        {b.exterior_image_url ? (
                          <img
                            src={b.exterior_image_url}
                            alt={`${b.name} · 外景`}
                            className="w-full aspect-video object-cover rounded border border-(--border-color)"
                          />
                        ) : (
                          <div className="w-full aspect-video rounded bg-(--bg-input) border border-dashed border-(--border-color) flex items-center justify-center text-[10px] text-(--text-muted)">
                            外景未生成
                          </div>
                        )}
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">外景·四方位</span>
                        {b.exterior_image_url && (
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center rounded">
                            <ZoomIn className="w-4 h-4 text-white" />
                          </span>
                        )}
                      </button>
                    )}
                    {showInterior && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (b.interior_image_url) {
                            setImagePreview({ url: b.interior_image_url, title: `${b.name} · 内景草图` });
                          } else {
                            onEdit(b);
                          }
                        }}
                        className="flex-1 relative group/thumb"
                        title={b.interior_image_url ? '点击查看大图' : '去编辑弹窗生成内景草图'}
                      >
                        {b.interior_image_url ? (
                          <img
                            src={b.interior_image_url}
                            alt={`${b.name} · 内景`}
                            className="w-full aspect-video object-cover rounded border border-(--border-color)"
                          />
                        ) : (
                          <div className="w-full aspect-video rounded bg-(--bg-input) border border-dashed border-(--border-color) flex items-center justify-center text-[10px] text-(--text-muted)">
                            内景草图未生成
                          </div>
                        )}
                        <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">内景·设计草图</span>
                        {b.interior_image_url && (
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center rounded">
                            <ZoomIn className="w-4 h-4 text-white" />
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-auto">
                    <Chip size="sm" variant="flat" className="bg-purple-500/10 text-purple-500 font-medium">
                      {typeLabel(b.interior_exterior)}
                    </Chip>
                    {b.structure_type && (
                      <Chip size="sm" variant="flat" className="bg-indigo-500/10 text-indigo-500 font-medium">
                        {b.structure_type}
                      </Chip>
                    )}
                    {hasAnyImage(b) ? (
                      <Chip size="sm" variant="flat" className="bg-green-500/10 text-green-500 font-medium">
                        已有设定图
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="flat" className="bg-(--bg-input) text-(--text-muted)">
                        未生成
                      </Chip>
                    )}
                    {hasAnyImage(b) && onDeleteImage && (
                      <Button
                        size="sm"
                        variant="light"
                        className="h-6 text-[11px] px-2 text-default-400 hover:text-danger"
                        onPress={() => onDeleteImage(b.id)}
                        title="删除所有设定图"
                      >
                        清除
                      </Button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* 单图大图预览 Modal */}
      <Modal
        isOpen={!!imagePreview}
        onOpenChange={(open) => { if (!open) setImagePreview(null); }}
        size="4xl"
        classNames={{ base: 'bg-black', body: 'p-0' }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="text-white text-sm">{imagePreview?.title}</ModalHeader>
              <ModalBody>
                {imagePreview && (
                  <img
                    src={imagePreview.url}
                    alt={imagePreview.title}
                    className="w-full h-auto max-h-[80vh] object-contain"
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

export default BuildingList;
