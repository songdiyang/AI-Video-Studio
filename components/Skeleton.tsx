import React from 'react';

interface SkeletonProps {
  className?: string;
  /** 显示几行 */
  lines?: number;
  /** 是否显示为圆形（头像） */
  circle?: boolean;
  /** 是否显示为卡片形状 */
  card?: boolean;
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
}

/**
 * 通用骨架屏组件
 * 使用 CSS 动画实现流光效果
 */
const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  lines = 1,
  circle = false,
  card = false,
  width,
  height,
}) => {
  const baseClass = 'skeleton skeleton-shimmer';
  const shapeClass = circle ? 'skeleton-circle' : card ? 'skeleton-card' : '';
  
  const style: React.CSSProperties = {
    width: width ?? (circle ? '40px' : '100%'),
    height: height ?? (circle ? '40px' : card ? '120px' : '16px'),
  };

  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} ${shapeClass}`}
            style={{
              ...style,
              // 最后一行宽度稍短，更自然
              width: i === lines - 1 ? '75%' : style.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} ${shapeClass} ${className}`}
      style={style}
    />
  );
};

// 预设的骨架屏组合
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] ${className}`}>
    <div className="flex items-start gap-3">
      <Skeleton circle width={48} height={48} />
      <div className="flex-1 space-y-2">
        <Skeleton width="60%" height={18} />
        <Skeleton lines={2} height={14} />
      </div>
    </div>
  </div>
);

export const SkeletonListItem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center gap-3 p-3 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] ${className}`}>
    <Skeleton width={64} height={40} className="rounded flex-shrink-0" />
    <div className="flex-1 space-y-1.5">
      <Skeleton width="40%" height={14} />
      <Skeleton width="80%" height={12} />
    </div>
  </div>
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ 
  lines = 3, 
  className = '' 
}) => (
  <Skeleton lines={lines} className={className} />
);

export default Skeleton;
