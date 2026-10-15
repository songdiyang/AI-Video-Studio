import { useEffect, useRef, useCallback, useState } from 'react';
import { StoryboardScene } from '../useSceneManager';

/**
 * 图片预加载 hook
 * 
 * 功能：
 * - 预加载当前滚动位置附近分镜的首帧图片
 * - 使用 Map 缓存已预加载的图片，避免重复加载
 * - 支持配置预加载范围
 * 
 * @param scenes 分镜列表
 * @param currentIndex 当前可视区域的分镜索引（基于滚动位置）
 * @param preloadRange 预加载范围，默认前后各 3 个分镜
 */
export const useImagePreloader = (
  scenes: StoryboardScene[],
  currentIndex: number,
  preloadRange: number = 3
) => {
  // 缓存已预加载的图片 URL
  const cacheRef = useRef<Map<string, boolean>>(new Map());
  // 预加载队列，避免同时加载太多图片
  const loadingRef = useRef<Set<string>>(new Set());
  // 最大并发加载数
  const MAX_CONCURRENT = 3;

  /**
   * 预加载单张图片
   */
  const preloadImage = useCallback((url: string): Promise<void> => {
    if (!url || cacheRef.current.has(url) || loadingRef.current.has(url)) {
      return Promise.resolve();
    }

    // 检查并发数
    if (loadingRef.current.size >= MAX_CONCURRENT) {
      return Promise.resolve();
    }

    loadingRef.current.add(url);

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        cacheRef.current.set(url, true);
        loadingRef.current.delete(url);
        resolve();
      };
      img.onerror = () => {
        loadingRef.current.delete(url);
        resolve();
      };
      img.src = url;
    });
  }, []);

  /**
   * 批量预加载指定范围的图片
   */
  const preloadRange_ = useCallback(async () => {
    if (scenes.length === 0 || currentIndex < 0) return;

    // 计算需要预加载的索引范围
    const indices: number[] = [];
    for (let offset = -preloadRange; offset <= preloadRange; offset++) {
      const idx = currentIndex + offset;
      if (idx >= 0 && idx < scenes.length) {
        indices.push(idx);
      }
    }

    // 按照距离当前索引的距离排序，优先加载最近的
    indices.sort((a, b) => Math.abs(a - currentIndex) - Math.abs(b - currentIndex));

    // 收集需要预加载的 URL
    const urlsToPreload: string[] = [];
    for (const idx of indices) {
      const scene = scenes[idx];
      if (scene?.startFrame && !cacheRef.current.has(scene.startFrame)) {
        urlsToPreload.push(scene.startFrame);
      }
      if (scene?.endFrame && !cacheRef.current.has(scene.endFrame)) {
        urlsToPreload.push(scene.endFrame);
      }
    }

    // 逐批预加载
    for (const url of urlsToPreload) {
      await preloadImage(url);
    }
  }, [scenes, currentIndex, preloadRange, preloadImage]);

  // 当 currentIndex 变化时触发预加载
  useEffect(() => {
    preloadRange_();
  }, [preloadRange_]);

  /**
   * 检查图片是否已在缓存中
   */
  const isPreloaded = useCallback((url: string): boolean => {
    return cacheRef.current.has(url);
  }, []);

  /**
   * 获取缓存统计信息（调试用）
   */
  const getCacheStats = useCallback(() => {
    return {
      cachedCount: cacheRef.current.size,
      loadingCount: loadingRef.current.size
    };
  }, []);

  return {
    isPreloaded,
    getCacheStats,
    preloadImage
  };
};

/**
 * 滚动位置追踪 hook
 * 
 * 基于滚动容器的滚动位置计算当前可见的分镜索引
 * 
 * @param containerRef 滚动容器的 ref
 * @param itemHeight 每个分镜卡片的估计高度（包含间距）
 * @param debounceMs 防抖时间，默认 100ms
 */
export const useScrollIndex = (
  containerRef: React.RefObject<HTMLElement>,
  itemHeight: number = 120,
  debounceMs: number = 100
) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 防抖处理
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const scrollTop = container.scrollTop;
        // 计算当前可见区域中心对应的索引
        const centerOffset = container.clientHeight / 2;
        const estimatedIndex = Math.floor((scrollTop + centerOffset) / itemHeight);
        setCurrentIndex(Math.max(0, estimatedIndex));
      }, debounceMs);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // 初始计算
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [containerRef, itemHeight, debounceMs]);

  return currentIndex;
};

export default useImagePreloader;
