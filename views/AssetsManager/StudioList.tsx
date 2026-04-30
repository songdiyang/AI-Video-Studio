import React from 'react';
import { Card, CardBody, Button, Chip, Image } from '@heroui/react';
import { Trash2, Edit2, Film, MapPin, Box } from 'lucide-react';
import { Studio } from '../../services/studios';

interface StudioListProps {
  studios: Studio[];
  onEdit: (studio: Studio) => void;
  onDelete: (id: number) => void;
}

const StudioList: React.FC<StudioListProps> = ({ studios, onEdit, onDelete }) => {
  if (!studios.length) {
    return (
      <div className="mt-10 text-center text-(--text-muted)">
        <p>暂无影棚。点击右上角"新建影棚"创建，把场景和场景元素聚合成一个地点。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
      {studios.map((s) => (
        <Card
          key={s.id}
          className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow"
          classNames={{ base: 'h-full', body: 'h-full' }}
          isPressable
          onPress={() => onEdit(s)}
        >
          <CardBody className="p-0 flex flex-col h-full">
            {/* 封面 */}
            <div className="relative w-full h-40 bg-linear-to-br from-(--accent)/10 to-(--accent)/5 overflow-hidden">
              {s.cover_image_url ? (
                <Image
                  src={s.cover_image_url}
                  alt={s.name}
                  removeWrapper
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-(--text-muted)">
                  <Film className="w-12 h-12 opacity-40" />
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
      ))}
    </div>
  );
};

export default StudioList;
