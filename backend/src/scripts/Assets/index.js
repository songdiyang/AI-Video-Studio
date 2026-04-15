/**
 * 资产相关路由
 */
const express = require('express');
const router = express.Router();

// 导入参考图路由
const referenceImages = require('./referenceImages');
const fileUpload = require('./fileUpload');

// 注册路由
referenceImages(router);
fileUpload(router);

module.exports = router;
