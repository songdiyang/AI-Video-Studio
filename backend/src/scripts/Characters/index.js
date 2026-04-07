const express = require('express');
const router = express.Router();

// 导入所有端点处理器
const getAll = require('./getAll');
const getByProject = require('./getByProject');
const batchSave = require('./batchSave');
const getById = require('./getById');
const create = require('./create');
const update = require('./update');
const deleteCharacter = require('./delete');
const generateViews = require('./generateViews');
const uploadImage = require('./uploadImage');
const tagGroups = require('./tagGroups');
const states = require('./states');
const voiceConfig = require('./voiceConfig');
const costumes = require('./costumes');

// 注册路由（顺序很重要！具体路由在前，通用路由在后）
tagGroups(router);  // 标签分组路由优先（/tag-groups）
getAll(router);
getByProject(router);
batchSave(router);
generateViews(router);
uploadImage(router);   // 角色图片上传路由（/:id/upload-image）
states(router);  // 角色状态路由（/:id/states）
voiceConfig(router);  // 角色声音配置路由（/:id/voice）
costumes(router);  // 角色服装关联路由（/:id/costumes）
create(router);
update(router);
deleteCharacter(router);
getById(router);  // 必须放在最后，因为 /:id 会匹配所有路径

module.exports = router;
