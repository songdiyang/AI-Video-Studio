import React from 'react';
import { Card, CardBody, Button, Chip, Image } from '@heroui/react';
import { Trash2, Image as ImageIcon, Sparkles, Hammer, Mountain } from 'lucide-react';
import { SceneElement } from '../../services/sceneElements';

interface SceneElementListProps {
  elements: SceneElement[];
  onDelete: (id: number) => void;
  onGenerate: (element: SceneElement) => void;
  onViewDetail?: (element: SceneElement) => void;
}

const STATUS_TEXT: Record<SceneElement['generation_status'], string> = {
  pending: '未生成',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_CLASS: Record<SceneElement['generation_status'], string> = {
  pending: 'bg-gray-500/10 text-gray-400',
  generating: 'bg-blue-500/10 text-blue-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
};

const SceneElementList: React.FC<SceneElementListProps> = ({
  elements,
  onDelete,
  onGenerate,
  onViewDetail,
}) => {
  if (!elements.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无场景元素。可在场景详情里让 AI 从场景描述中自动抽取，也可手动添加。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
      {elements.map((el) => {
        const CategoryIcon = el.category === 'building' ? Hammer : Mountain;
        const categoryLabel = el.category === 'building' ? '建筑' : '场景';
        return (
          <Card
            key={el.id}
            className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow"
            classNames={{ base: 'h-full', body: 'h-full' }}
            isPressable
            onPress={() => onViewDetail?.(el)}
          >
            <CardBody className="p-4 flex flex-col gap-3 h-full">
              <div className="flex items-start gap-3">
                {el.image_url ? (
                  <Image
                    src={el.image_url}
                    alt={el.name}
                    removeWrapper
                    className="w-20 h-20 object-cover rounded-md border border-(--border-color) shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-md border border-dashed border-(--border-color) flex items-center justify-center text-(--text-muted) shrink-0">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-(--text-primary) truncate">
                      {el.name}
                    </h3>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="light"
                        onPress={() => onDelete(el.id)}
                        className="hover:bg-red-500/10"
                        title="删除元素"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-(--text-secondary) line-clamp-2 mt-1">
                    {el.description || '未填写描述'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-auto">
                <Chip
                  size="sm"
                  variant="flat"
                  startContent={<CategoryIcon className="w-3 h-3" />}
                  className="bg-amber-500/10 text-amber-400 font-medium"
                >
                  {categoryLabel}
                </Chip>
                <Chip
                  size="sm"
                  variant="flat"
                  className={`font-medium ${STATUS_CLASS[el.generation_status]}`}
                >
                  {STATUS_TEXT[el.generation_status]}
                </Chip>

                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    startContent={<Sparkles className="w-3.5 h-3.5" />}
                    isDisabled={el.generation_status === 'generating'}
                    onPress={() => onGenerate(el)}
                  >
                    {el.generation_status === 'completed' ? '重新生成' : '生成图片'}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
};

export default SceneElementList;
