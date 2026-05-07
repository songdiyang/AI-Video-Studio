/**
 * ExtensionInstaller - ZIP 扩展包安装器
 * 解压 ZIP，验证 manifest，存入 IndexedDB
 */

import JSZip from 'jszip';
import { installExtension, ExtensionFile } from './extensionStorage';

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
 * 从 File 对象安装扩展（ZIP 文件）
 */
export async function installFromZip(file: File): Promise<InstallResult> {
  try {
    const zip = await JSZip.loadAsync(file);

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

    if (!manifest.name) {
      return { success: false, name: '', message: 'manifest.json 缺少 name 字段' };
    }
    if (!manifest.version) {
      return { success: false, name: '', message: 'manifest.json 缺少 version 字段' };
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
      message: `扩展「${manifest.display_name || manifest.name}」安装成功`,
    };
  } catch (error: any) {
    return { success: false, name: '', message: error.message || '安装失败' };
  }
}

/**
 * 从 URL 下载并安装扩展
 */
export async function installFromUrl(url: string): Promise<InstallResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, name: '', message: `下载失败: HTTP ${res.status}` };
    }
    const blob = await res.blob();
    const file = new File([blob], 'extension.zip', { type: 'application/zip' });
    return installFromZip(file);
  } catch (error: any) {
    return { success: false, name: '', message: error.message || '下载安装失败' };
  }
}
