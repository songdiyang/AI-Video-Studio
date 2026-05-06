import React, { useState } from 'react';
import { Card, CardBody, Button, Chip, Modal, ModalContent, ModalHeader, ModalBody } from '@heroui/react';
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

const BuildingList: React.FC<BuildingListProps> = ({ buildings, onEdit, onDelete, onGenerateImage, onDeleteImage }) => {
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  // 每个卡片各自记住当前选中的 Tab（外景/内景），默认外景优先
  const [cardView, setCardView] = useState<Record<number, 'exterior' | 'interior'>>({});
  const getView = (id: number): 'exterior' | 'interior' => cardView[id] ?? 'exterior';
  const setView = (id: number, v: 'exterior' | 'interior') =>
    setCardView((prev) => ({ ...prev, [id]: v }));

  if (!buildings.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无建筑。点击右上角"新建建筑"创建，如小屋、宫殿、桥梁等。</p>
      </div>
    );
  }

  const hasAnyImage = (b: Building) => !!(b.image_url || b.exterior_image_url || b.interior_image_url);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
        {buildings.map((b) => {
          const isGenerating = b.generation_status === 'generating';
          const hasExt = !!b.exterior_image_url;
          const hasInt = !!b.interior_image_url;
          const view = getView(b.id);

          return (
            <Card
              key={b.id}
              className={`bg-(--bg-card) border border-(--border-color) hover:border-(--accent)/50 shadow-sm hover:shadow-lg hover:shadow-(--accent)/10 hover:-translate-y-0.5 transition-all duration-200 ${isGenerating ? 'pointer-events-none select-none' : ''}`}
              classNames={{ base: 'h-full', body: 'h-full' }}
              isPressable
              onPress={() => onEdit(b)}
            >
              <CardBody className="p-0 flex flex-col h-full relative">
                {/* 生成中遮罩层（覆盖整卡） */}
                {isGenerating && (
                  <div className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                    <div className="bg-black/70 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
                      <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-white text-sm font-medium">生成中…</span>
                    </div>
                  </div>
                )}

                <div className="p-4 flex flex-col gap-3 flex-1">
                  {/* 标题行：名称 + 结构类型 chip + 操作 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-semibold text-(--text-primary) truncate">
                        {b.name}
                      </h3>
                      {b.structure_type && (
                        <Chip
                          size="sm"
                          variant="flat"
                          className="bg-indigo-500/10 text-indigo-500 font-medium h-5 text-[10px]"
                        >
                          {b.structure_type}
                        </Chip>
                      )}
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onEdit(b)}
                        className="hover:bg-(--accent)/10 min-w-8 w-8 h-8"
                        title="编辑建筑 / 生成设定图"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-(--text-secondary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onDelete(b.id)}
                        className="hover:bg-red-500/10 min-w-8 w-8 h-8"
                        title="删除建筑"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>

                  {/* 描述 */}
                  <p className="text-xs text-(--text-secondary) line-clamp-2 min-h-[2rem]">
                    {b.description || <span className="text-(--text-muted) italic">未填写描述</span>}
                  </p>

                  {/* 叠加卡片：Tab 切换外景/内景 —— 每个建筑天然都有两面，生不生成看用户 */}
                  <div className="flex flex-col gap-2">
                    {/* Tab 切换条 */}
                    <div
                      className="flex gap-1 bg-(--bg-input) p-0.5 rounded-md"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setView(b.id, 'exterior')}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all flex items-center justify-center gap-1 ${
                          view === 'exterior'
                            ? 'bg-(--bg-card) text-(--accent-light) font-medium shadow-sm'
                            : 'text-(--text-muted) hover:text-(--text-secondary)'
                        }`}
                      >
                        外景·四方位
                        {hasExt && <span className="w-1 h-1 rounded-full bg-green-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setView(b.id, 'interior')}
                        className={`flex-1 text-[11px] py-1.5 rounded transition-all flex items-center justify-center gap-1 ${
                          view === 'interior'
                            ? 'bg-(--bg-card) text-(--accent-light) font-medium shadow-sm'
                            : 'text-(--text-muted) hover:text-(--text-secondary)'
                        }`}
                      >
                        内景·九宫格
                        {hasInt && <span className="w-1 h-1 rounded-full bg-green-500" />}
                      </button>
                    </div>

                    {/* 叠加展示区：同时挂载两种视图 DOM，切换用 CSS 控制显隐，避免重新下载/解码带来的闪烁 */}
                    <div className={view === 'exterior' ? 'block' : 'hidden'}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasExt) {
                            setImagePreview({ url: b.exterior_image_url!, title: `${b.name} · 外景四方位` });
                          } else if (onGenerateImage) {
                            onGenerateImage(b, 'exterior');
                          } else {
                            onEdit(b);
                          }
                        }}
                        className="w-full relative group/thumb rounded-lg overflow-hidden"
                        title={hasExt ? '点击查看大图' : '点击生成外景四方位'}
                      >
                        {hasExt ? (
                          <img
                            src={b.exterior_image_url!}
                            alt={`${b.name} · 外景`}
                            loading="eager"
                            decoding="async"
                            className="w-full aspect-video object-cover border border-(--border-color) group-hover/thumb:border-(--accent)/40 transition-colors"
                          />
                        ) : (
                          <div className="w-full aspect-video bg-linear-to-br from-(--accent)/5 to-transparent border-2 border-dashed border-(--border-color) hover:border-(--accent)/40 flex flex-col items-center justify-center text-[11px] text-(--text-muted) gap-1 transition-colors">
                            <Building2 className="w-8 h-8 opacity-40" />
                            <span className="font-medium">外景四方位未生成</span>
                            <span className="text-[10px] opacity-70">Front / Back / Left / Right</span>
                            <span className="text-[10px] text-(--accent-light) mt-1">点击生成 →</span>
                          </div>
                        )}
                        {hasExt && (
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="flex items-center gap-1 text-white text-xs font-medium">
                              <ZoomIn className="w-4 h-4" />查看大图
                            </span>
                          </span>
                        )}
                      </button>
                    </div>
                    <div className={view === 'interior' ? 'block' : 'hidden'}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasInt) {
                            setImagePreview({ url: b.interior_image_url!, title: `${b.name} · 内景九宫格（6视角+3特写）` });
                          } else if (onGenerateImage) {
                            onGenerateImage(b, 'interior');
                          } else {
                            onEdit(b);
                          }
                        }}
                        className="w-full relative group/thumb rounded-lg overflow-hidden"
                        title={hasInt ? '点击查看大图（6 视角 + 3 特写）' : '点击生成内景九宫格'}
                      >
                        {hasInt ? (
                          <img
                            src={b.interior_image_url!}
                            alt={`${b.name} · 内景九宫格`}
                            loading="eager"
                            decoding="async"
                            className="w-full aspect-square object-cover border border-(--border-color) group-hover/thumb:border-(--accent)/40 transition-colors"
                          />
                        ) : (
                          <div className="w-full aspect-square bg-linear-to-br from-(--accent)/5 to-transparent border-2 border-dashed border-(--border-color) hover:border-(--accent)/40 flex flex-col items-center justify-center text-[11px] text-(--text-muted) gap-1 transition-colors">
                            <Building2 className="w-8 h-8 opacity-40" />
                            <span className="font-medium">内景九宫格未生成</span>
                            <span className="text-[10px] opacity-70">6 视角 + 3 细节特写</span>
                            <span className="text-[10px] text-(--accent-light) mt-1">点击生成 →</span>
                          </div>
                        )}
                        {hasInt && (
                          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="flex items-center gap-1 text-white text-xs font-medium">
                              <ZoomIn className="w-4 h-4" />查看大图
                            </span>
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 底部：状态条 */}
                  {hasAnyImage(b) && onDeleteImage && (
                    <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                      <span className="text-[10px] text-(--text-muted) flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-0.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasExt ? 'bg-green-500' : 'bg-(--border-color)'}`} />
                          外
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasInt ? 'bg-green-500' : 'bg-(--border-color)'}`} />
                          内
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="light"
                        className="h-6 text-[11px] px-2 text-default-400 hover:text-danger"
                        onPress={() => onDeleteImage(b.id)}
                        title="删除所有设定图"
                      >
                        清除
                      </Button>
                    </div>
                  )}
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
