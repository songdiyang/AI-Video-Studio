// 运行时平台判定
//
// 本地实现是唯一运行路径：/api 由本地路由层常驻接管，不依赖任何后端服务器。
// isDesktop()/isTauri() 仅用于选择 Tauri 原生能力（文件系统 / invoke），与网络后端无关。
// 网络仅作为连通性指示，不再有「离线 / 在线模式」这一开关概念。

import { isTauri } from '../services/localApi';

/** 是否运行在 Tauri 桌面壳内 */
export function isDesktop(): boolean {
  return isTauri();
}

const BROWSER_DESIGN_WIDTH = 1400;
const BROWSER_DESIGN_HEIGHT = 900;
const BROWSER_SCALED_CLASS = 'browser-viewport-scaled';
const BROWSER_MOBILE_CLASS = 'browser-mobile-unsupported';

/**
 * 浏览器端按桌面端设计尺寸等比缩放，手机比例视口只显示桌面调试提示。
 * 缩放挂在 html 上，Portal 弹层和全屏遮罩才能与应用使用同一坐标系。
 */
export function initializeBrowserViewport(): void {
  if (isDesktop()) return;

  const root = document.documentElement;
  const canScale = typeof CSS !== 'undefined' && CSS.supports('zoom', '1');
  let frame = 0;

  const update = () => {
    frame = 0;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 0 || height <= 0) return;

    const isMobileViewport = width < 768
      || (width < 1024 && height > width)
      || (width <= 1024 && height < 500);
    root.classList.toggle(BROWSER_MOBILE_CLASS, isMobileViewport);

    if (isMobileViewport || !canScale) {
      root.classList.remove(BROWSER_SCALED_CLASS);
      root.style.removeProperty('--browser-viewport-scale');
      root.style.removeProperty('--browser-viewport-width');
      root.style.removeProperty('--browser-viewport-height');
      return;
    }

    const scale = Math.min(width / BROWSER_DESIGN_WIDTH, height / BROWSER_DESIGN_HEIGHT);
    if (!Number.isFinite(scale) || scale <= 0) return;

    root.style.setProperty('--browser-viewport-scale', String(scale));
    root.style.setProperty('--browser-viewport-width', `${width / scale}px`);
    root.style.setProperty('--browser-viewport-height', `${height / scale}px`);
    root.classList.add(BROWSER_SCALED_CLASS);
  };

  const scheduleUpdate = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  };

  update();
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
}

/** React 布局断点与 CSS design 变体共用逻辑视口，避免物理窗口误触平板样式。 */
export function matchesViewportQuery(query: string): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof document === 'undefined' || !document.documentElement.classList.contains(BROWSER_SCALED_CLASS)) {
    return window.matchMedia(query).matches;
  }

  const { width } = getViewportSize();
  const minWidth = query.match(/\(min-width:\s*([\d.]+)px\)/);
  const maxWidth = query.match(/\(max-width:\s*([\d.]+)px\)/);
  return (!minWidth || width >= Number(minWidth[1]))
    && (!maxWidth || width <= Number(maxWidth[1]));
}

/** 浮层定位使用逻辑视口；浏览器等比缩放时与 getBoundingClientRect 保持同一单位。 */
export function getViewportSize(): { width: number; height: number } {
  const fallback = {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  };
  if (typeof document === 'undefined' || !document.documentElement.classList.contains(BROWSER_SCALED_CLASS)) {
    return fallback;
  }

  const style = document.documentElement.style;
  const width = Number.parseFloat(style.getPropertyValue('--browser-viewport-width'));
  const height = Number.parseFloat(style.getPropertyValue('--browser-viewport-height'));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : fallback;
}
