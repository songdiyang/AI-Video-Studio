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
