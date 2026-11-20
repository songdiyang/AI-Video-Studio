// 应用自动更新：打包版启动后静默检查 GitHub Release
//
// 链路：CI 构建时用 TAURI_SIGNING_PRIVATE_KEY 对 NSIS 更新包签名，
// 并生成 latest.json（version + signature + url）随 Release 发布；
// 前端 check() 拉取 endpoint（releases/latest/download/latest.json），
// 语义化版本高于本机即提示更新；downloadAndInstall 走 passive 安装模式，
// 完成后调用 process 插件 relaunch 重启到新版。
//
// 开发版与浏览器形态没有分发渠道，直接跳过；检查失败一律静默，不打扰创作。

import { isTauri } from './localApi';

export interface AppUpdateInfo {
  version: string;
  notes?: string;
  /** 下载并安装，完成后自动重启应用 */
  install: () => Promise<void>;
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri() || import.meta.env.DEV) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update?.available) return null;
    return {
      version: update.version,
      notes: update.body,
      install: async () => {
        await update.downloadAndInstall();
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('plugin:process|relaunch');
      },
    };
  } catch (e) {
    console.warn('[appUpdater] 检查更新失败（静默忽略）:', e);
    return null;
  }
}