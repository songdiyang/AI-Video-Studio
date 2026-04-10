import React, { useState, useEffect, useRef } from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
  delay?: number;
}

// easeOutCubic 缓动函数
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  color = 'var(--accent)',
  delay = 0,
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    // 如果已经动画过且值没变，不重复动画
    if (hasAnimatedRef.current && displayValue === value) {
      return;
    }

    const duration = 800; // 动画持续时间 800ms
    const startValue = 0;
    const endValue = value;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        hasAnimatedRef.current = true;
      }
    };

    // 延迟启动动画
    const timeoutId = setTimeout(() => {
      startTimeRef.current = null;
      animationRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, delay]);

  return (
    <div className="card-hover-lift p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] transition-all duration-300">
      <div className="flex items-center gap-3">
        {/* 图标区域 */}
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
            color: color,
          }}
        >
          {icon}
        </div>

        {/* 数据区域 */}
        <div className="flex flex-col min-w-0">
          <span
            className="text-2xl font-bold text-[var(--text-primary)] tabular-nums animate-count-up"
          >
            {displayValue}
          </span>
          <span className="text-xs text-[var(--text-muted)] truncate">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatCard;
