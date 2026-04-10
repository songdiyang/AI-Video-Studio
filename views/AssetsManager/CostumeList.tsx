import React, { useRef, useState, useEffect } from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
import { Edit, Trash2, Shirt } from 'lucide-react';
import { Costume } from '../../services/costumes';
import { useVirtualList } from '../../hooks/useVirtualList';

// 虚拟列表启用阈值
const VIRTUAL_LIST_THRESHOLD = 20;
// 固定卡片高度
const CARD_HEIGHT = 200;

interface CostumeListProps {
  costumes: Costume[];
  onEdit: (costume: Costume) => void;
  onDelete: (id: number) => void;
}

const CostumeList: React.FC<CostumeListProps> = ({ costumes, onEdit, onDelete }) => {
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
  const useVirtual = costumes.length > VIRTUAL_LIST_THRESHOLD;
  
  // 虚拟列表 hook
  const { virtualItems, containerProps, wrapperProps } = useVirtualList({
    itemCount: costumes.length,
    itemHeight: CARD_HEIGHT,
    containerHeight,
    overscan: 3,
  });

  // 获取性别显示文本
  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male': return '男性';
      case 'female': return '女性';
      default: return '通用';
    }
  };

  // 获取性别颜色
  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'bg-blue-500/10 text-blue-400';
      case 'female': return 'bg-pink-500/10 text-pink-400';
      default: return 'bg-slate-500/10 text-slate-400';
    }
  };

  // 获取分类颜色
  const getCategoryColor = (category: string) => {
    return 'bg-purple-500/10 text-purple-400';
  };

  // 渲染单个卡片
  const renderCostumeCard = (costume: Costume, style?: React.CSSProperties) => (
    <Card 
      key={costume.id} 
      className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow h-full cursor-pointer"
      style={style}
      isPressable
      onPress={() => onEdit(costume)}
    >
      <CardBody className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {/* 预览图 */}
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-(--bg-secondary) shrink-0 flex items-center justify-center border border-(--border-color)">
            {costume.front_view_url || costume.image_url ? (
              <img 
                src={costume.front_view_url || costume.image_url} 
                alt={costume.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Shirt className="w-8 h-8 text-(--text-muted)" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-(--text-primary) truncate">{costume.name}</h3>
              <div className="flex gap-1 ml-2">
                <Button 
                  size="sm" 
                  isIconOnly 
                  variant="light" 
                  onPress={() => onEdit(costume)} 
                  className="hover:bg-(--accent)/10"
                >
                  <Edit className="w-4 h-4 text-(--accent)" />
                </Button>
                <Button 
                  size="sm" 
                  isIconOnly 
                  variant="light" 
                  onPress={() => onDelete(costume.id)} 
                  className="hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
            
            {costume.description && (
              <p className="text-sm text-(--text-secondary) line-clamp-2 mt-1">{costume.description}</p>
            )}
          </div>
        </div>
        
        {/* 标签 */}
        <div className="flex flex-wrap gap-2">
          {costume.category && (
            <Chip size="sm" variant="flat" className={`${getCategoryColor(costume.category)} font-medium`}>
              {costume.category}
            </Chip>
          )}
          <Chip size="sm" variant="flat" className={`${getGenderColor(costume.gender)} font-medium`}>
            {getGenderText(costume.gender)}
          </Chip>
        </div>
      </CardBody>
    </Card>
  );

  // 空状态
  if (costumes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-(--text-muted)">
        <Shirt className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">暂无服装</p>
        <p className="text-sm mt-1">点击上方"新增"按钮创建服装资源</p>
      </div>
    );
  }

  // 虚拟列表渲染
  if (useVirtual) {
    return (
      <div 
        ref={listContainerRef} 
        {...containerProps}
        className="h-full overflow-auto"
      >
        <div {...wrapperProps}>
          {virtualItems.map((virtualItem) => {
            const costume = costumes[virtualItem.index];
            return (
              <div
                key={costume.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${CARD_HEIGHT}px`,
                  transform: `translateY(${virtualItem.offsetTop}px)`,
                  padding: '8px',
                }}
              >
                {renderCostumeCard(costume)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 普通列表渲染
  return (
    <div 
      ref={listContainerRef}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2 h-full overflow-auto"
    >
      {costumes.map((costume) => renderCostumeCard(costume))}
    </div>
  );
};

export default CostumeList;
