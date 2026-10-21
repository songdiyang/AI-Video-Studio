// 附件缓存服务 - 使用 IndexedDB 存储对话附件
//
// 功能：
// - 保存对话中的图片、视频等附件到本地 IndexedDB
// - 支持按对话 ID 管理附件
// - 对话删除时自动清理附件
// - 定期清理过期附件

import Dexie from 'dexie';

// ==================== 类型定义 ====================

export interface CachedAttachment {
  id: string;                    // 附件唯一 ID
  conversationId: string;        // 所属对话 ID
  name: string;                  // 文件名
  type: 'image' | 'video' | 'file'; // 附件类型
  blob: Blob;                    // 文件内容
  size: number;                  // 文件大小（字节）
  mimeType: string;              // MIME 类型
  uploadedAt: number;            // 上传时间戳
  lastAccessedAt: number;        // 最后访问时间戳
}

export interface AttachmentMetadata {
  id: string;
  conversationId: string;
  name: string;
  type: 'image' | 'video' | 'file';
  size: number;
  mimeType: string;
  uploadedAt: number;
  lastAccessedAt: number;
}

// ==================== 数据库定义 ====================

class AttachmentCacheDB extends Dexie {
  attachments!: Dexie.Table<CachedAttachment, string>;

  constructor() {
    super('AIAssistantAttachmentCache');
    
    // 定义数据库结构
    this.version(1).stores({
      attachments: 'id, conversationId, uploadedAt, lastAccessedAt, type',
    });
  }
}

const db = new AttachmentCacheDB();

// ==================== 核心功能 ====================

/**
 * 保存附件到缓存
 * @param file 文件对象
 * @param conversationId 对话 ID
 * @returns 附件 ID
 */
export async function saveAttachmentToCache(
  file: File,
  conversationId: string
): Promise<string> {
  const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const attachment: CachedAttachment = {
    id: fileId,
    conversationId,
    name: file.name,
    type: file.type.startsWith('image/') ? 'image' : 
          file.type.startsWith('video/') ? 'video' : 'file',
    blob: file,
    size: file.size,
    mimeType: file.type,
    uploadedAt: Date.now(),
    lastAccessedAt: Date.now(),
  };

  try {
    await db.attachments.add(attachment);
    console.log('[AttachmentCache] 附件已保存:', fileId, file.name);
    return fileId;
  } catch (error) {
    console.error('[AttachmentCache] 保存附件失败:', error);
    throw new Error('保存附件到本地缓存失败');
  }
}

/**
 * 从缓存获取附件
 * @param fileId 附件 ID
 * @returns 附件 Blob
 */
export async function getAttachmentFromCache(fileId: string): Promise<Blob | null> {
  try {
    const attachment = await db.attachments.get(fileId);
    
    if (!attachment) {
      console.warn('[AttachmentCache] 附件不存在:', fileId);
      return null;
    }

    // 更新最后访问时间
    await db.attachments.update(fileId, {
      lastAccessedAt: Date.now(),
    });

    return attachment.blob;
  } catch (error) {
    console.error('[AttachmentCache] 获取附件失败:', error);
    return null;
  }
}

/**
 * 获取附件元数据（不包含 Blob）
 * @param fileId 附件 ID
 * @returns 附件元数据
 */
export async function getAttachmentMetadata(fileId: string): Promise<AttachmentMetadata | null> {
  try {
    const attachment = await db.attachments.get(fileId);
    
    if (!attachment) return null;

    // 返回元数据（不包含 Blob）
    const { blob, ...metadata } = attachment;
    return metadata;
  } catch (error) {
    console.error('[AttachmentCache] 获取附件元数据失败:', error);
    return null;
  }
}

/**
 * 获取对话的所有附件
 * @param conversationId 对话 ID
 * @returns 附件列表
 */
export async function getConversationAttachments(
  conversationId: string
): Promise<AttachmentMetadata[]> {
  try {
    const attachments = await db.attachments
      .where('conversationId')
      .equals(conversationId)
      .toArray();

    // 返回元数据（不包含 Blob）
    return attachments.map(({ blob, ...metadata }) => metadata);
  } catch (error) {
    console.error('[AttachmentCache] 获取对话附件失败:', error);
    return [];
  }
}

/**
 * 删除对话的所有附件
 * @param conversationId 对话 ID
 */
