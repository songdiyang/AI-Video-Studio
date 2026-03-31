const express = require('express');
const { authMiddleware } = require('../../middleware');
const router = express.Router();

// 导入所有端点处理器
const getTemplates = require('./getTemplates');
const autoGenerate = require('./autoGenerate');
const autoGenerateByScene = require('./autoGenerateByScene');
const getByScriptId = require('./getByScriptId');
const saveManual = require('./saveManual');
const batchGenerateFrames = require('./batchGenerateFrames');
const batchGenerateVideos = require('./batchGenerateVideos');

// 新增：独立模式处理器
const parallelGenerateFrames = require('./parallelGenerateFrames');
const linkStoryboard = require('./linkStoryboard');

// 单个分镜操作处理器
const addStoryboard = require('./addStoryboard');
const deleteStoryboard = require('./deleteStoryboard');
const reorderStoryboards = require('./reorderStoryboards');
const validateReadiness = require('./validateReadiness');
const batchValidateReadiness = require('./batchValidateReadiness');
const updateMedia = require('./updateMedia');
const updateContent = require('./updateContent');
const cleanBeforeRegenerate = require('./cleanBeforeRegenerate');
const fixLinks = require('./fixLinks');
const updateDirectorParams = require('./updateDirectorParams');
const sketchRoutes = require('./sketch');
const lockRoutes = require('./lockStoryboard');
const shotLanguageRoutes = require('./shotLanguage');
const frameHistoryRoutes = require('./frameHistory');  // 帧历史版本管理

// 注册路由（顺序很重要！具体路由在前，通用路由在后）

// 单个分镜操作（必须在 /:scriptId 之前）
router.post('/batch-validate', authMiddleware, batchValidateReadiness);
router.post('/clean-before-regenerate', authMiddleware, cleanBeforeRegenerate);
router.post('/fix-links', authMiddleware, fixLinks);  // 修复资源关联
router.post('/add', authMiddleware, addStoryboard);
router.delete('/scene/:storyboardId', authMiddleware, deleteStoryboard);
router.patch('/reorder', authMiddleware, reorderStoryboards);
router.get('/:storyboardId/validate', authMiddleware, validateReadiness);
router.patch('/:storyboardId/media', authMiddleware, updateMedia);
router.patch('/:storyboardId/content', authMiddleware, updateContent);
updateDirectorParams(router);  // 导演参数更新
sketchRoutes(router);          // 草图上传与管理
lockRoutes(router);            // 分镜锁定/解锁
shotLanguageRoutes(router);    // 镜头语言参数管理
frameHistoryRoutes(router);    // 帧历史版本管理

getTemplates(router);
autoGenerate(router);
autoGenerateByScene(router);  // 按场景分割的分镜生成
batchGenerateFrames(router);
batchGenerateVideos(router);
parallelGenerateFrames(router);  // 并发帧生成（独立模式）
linkStoryboard(router);          // 单分镜独立关联
saveManual(router);
getByScriptId(router);  // 必须放在最后，因为 /:scriptId 会匹配所有路径

module.exports = router;
