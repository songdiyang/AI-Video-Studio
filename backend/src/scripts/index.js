/**
 * Scripts API 路由集成
 * 所有剧本相关的 API 端点
 */

const express = require('express');
const { authMiddleware } = require('../middleware');

// 导入所有端点处理函数
const getModels = require('./Noraml/getModels');
const generateScript = require('./ScriptStudio/generateScript');
const saveFromWorkflow = require('./ScriptStudio/saveFromWorkflow');
const getProjectScripts = require('./ScriptStudio/getProjectScripts');
const getEpisodesRecap = require('./ScriptStudio/getEpisodesRecap');
const getEpisode = require('./ScriptStudio/getEpisode');
const getAllScripts = require('./ScriptStudio/getAllScripts');
const updateScript = require('./ScriptStudio/updateScript');
const deleteScript = require('./ScriptStudio/deleteScript');
const createScript = require('./ScriptStudio/createScript');
const deleteEpisode = require('./ScriptStudio/deleteEpisode');
const updateScriptStatus = require('./ScriptStudio/updateScriptStatus');
const cleanOrphanResources = require('./ScriptStudio/cleanOrphanResources');
const { createOrUpdateDraft, saveDraftContent, deleteDraft } = require('./ScriptStudio/draftScript');
const getScriptLibrary = require('./ScriptStudio/getScriptLibrary');
const bindScriptToProject = require('./ScriptStudio/bindScriptToProject');
const uploadScript = require('./ScriptStudio/uploadScript');
const analyzeScript = require('./ScriptStudio/analyzeScript');
const optimizeScript = require('./ScriptStudio/optimizeScript');

const router = express.Router();

// ============================================================
// 路由定义
// ============================================================

// 获取可用模型
router.get('/models', getModels);

// 手动创建剧本
router.post('/create', authMiddleware, createScript);

// 生成剧本
router.post('/generate', authMiddleware, generateScript);

// 保存工作流结果
router.post('/save-from-workflow', authMiddleware, saveFromWorkflow);

// 获取项目的所有剧本
router.get('/project/:projectId', authMiddleware, getProjectScripts);

// 获取前情回顾数据
router.get('/project/:projectId/recap', authMiddleware, getEpisodesRecap);

// 获取指定集的剧本
router.get('/project/:projectId/episode/:episodeNumber', authMiddleware, getEpisode);

// 草稿相关
router.post('/draft', authMiddleware, createOrUpdateDraft);
router.put('/draft/:scriptId', authMiddleware, saveDraftContent);
router.delete('/draft/:scriptId', authMiddleware, deleteDraft);

// 清理孤立资源（角色/场景）
router.post('/clean-orphans', authMiddleware, cleanOrphanResources);

// ─── 剧本资源库（用户级）──────────────────────────────────────────
// 获取当前用户的剧本库（个人剧本 + 所有项目剧本）
router.get('/library', authMiddleware, getScriptLibrary);

// 将个人剧本深拷贝绑定到目标项目（产生副本，原始不受影响）
router.post('/bind', authMiddleware, bindScriptToProject);

// 获取所有剧本（旧接口）
router.get('/', authMiddleware, getAllScripts);

// 更新剧本
router.put('/:id', authMiddleware, updateScript);

// 更新剧本状态（回滚 generating → draft）
router.patch('/:id/status', authMiddleware, updateScriptStatus);

// 删除某集（分镜+剧本+查孤立资源）
router.delete('/:id/episode', authMiddleware, deleteEpisode);

// 删除剧本（旧接口，仅删剧本记录）
router.delete('/:id', authMiddleware, deleteScript);

// ─── 剧本上传与分析优化 ───────────────────────────────────────────
// 上传剧本文件（.txt / .md）或直传文本内容
router.post('/upload', authMiddleware, uploadScript.middleware, uploadScript);

// AI分析剧本
router.post('/analyze', authMiddleware, analyzeScript);

// AI优化剧本
router.post('/optimize', authMiddleware, optimizeScript);

module.exports = router;