export async function deleteConversationAttachments(conversationId: string): Promise<void> {
  try {
    const count = await db.attachments
      .where('conversationId')
      .equals(conversationId)
      .delete();
    
    console.log('[AttachmentCache] 已删除对话附件:', conversationId, `(${count} 个文件)`);
  } catch (error) {
    console.error('[AttachmentCache] 删除对话附件失败:', error);
    throw new Error('删除对话附件失败');
  }
}

/**
 * 删除单个附件
 * @param fileId 附件 ID
 */
export async function deleteAttachment(fileId: string): Promise<void> {
  try {
    await db.attachments.delete(fileId);
    console.log('[AttachmentCache] 附件已删除:', fileId);
  } catch (error) {
    console.error('[AttachmentCache] 删除附件失败:', error);
    throw new Error('删除附件失败');
  }
}

/**
 * 清理过期附件
 * @param daysOld 过期天数（默认 7 天）
 * @returns 清理的文件数量
 */
export async function cleanupOldAttachments(daysOld = 7): Promise<number> {
  try {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    const count = await db.attachments
      .where('lastAccessedAt')
      .below(cutoff)
      .delete();
    
    console.log('[AttachmentCache] 已清理过期附件:', count, '个文件');
    return count;
  } catch (error) {
    console.error('[AttachmentCache] 清理过期附件失败:', error);
    return 0;
  }
}

/**
 * 获取缓存统计信息
 * @returns 统计信息
 */
export async function getCacheStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  oldestFile: number | null;
  newestFile: number | null;
}> {
  try {
    const attachments = await db.attachments.toArray();
    
    if (attachments.length === 0) {
      return {
        totalFiles: 0,
        totalSize: 0,
        oldestFile: null,
        newestFile: null,
      };
    }

    const totalSize = attachments.reduce((sum, att) => sum + att.size, 0);
    const timestamps = attachments.map(att => att.uploadedAt);
    
    return {
      totalFiles: attachments.length,
      totalSize,
      oldestFile: Math.min(...timestamps),
      newestFile: Math.max(...timestamps),
    };
  } catch (error) {
    console.error('[AttachmentCache] 获取统计信息失败:', error);
    return {
      totalFiles: 0,
      totalSize: 0,
      oldestFile: null,
      newestFile: null,
    };
  }
}

/**
 * 清空所有缓存
 */
export async function clearAllCache(): Promise<void> {
  try {
    await db.attachments.clear();
    console.log('[AttachmentCache] 已清空所有缓存');
  } catch (error) {
    console.error('[AttachmentCache] 清空缓存失败:', error);
    throw new Error('清空缓存失败');
  }
}

/**
 * 将缓存的附件转换为 Base64
 * @param fileId 附件 ID
 * @returns Base64 字符串
 */
export async function getAttachmentAsBase64(fileId: string): Promise<string | null> {
  try {
    const blob = await getAttachmentFromCache(fileId);
    if (!blob) return null;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[AttachmentCache] 转换 Base64 失败:', error);
    return null;
  }
}

/**
 * 将缓存的附件转换为 Object URL
 * @param fileId 附件 ID
 * @returns Object URL
 */
export async function getAttachmentAsObjectUrl(fileId: string): Promise<string | null> {
  try {
    const blob = await getAttachmentFromCache(fileId);
    if (!blob) return null;

    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('[AttachmentCache] 创建 Object URL 失败:', error);
    return null;
  }
}

// ==================== 初始化和定期清理 ====================

/**
 * 初始化缓存服务
 * - 启动时清理过期附件
 */
export async function initAttachmentCache(): Promise<void> {
  try {
    console.log('[AttachmentCache] 初始化附件缓存服务...');
    
    // 清理 7 天前的附件
    const cleaned = await cleanupOldAttachments(7);
    if (cleaned > 0) {
      console.log('[AttachmentCache] 启动时清理了', cleaned, '个过期附件');
    }
    
    // 获取统计信息
    const stats = await getCacheStats();
    console.log('[AttachmentCache] 缓存统计:', {
      文件数: stats.totalFiles,
      总大小: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
    });
  } catch (error) {
    console.error('[AttachmentCache] 初始化失败:', error);
  }
}

// 自动初始化
if (typeof window !== 'undefined') {
  initAttachmentCache().catch(console.error);
}

