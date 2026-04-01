const path = require('path');
const fs = require('fs');

const handlerCache = {};

function getBillingHandler(handlerName) {
  if (!handlerName) return null;

  // 清理 handler 名称（去除前后空格）
  const cleanedName = String(handlerName).trim();
  
  if (!cleanedName) return null;

  if (cleanedName.includes('..') || cleanedName.includes('/') || cleanedName.includes('\\')) {
    console.error(`[BillingHandler] 非法 handler 名称: ${cleanedName}`);
    return null;
  }

  if (handlerCache[cleanedName]) {
    return handlerCache[cleanedName];
  }

  const handlerPath = path.join(__dirname, `${cleanedName}.js`);
  console.log(`[BillingHandler] 尝试加载 handler: "${cleanedName}", 路径: ${handlerPath}`);
  
  if (!fs.existsSync(handlerPath)) {
    console.error(`[BillingHandler] handler 文件不存在: ${handlerPath}`);
    // 列出当前目录下的所有文件帮助调试
    try {
      const files = fs.readdirSync(__dirname);
      console.log(`[BillingHandler] 目录 ${__dirname} 下的文件:`, files);
    } catch (e) {
      console.error(`[BillingHandler] 无法读取目录: ${e.message}`);
    }
    return null;
  }

  try {
    const handler = require(handlerPath);
    handlerCache[cleanedName] = handler;
    console.log(`[BillingHandler] 已加载 handler: ${cleanedName}`);
    return handler;
  } catch (error) {
    console.error(`[BillingHandler] 加载 handler "${cleanedName}" 失败:`, error.message);
    return null;
  }
}

// 预加载常用的 billing handlers
function preloadHandlers() {
  const commonHandlers = ['volcengine']; // 添加其他常用 handler
  
  for (const name of commonHandlers) {
    const handlerPath = path.join(__dirname, `${name}.js`);
    if (fs.existsSync(handlerPath)) {
      try {
        const handler = require(handlerPath);
        handlerCache[name] = handler;
        console.log(`[BillingHandler] 预加载 handler: ${name}`);
      } catch (error) {
        console.error(`[BillingHandler] 预加载 handler "${name}" 失败:`, error.message);
      }
    }
  }
}

// 服务启动时预加载
preloadHandlers();

module.exports = {
  getBillingHandler
};
