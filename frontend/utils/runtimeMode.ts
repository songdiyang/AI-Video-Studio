// 运行时平台判定
//
// 桌面端（Tauri）即本地默认运行环境：/api 由本地路由层常驻接管，
// 网络仅作为连通性指示，不再有「离线 / 在线模式」这一开关概念。

import { isTauri } from '../services/localApi';

/** 是否运行在 Tauri 桌面壳内 */
export function isDesktop(): boolean {
  return isTauri();
}
