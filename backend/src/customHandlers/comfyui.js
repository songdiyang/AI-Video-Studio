/**
 * ComfyUI 自定义 Handler
 * 
 * 功能：将草图通过 ControlNet 转换为精细图片
 * 
 * 特殊处理：
 * 1. 从环境变量读取 COMFYUI_BASE_URL
 * 2. 根据 sketch_type 选择对应的 ControlNet 工作流模板
 * 3. 构建工作流并提交到 ComfyUI /prompt 接口
 * 4. 返回 prompt_id 用于后续轮询
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 工作流模板目录

/**
 * 带重试的异步函数执行器
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} baseDelay - 基础延迟（毫秒）
 * @param {Function} shouldRetry - 判断是否应该重试的函数
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 1000, shouldRetry = () => true) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 只对网络错误和临时性故障重试，不重试业务逻辑错误
      const isRetryable = shouldRetry(err);
      if (!isRetryable || i === maxRetries - 1) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`[ComfyUI Handler] 重试 ${i + 1}/${maxRetries}，等待 ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * 判断错误是否可重试
 * @param {Error} err 
 * @returns {boolean}
 */
function isRetryableError(err) {
  // 网络连接错误
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    return true;
  }
  // 超时错误
  if (err.name === 'AbortError' || err.message?.includes('超时')) {
    return true;
  }
  // 服务器临时错误（5xx）
  if (err.message?.includes('(5') && err.message?.includes(')')) {
    return true;
  }
  // ComfyUI 队列满或繁忙
  if (err.message?.includes('queue') || err.message?.includes('busy')) {
    return true;
  }
  return false;
}
const WORKFLOW_DIR = path.join(__dirname, 'comfyui_workflows');

// sketch_type 到工作流模板的映射
const WORKFLOW_MAP = {
  'stick_figure': 'scribble_workflow.json',      // 火柴人/极简草稿
  'storyboard_sketch': 'canny_workflow.json',    // 分镜草图
  'detailed_lineart': 'lineart_workflow.json'    // 精细线稿
};

/**
 * 加载工作流模板
 * @param {string} templateName - 模板文件名
 * @returns {object} 工作流模板对象
 */
function loadWorkflowTemplate(templateName) {
  const templatePath = path.join(WORKFLOW_DIR, templateName);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`ComfyUI 工作流模板不存在: ${templateName}`);
  }
  
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(templateContent);
}

/**
 * 构建工作流（替换占位符）
 * @param {object} template - 工作流模板
 * @param {object} params - 参数对象
 * @returns {object} 构建后的工作流
 */
