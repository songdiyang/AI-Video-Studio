import { useCallback } from 'react';

/**
 * 路由模块映射表，key 对应导航路径
 * 用于路由预加载，减少页面切换白屏时间
 */
const routeModules: Record<string, () => Promise<any>> = {
  '/projects': () => import('../views/Projects'),
  '/storyboard': () => import('../views/SimpleStoryBoard/index'),
  '/assets': () => import('../views/AssetsManager/index'),
  '/video': () => import('../views/VideoComposition/index'),
  '/settings': () => import('../views/Settings/index'),
  '/user-center': () => import('../views/UserCenter'),
  '/script-studio': () => import('../views/ScriptStudio/index'),
  '/sketch-studio': () => import('../views/SketchStudio/index'),
};

// 缓存已预加载的路由，避免重复加载
const preloadedRoutes = new Set<string>();

/**
 * 路由预加载 Hook
 * 
 * 实现原理：在用户 hover 导航链接时预加载对应路由的懒加载组件，
 * 减少页面切换白屏时间。
 * 
 * @example
 * ```tsx
 * const { preload } = useRoutePreload();
 * 
 * <Link 
 *   to="/projects" 
 *   onMouseEnter={() => preload('/projects')}
 * >
 *   Projects
 * </Link>
 * ```
 */
export function useRoutePreload() {
  const preload = useCallback((path: string) => {
    // 已预加载过则跳过
    if (preloadedRoutes.has(path)) return;
    
    const loader = routeModules[path];
    if (loader) {
      preloadedRoutes.add(path);
      // 触发 import 即可，Vite 会缓存结果
      loader();
    }
  }, []);
  
  return { preload };
}

export default useRoutePreload;
