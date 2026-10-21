# DeepSeek 文件上传功能

## 功能说明

本项目已集成 DeepSeek 文件上传 API，支持将大图片直接上传到 DeepSeek 服务器，避免 Base64 编码导致的体积膨胀问题。

## 工作原理

### 智能选择策略

系统会根据文件大小自动选择传输方式：

- **小文件（< 5MB）**：使用 Base64 编码
  - 优点：简单快速，无需额外请求
  - 缺点：体积增大 33%

- **大文件（> 5MB）**：使用文件上传 API
  - 优点：不增加请求体积，性能更好
  - 缺点：需要两次请求（上传 + 对话）

### 支持的提供商

目前支持文件上传的提供商：
- ✅ DeepSeek
- ✅ 豆包（字节跳动）

其他提供商暂不支持，会自动回退到 Base64 编码。

## 使用方法

### 1. 上传图片

用户上传图片时，系统会自动判断：

```typescript
// 自动选择传输方式
if (shouldUseFileUpload(file, modelConfig)) {
  // 大文件：上传到 DeepSeek 服务器
  const fileId = await uploadFileToAI(file, modelConfig);
  // 使用 file:// 前缀标识
  attachment.url = `file://${fileId}`;
} else {
  // 小文件：使用 Base64
  attachment.url = await fileToBase64(file);
}
```

### 2. 发送对话

系统会自动识别 `file://` 前缀，并正确引用文件 ID：

```typescript
// 自动处理 file_id 引用
if (att.url.startsWith('file://')) {
  const fileId = att.url.replace('file://', '');
  contentParts.push({ 
    type: 'image_url', 
    image_url: { url: `file://${fileId}` } 
  });
}
```

## API 参考

### uploadFileToAI

上传文件到 AI 服务。

**参数：**
- `file: File` - 文件对象
- `model: OfflineModel` - 模型配置

**返回：**
- `Promise<string>` - file_id

**示例：**
```typescript
import { uploadFileToAI } from './services/localAI';

const fileId = await uploadFileToAI(file, modelConfig);
console.log('文件 ID:', fileId);
```

### shouldUseFileUpload

判断是否应该使用文件上传 API。

**参数：**
- `file: File` - 文件对象
- `model: OfflineModel` - 模型配置

**返回：**
- `boolean` - 是否使用文件上传

**示例：**
```typescript
import { shouldUseFileUpload } from './services/localAI';

if (shouldUseFileUpload(file, modelConfig)) {
  console.log('使用文件上传 API');
} else {
  console.log('使用 Base64 编码');
}
```

## 注意事项

### 文件过期

DeepSeek 服务器上的文件有过期时间（通常 24 小时），过期后无法使用。建议：
- 及时使用上传的文件
- 不要长期依赖 file_id

### 隐私考虑

文件上传到 DeepSeek 服务器后：
- 会临时存储在第三方服务器
- 有过期时间，自动删除
- 需要遵守 DeepSeek 的使用条款

如果对隐私有较高要求，建议：
- 使用 Base64 编码（不存储在服务器）
- 或者使用本地 AI 模型

### 文件大小限制

- Base64：建议 < 5MB
- 文件上传：无明确限制，但建议 < 100MB

## 故障排查

### 上传失败

如果遇到上传失败：
1. 检查 API Key 是否正确
2. 检查网络连接
3. 检查文件格式是否支持（JPEG、PNG、GIF、WebP）
4. 查看控制台错误信息

### 文件无法识别

如果 AI 无法识别文件：
1. 检查 file_id 是否正确
2. 检查文件是否已过期
3. 确认模型支持多模态输入

## 更新日志

- **2024-10-18**: 初始版本，支持 DeepSeek 和豆包文件上传
