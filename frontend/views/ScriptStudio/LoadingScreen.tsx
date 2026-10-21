/**
 * 加载屏幕组件
 * 使用骨架屏效果提供更好的加载体验
 */

import React from 'react';
import Skeleton from '../../components/Skeleton';

const LoadingScreen: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)] p-6 space-y-6">
      {/* 顶部工具栏骨架 */}
      <div className="flex items-center justify-between">
        <Skeleton width={200} height={32} />
        <div className="flex gap-3">
          <Skeleton width={100} height={36} className="rounded-md" />
          <Skeleton width={100} height={36} className="rounded-md" />
        </div>
      </div>
      
      {/* 主内容区域骨架 */}
      <div className="flex-1 flex gap-6">
        {/* 左侧面板 */}
        <div className="w-1/3 space-y-4">
          <Skeleton height={24} width="60%" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
                <div className="flex items-start gap-3">
                  <Skeleton width={64} height={48} className="rounded flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton width="70%" height={16} />
                    <Skeleton width="90%" height={12} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* 右侧面板 */}
        <div className="flex-1 space-y-4">
          <Skeleton height={24} width="40%" />
          <div className="p-6 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] space-y-4">
            <Skeleton height={200} card />
            <Skeleton lines={4} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
