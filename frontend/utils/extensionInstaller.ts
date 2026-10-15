/**
 * ExtensionInstaller - 扩展包安装器
 * 支持 ZIP 和 AOM 格式，解压后验证 manifest，存入 IndexedDB
 */

import JSZip from 'jszip';
import { installExtension, ExtensionFile } from './extensionStorage';
import {
  extractAOMPayload,
  readFileAsArrayBuffer,
  validateManifest,
  checkAppVersionCompatibility,
  getAppVersion,
  AOMManifest,
} from './aomFormat';

export interface InstallResult {
  success: boolean;
  name: string;
  message: string;
}

function detectFileType(path: string): ExtensionFile['type'] {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'js' || ext === 'mjs') return 'js';
  if (ext === 'css') return 'css';
  if (ext === 'json') return 'json';
  return 'other';
}

/**
 * 从 File 对象安装扩展（支持 ZIP 和 AOM 格式）
 */
export async function installFromZip(file: File): Promise<InstallResult> {
  try {
    // 读取文件内容，如果是 AOM 格式则提取 ZIP payload
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zipBuffer = extractAOMPayload(arrayBuffer);

    // 如果提取后与原文件不同，说明是 AOM 格式
    const isAOM = zipBuffer !== arrayBuffer;

    const zip = await JSZip.loadAsync(zipBuffer);

    // 查找 manifest.json（可能在根目录或第一层子目录）
    let manifestFile: JSZip.JSZipObject | null = null;
    let manifestPath = '';

    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.endsWith('manifest.json') && !manifestFile) {
        manifestFile = zipEntry;
        manifestPath = relativePath;
      }
    });

    if (!manifestFile) {
      return { success: false, name: '', message: 'ZIP 中未找到 manifest.json' };
    }

    const manifestContent = await manifestFile.async('string');
    let manifest: Record<string, any>;
    try {
      manifest = JSON.parse(manifestContent);
    } catch {
      return { success: false, name: '', message: 'manifest.json 解析失败' };
    }

    // 验证 manifest 格式规范
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return {
        success: false,
        name: manifest.name || '',
        message: `manifest 验证失败: ${validation.errors.join('; ')}`,
      };
    }

    // 检查应用版本兼容性
    const appVersion = getAppVersion();
    if (!checkAppVersionCompatibility(manifest.min_app_version, appVersion)) {
      return {
        success: false,
        name: manifest.name,
        message: `应用版本不兼容: 需要 ≥ ${manifest.min_app_version}, 当前 ${appVersion}`,
      };
    }

    // 确定扩展根目录（manifest.json 所在目录）
    const rootDir = manifestPath.replace(/manifest\.json$/, '');

    // 解压所有文件
    const files: ExtensionFile[] = [];
    const promises: Promise<void>[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      // 只处理 manifest 所在目录下的文件
      if (!relativePath.startsWith(rootDir)) return;

      const pathInExt = relativePath.slice(rootDir.length);
      if (!pathInExt) return;

      const promise = zipEntry.async('string').then(content => {
        files.push({
          path: pathInExt,
          content,
          type: detectFileType(pathInExt),
        });
      });
      promises.push(promise);
    });

    await Promise.all(promises);

    await installExtension(manifest, files);

    return {
      success: true,
      name: manifest.name,
      message: `扩展「${manifest.display_name || manifest.name}」安装成功${isAOM ? ' (AOM 格式)' : ''}`,
    };
  } catch (error: any) {
    return { success: false, name: '', message: error.message || '安装失败' };
  }
}

/**
 * 从 URL 下载并安装扩展（带超时控制）
 */
export async function installFromUrl(url: string, timeoutMs = 30000): Promise<InstallResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, name: '', message: `下载失败: HTTP ${res.status}` };
    }

    const contentLength = res.headers.get('content-length');
    const maxSize = 50 * 1024 * 1024; // 50MB 上限
    if (contentLength && parseInt(contentLength) > maxSize) {
      return { success: false, name: '', message: '扩展包超过 50MB 上限' };
    }

    const blob = await res.blob();
    if (blob.size > maxSize) {
      return { success: false, name: '', message: '扩展包超过 50MB 上限' };
    }

    const file = new File([blob], 'extension.aom', { type: 'application/octet-stream' });
    return installFromZip(file);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, name: '', message: `下载超时（${timeoutMs / 1000}秒），请检查网络后重试` };
    }
    return { success: false, name: '', message: error.message || '下载安装失败' };
  }
}