function buildWorkflow(template, params) {
  // 深拷贝模板
  const workflow = JSON.parse(JSON.stringify(template));
  
  // 遍历所有节点，替换占位符
  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    if (!node.inputs) continue;
    
    for (const inputKey in node.inputs) {
      const value = node.inputs[inputKey];
      
      // 只处理字符串类型的占位符
      if (typeof value !== 'string') continue;
      
      // 检查是否是占位符格式 {{placeholder}}
      const match = value.match(/^\{\{(\w+)\}\}$/);
      if (!match) continue;
      
      const placeholder = match[1];
      
      // 根据占位符名称替换值
      switch (placeholder) {
        case 'prompt':
          node.inputs[inputKey] = params.prompt || '';
          break;
        case 'negative_prompt':
          node.inputs[inputKey] = params.negative_prompt || '';
          break;
        case 'control_image':
          node.inputs[inputKey] = params.sketch_url || '';
          break;
        case 'control_strength':
          node.inputs[inputKey] = params.control_strength ?? 0.85;
          break;
        case 'width':
          node.inputs[inputKey] = params.width || 1024;
          break;
        case 'height':
          node.inputs[inputKey] = params.height || 1024;
          break;
        case 'seed':
          node.inputs[inputKey] = params.seed ?? Math.floor(Math.random() * 2 ** 32);
          break;
        case 'reference_images':
          // 参考图数组，用于 IPAdapter 等节点
          node.inputs[inputKey] = params.imageUrls || [];
          break;
        case 'checkpoint_name':
          // 模型文件名，允许通过配置指定
          node.inputs[inputKey] = params.checkpoint_name || 'sd_xl_base_1.0.safetensors';
          break;
        case 'controlnet_model':
          // ControlNet 模型文件名
          node.inputs[inputKey] = params.controlnet_model || value;
          break;
        default:
          // 尝试从 params 中查找同名参数
          if (params[placeholder] !== undefined) {
            node.inputs[inputKey] = params[placeholder];
          }
      }
    }
  }
  
  return workflow;
}

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    console.log('[ComfyUI Handler] 开始处理请求');
    console.log('[ComfyUI Handler] 原始参数:', JSON.stringify(params, null, 2));
    
    // 1. 获取 ComfyUI 基础 URL
    const baseUrl = process.env.COMFYUI_BASE_URL;
    if (!baseUrl) {
      throw new Error('ComfyUI 未配置：请设置环境变量 COMFYUI_BASE_URL');
    }
    
    // 2. 根据 sketch_type 选择工作流模板
    const sketchType = params.sketch_type || 'storyboard_sketch';
    const templateName = WORKFLOW_MAP[sketchType];
    
    if (!templateName) {
      throw new Error(`不支持的草图类型: ${sketchType}，支持的类型: ${Object.keys(WORKFLOW_MAP).join(', ')}`);
    }
    
    console.log(`[ComfyUI Handler] 草图类型: ${sketchType}，使用模板: ${templateName}`);
    
    // 3. 加载并构建工作流
    let workflow;
    try {
      const template = loadWorkflowTemplate(templateName);
      workflow = buildWorkflow(template, params);
    } catch (err) {
      console.error('[ComfyUI Handler] 工作流构建失败:', err.message);
      throw new Error(`ComfyUI 工作流构建失败: ${err.message}`);
    }
    
    console.log('[ComfyUI Handler] 工作流构建完成');
    
    // 4. 生成唯一的 client_id
    const clientId = uuidv4();
    
    // 5. 构建请求体
    const requestBody = {
      prompt: workflow,
      client_id: clientId
    };
    
    // 6. 发送请求到 ComfyUI（带重试机制）
    const promptUrl = `${baseUrl}/prompt`;
    console.log(`[ComfyUI Handler] 提交到: ${promptUrl}`);
    
    const sendRequest = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      
      let response;
      try {
        response = await fetch(promptUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeout);
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          throw new Error('ComfyUI API 请求超时（120秒）');
        }
        // 连接失败处理
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          const connError = new Error(`ComfyUI 连接失败: 无法连接到 ${baseUrl}，请检查 ComfyUI 是否已启动`);
          connError.code = err.code;
          throw connError;
        }
        throw new Error(`ComfyUI 请求失败: ${err.message}`);
      }
      
      const responseText = await response.text();
      console.log('[ComfyUI Handler] 响应状态:', response.status);
      console.log('[ComfyUI Handler] 响应内容:', responseText);
      
      // 解析响应
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        throw new Error(`ComfyUI API 返回非 JSON: ${responseText.substring(0, 300)}`);
      }
      
      // 错误处理
      if (!response.ok) {
        const errorMsg = data.error || data.message || JSON.stringify(data);
        const httpError = new Error(`ComfyUI API 错误 (${response.status}): ${errorMsg}`);
        httpError.status = response.status;
        throw httpError;
      }
      
      // ComfyUI 可能返回节点验证错误
      if (data.error) {
        throw new Error(`ComfyUI 工作流错误: ${JSON.stringify(data.error)}`);
      }
      
      return data;
    };
    
    // 使用重试机制执行请求
    const data = await withRetry(sendRequest, 3, 1000, isRetryableError);
    
    // 9. 返回 prompt_id
    if (!data.prompt_id) {
      throw new Error('ComfyUI 响应缺少 prompt_id');
    }
    
    console.log(`[ComfyUI Handler] 任务提交成功，prompt_id: ${data.prompt_id}`);
    
    return {
      prompt_id: data.prompt_id,
      client_id: clientId,
      number: data.number // 队列位置
    };
  }
};
