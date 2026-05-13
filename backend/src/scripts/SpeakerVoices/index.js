const express = require('express');
const router = express.Router();

const listVoices = require('./listVoices');
const createVoice = require('./createVoice');
const updateVoice = require('./updateVoice');
const deleteVoice = require('./deleteVoice');
const cloneVoice = require('./cloneVoice');
const bindCharacter = require('./bindCharacter');

// 注册路由
listVoices(router);
createVoice(router);
updateVoice(router);
deleteVoice(router);
cloneVoice(router);
bindCharacter(router);

module.exports = router;
