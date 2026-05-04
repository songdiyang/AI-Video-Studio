# video_prompt 修复验证报告

## 修复内容

### 修改的文件
- `/var/www/nanostory/backend/src/nosyntask/tasks/StoryBoard/sceneVideoGeneration.js`

### 修改位置
第 83-84 行

### 修改内容
```javascript
// 修改前
const description = storyboard.prompt_template || '';

// 修改后（第一版：向后兼容）
// 优先使用用户编辑的视频提示词,其次使用图片提示词作为基础
const description = storyboard.video_prompt || storyboard.prompt_template || '';

// 修改后（最终版：强制要求）
// 强制要求视频提示词，不再向后兼容降级到图片提示词
if (!storyboard.video_prompt) {
  throw new Error('分镜缺少视频提示词，请在导演空间的"视频提示词"标签中编辑后再生成视频');
}
const description = storyboard.video_prompt;
```

### 增强日志
第 88 行增加了 `useVideoPrompt` 追踪字段：
```javascript
trace('查询分镜数据', { 
  storyboardId, idx: storyboard.idx, hasAction, location: variables.location, 
  hasFirstFrame: !!firstFrameUrl, hasLastFrame: !!lastFrameUrl, 
  effectiveStartFrame: !!effectiveStartFrame, 
  useVideoPrompt: !!storyboard.video_prompt  // ← 新增
});
```

## 部署状态

✅ **后端服务已重启**
- PM2 进程管理器重启成功
- 运行环境: production
- 服务地址: http://localhost:4000
- 重启时间: 2026/5/4 22:43:57

✅ **前端已编译**
- 编译完成时间: 41.44s
- 生产环境构建成功

## 验证方法

### 1. 前端操作
1. 进入分镜工作区
2. 选择任意分镜
3. 在"导演空间"中切换到"视频提示词"标签
4. 编辑视频专用提示词（描述动态过程、运镜、口型同步等）
5. 点击"保存"按钮
6. 点击"重新生成视频"

### 2. 后端日志验证

#### 情况A：缺少视频提示词（新增校验）
查看后端日志，应该能看到错误信息：
```
Error: 分镜缺少视频提示词，请在导演空间的"视频提示词"标签中编辑后再生成视频
```
前端会收到 500 错误，并显示该错误提示。

#### 情况B：有视频提示词
查看后端日志，应该能看到：
```javascript
trace('查询分镜数据', { ..., useVideoPrompt: true });
console.log('[SceneVideoGen] 视频提示词: ...'); // 显示优化后的视频提示词
```

### 3. 数据库验证
```sql
-- 查看分镜的视频提示词字段
SELECT 
  id, 
  idx,
  prompt_template,
  video_prompt,
  first_frame_prompt,
  last_frame_prompt
FROM storyboards 
WHERE id = <分镜ID>;

-- 应该看到 video_prompt 字段有值（如果用户编辑过）
```

## 功能说明

### 强制要求策略
- **必须提供** `storyboard.video_prompt`（用户编辑的视频提示词）
- **如果不提供**：抛出错误，阻止视频生成，提示用户去编辑视频提示词
- **错误信息**：`分镜缺少视频提示词，请在导演空间的"视频提示词"标签中编辑后再生成视频`

### 适用场景
- ✅ 单个视频生成
- ✅ 批量视频生成
- ✅ 并发视频生成

### AI 优化逻辑
即使提供了 `video_prompt`，如果配置了 `textModel`，AI 仍然会对其进行优化：
- 添加运镜指令
- 添加运动分解
- 添加口型同步要求
- 添加持续性效果描述
- 转换为视频专用格式

## 测试检查清单

- [ ] 用户可以编辑视频提示词
- [ ] 视频提示词可以正确保存
- [ ] 未编辑视频提示词时，生成视频会报错并提示用户
- [ ] 错误信息清晰明确，指导用户如何操作
- [ ] 编辑视频提示词后，生成视频成功
- [ ] 日志中 useVideoPrompt 始终为 true
- [ ] 批量生成也强制要求 video_prompt
- [ ] 视频生成结果符合预期

## 回滚方案

如需回滚到降级逻辑（不推荐），修改第 84-89 行：
```javascript
// 回滚到向后兼容逻辑
const description = storyboard.video_prompt || storyboard.prompt_template || '';
```

然后重启后端：
```bash
cd /var/www/nanostory/backend
pm2 restart nanostory-backend
```

## 注意事项

1. **生产环境**: 本次修改已部署到生产环境
2. **强制校验**: 如果 video_prompt 为空，会抛出错误阻止视频生成，不会再降级到图片提示词
3. **用户体验**: 前端需要优雅处理错误提示，引导用户去编辑视频提示词
4. **AI 优化**: 用户编辑的 video_prompt 仍会经过 AI 优化，添加视频专用元素
5. **日志追踪**: useVideoPrompt 始终为 true（因为缺少时会直接报错）
6. **批量生成**: 批量生成时，缺少 video_prompt 的分镜会失败，其他分镜继续生成

## 相关文件

- 视频生成逻辑: `src/nosyntask/tasks/StoryBoard/sceneVideoGeneration.js`
- 批量视频生成: `src/nosyntask/tasks/StoryBoard/batchSceneVideoGeneration.js`
- 数据库字段: `storyboards.video_prompt`, `storyboards.video_start_prompt`, `storyboards.video_end_prompt`
- 前端组件: `views/StoryBoard/ScenePreviewPanel.tsx`（导演空间-视频提示词Tab）

---
**修复日期**: 2026/5/4  
**修复人**: AI Assistant  
**审核状态**: 待验证  
**部署状态**: 已部署 (Production)
