/**
 * 独立草图项目路由入口
 * 
 * 提供独立于分镜的草图项目管理功能
 */
const express = require('express');
const { authMiddleware } = require('../../middleware');

const router = express.Router();

// 注册草图项目 API 路由
require('./sketchProjectsApi')(router);

module.exports = router;
