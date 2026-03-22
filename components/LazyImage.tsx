import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import Skeleton from './Skeleton';

/**
 * 懒加载 hook - 使用 Intersection Observer 实现图片懒加载
 * 图片未进入视口时不加载，提前 200px 开始加载
 */
export const useLazyImage = (src: string | undefined) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!src) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // 提前 200px 开始加载
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  const handleLoad = useCallback(() => setIsLoaded(true), []);
  const handleError = useCallback(() => setHasError(true), []);

  return { containerRef, isVisible, isLoaded, hasError, handleLoad, handleError };
};

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** 图片容器额外的 style */
  style?: React.CSSProperties;
  /** 点击回调 */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * 懒加载图片组件
 * - 使用 loading="lazy" 原生懒加载
 * - 加载时显示骨架屏占位符
 * - 加载完成后淡入显示
 * - 支持加载失败显示占位符
 */
const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  fallback,
  style,
  onClick,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // 重置状态当 src 变化时
  React.useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
  };

  const handleError = () => {
    setError(true);
    setLoaded(false);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
      {/* 加载中或加载失败时显示占位符 */}
      {!loaded && !error && (
        fallback || (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-app)]">
            <Skeleton card className="w-full h-full" />
          </div>
        )
      )}
      
      {/* 加载失败显示错误占位符 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)]">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      
      {/* 实际图片 - 使用原生懒加载 */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ position: loaded ? 'relative' : 'absolute', inset: 0 }}
      />
    </div>
  );
};

export default memo(LazyImage);
