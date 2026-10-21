# 附件本地缓存功能

## 功能概述

本项目实现了附件本地缓存功能，将对话中的图片、视频等附件保存到 IndexedDB，并与对话关联。当对话删除时，相关附件会自动清理。

## 核心特性

### 1. **本地缓存**
- ✅ 附件保存到 IndexedDB
- ✅ 支持图片、视频、文件
- ✅ 自动关联到对话 ID

### 2. **自动清理**
- ✅ 对话删除时清理附件
- ✅ 定期清理过期附件（7 天）
- ✅ 启动时自动清理

### 3. **性能优化**
- ✅ 避免重复上传
- ✅ 支持离线查看
- ✅ 快速加载历史附件

### 4. **隐私保护**
- ✅ 数据存储在本地
- ✅ 不上传到第三方服务器
- ✅ 用户完全控制

## 技术实现

### 数据库结构

```typescript
interface CachedAttachment {
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
```

### 工作流程

```
用户上传图片
    ↓
保存到 IndexedDB（关联对话 ID）
    ↓
智能选择传输方式（Base64 / 文件上传）
    ↓
发送给 AI
    ↓
对话删除时 → 自动清理附件
```

## API 参考

### saveAttachmentToCache

保存附件到缓存。

**参数：**
- `file: File` - 文件对象
- `conversationId: string` - 对话 ID

**返回：**
- `Promise<string>` - 附件 ID

**示例：**
```typescript
import { saveAttachmentToCache } from './services/attachmentCache';

const fileId = await saveAttachmentToCache(file, conversationId);
console.log('附件已缓存:', fileId);
```

### getAttachmentFromCache

从缓存获取附件。

**参数：**
- `fileId: string` - 附件 ID

**返回：**
- `Promise<Blob | null>` - 附件 Blob

**示例：**
```typescript
import { getAttachmentFromCache } from './services/attachmentCache';

const blob = await getAttachmentFromCache(fileId);
if (blob) {
  const url = URL.createObjectURL(blob);
  // 使用 url
}
```

### deleteConversationAttachments

删除对话的所有附件。

**参数：**
- `conversationId: string` - 对话 ID

**示例：**
```typescript
import { deleteConversationAttachments } from './services/attachmentCache';

await deleteConversationAttachments(conversationId);
console.log('对话附件已清理');
```

### cleanupOldAttachments

清理过期附件。

**参数：**
- `daysOld: number` - 过期天数（默认 7 天）

**返回：**
- `Promise<number>` - 清理的文件数量

**示例：**
```typescript
import { cleanupOldAttachments } from './services/attachmentCache';

const cleaned = await cleanupOldAttachments(7);
console.log('清理了', cleaned, '个过期附件');
```

### getCacheStats

获取缓存统计信息。

**返回：**
- `Promise<CacheStats>` - 统计信息

**示例：**
```typescript
import { getCacheStats } from './services/attachmentCache';

const stats = await getCacheStats();
console.log('缓存统计:', {
  文件数: stats.totalFiles,
  总大小: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
});
```

## 使用场景

### 1. 图片上传

```typescript
// 保存到缓存
const cachedFileId = await saveAttachmentToCache(file, conversationId);

// 从缓存读取并转换为 Base64
const base64 = await getAttachmentAsBase64(cachedFileId);

// 发送给 AI
await sendToAI(base64);
```

### 2. 对话删除

```typescript
// 删除对话时自动清理附件
await deleteConversationAttachments(conversationId);
```

### 3. 定期清理

```typescript
// 应用启动时清理过期附件
useEffect(() => {
  const cleanup = async () => {
    await cleanupOldAttachments(7);
  };
  
  cleanup();
  const interval = setInterval(cleanup, 60 * 60 * 1000); // 每小时
  return () => clearInterval(interval);
}, []);
```

## 优势

### 1. **隐私保护**
- 数据存储在本地 IndexedDB
- 不上传到第三方服务器
- 用户完全控制数据

### 2. **性能优化**
- 避免重复上传相同文件
- 支持离线查看历史附件
- 快速加载，无需网络请求

### 3. **资源管理**
- 自动清理过期附件
- 对话删除时清理相关附件
- 避免本地存储膨胀

### 4. **用户体验**
- 快速预览历史对话中的图片
- 支持离线查看
- 可以复用已上传的文件

## 注意事项

### 存储空间

IndexedDB 有存储空间限制（通常为磁盘空间的 50%），建议：
- 定期清理过期附件
- 设置合理的过期时间（7 天）
- 监控缓存大小

### 浏览器兼容性

IndexedDB 支持所有现代浏览器：
- ✅ Chrome / Edge
- ✅ Firefox
- ✅ Safari
- ✅ Opera

### 数据持久性

IndexedDB 数据是持久的，但：
- 用户清除浏览器数据时会丢失
- 隐私模式下可能不可用
- 需要处理存储配额超限

## 故障排查

### 缓存失败

如果遇到缓存失败：
1. 检查浏览器是否支持 IndexedDB
2. 检查存储空间是否充足
3. 查看控制台错误信息

### 附件丢失

如果附件丢失：
1. 检查是否被自动清理
2. 检查对话是否被删除
3. 查看浏览器存储设置

## 更新日志

- **2024-10-18**: 初始版本，实现基本的缓存和清理功能
