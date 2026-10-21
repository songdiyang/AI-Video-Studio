import React, { useRef, useState, useEffect } from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
import { Edit, Trash2 } from 'lucide-react';
import { Prop } from '../../services/assets';
import { useVirtualList } from '../../hooks/useVirtualList';
import { usePreview } from '../../components/PreviewProvider';
import { useLanguage } from '../../contexts/LanguageContext';

// 虚拟列表启用阈值
const VIRTUAL_LIST_THRESHOLD = 20;
// 固定卡片高度
const CARD_HEIGHT = 160;

interface PropListProps {
  props: Prop[];
  onEdit: (prop: Prop) => void;
  onDelete: (id: number) => void;
}

const PropList: React.FC<PropListProps> = ({ props, onEdit, onDelete }) => {
  const { t } = useLanguage();
  const { openPreview } = usePreview();

  // 虚拟列表容器 ref 和高度状态
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // 监听容器高度变化
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) {
          setContainerHeight(height);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 判断是否启用虚拟列表
  const useVirtual = props.length > VIRTUAL_LIST_THRESHOLD;

  // 虚拟列表 hook
  const { virtualItems, containerProps, wrapperProps } = useVirtualList({
    itemCount: props.length,
    itemHeight: CARD_HEIGHT,
    containerHeight,
    overscan: 3,
  });

  // 渲染单个卡片
  const renderPropCard = (prop: Prop, style?: React.CSSProperties) => (
    <Card
      key={prop.id}
      className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow h-full cursor-pointer"
      classNames={{ base: 'h-full', body: 'h-full' }}
      style={style}
      isPressable
      onPress={() => onEdit(prop)}
    >
      <CardBody className="p-4 flex flex-col gap-3 h-full">
        {/* 道具设定图（点击可预览大图） */}
        {prop.image_url ? (
          <img
            src={prop.image_url}
            alt={prop.name}
            className="w-full aspect-video object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              openPreview([{ src: prop.image_url, alt: prop.name }], 0);
            }}
          />
        ) : (
          <div className="w-full aspect-video bg-(--bg-muted) rounded-lg flex items-center justify-center text-(--text-muted) text-xs">
            {t.assetsManager.costume.noImage}
          </div>
        )}

        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-(--text-primary)">{prop.name}</h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              isIconOnly
              variant="light"
              onPress={() => onEdit(prop)}
              className="hover:bg-(--accent)/10"
            >
              <Edit className="w-4 h-4 text-(--accent)" />
            </Button>
            <Button
              size="sm"
              isIconOnly
              variant="light"
              onPress={() => onDelete(prop.id)}
              className="hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-(--text-secondary) line-clamp-2 flex-1">{prop.description}</p>
        <div className="flex flex-wrap gap-2 mt-auto">
          {prop.prop_type && (
            <Chip size="sm" variant="flat" className={
              prop.prop_type === 'permanent' ? 'bg-blue-500/10 text-blue-400 font-medium' :
              prop.prop_type === 'held' ? 'bg-amber-500/10 text-amber-400 font-medium' :
              'bg-cyan-500/10 text-cyan-400 font-medium'
            }>
              {prop.prop_type === 'permanent' ? t.assetsManager.prop.permanent : prop.prop_type === 'held' ? t.assetsManager.prop.held : t.assetsManager.prop.interactive}
            </Chip>
          )}
          {prop.generation_status && (
            <Chip size="sm" variant="flat" className={
              prop.generation_status === 'completed' ? 'bg-green-500/10 text-green-400 font-medium' :
              prop.generation_status === 'generating' ? 'bg-amber-500/10 text-amber-400 font-medium' :
              'bg-red-500/10 text-red-400 font-medium'
            }>
              {prop.generation_status === 'completed' ? t.assetsManager.prop.statusCompleted || '已生成' :
               prop.generation_status === 'generating' ? t.assetsManager.prop.statusGenerating || '生成中' :
               prop.generation_status === 'idle' ? t.assetsManager.prop.statusIdle || '待生成' : t.assetsManager.prop.statusFailed || '生成失败'}
            </Chip>
          )}
          {prop.category && (
            <Chip size="sm" variant="flat">{prop.category}</Chip>
          )}
        </div>
      </CardBody>
    </Card>
  );

  if (useVirtual) {
    // 虚拟列表模式
    return (
      <div 
        ref={listContainerRef}
        className="mt-6"
        style={{ minHeight: 300, height: 'calc(100vh - 400px)' }}
      >
        <div 
          {...containerProps}
          className="rounded-lg"
          style={{ ...containerProps.style, height: containerHeight }}
        >
          <div {...wrapperProps}>
            {virtualItems.map(({ index, offsetTop }) => {
              const prop = props[index];
              return (
                <div
                  key={prop.id}
                  style={{
                    position: 'absolute',
                    top: offsetTop,
                    left: 0,
                    right: 0,
                    height: CARD_HEIGHT,
                    padding: '8px 0',
                  }}
                >
                  {renderPropCard(prop)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 常规网格模式
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6 items-stretch">
      {props.map((prop) => renderPropCard(prop))}
    </div>
  );
};

export default PropList;
