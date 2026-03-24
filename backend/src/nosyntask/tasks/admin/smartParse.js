/**
 * 智能解析 API 文档处理器
 * input:  { apiDoc, textModel, customPrompt }
 * output: { config (parsed JSON), tokens, rawContent }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { washForJSON } = require('../../../utils/washBody');

async function handleSmartParse(inputParams, onProgress) {
  const { apiDoc, textModel, customPrompt } = inputParams;
  const selectedModel = textModel || 'DeepSeek Chat';

  const systemInstruction = `你是 AI 模型配置工程师。你的唯一任务是：将用户提供的 API 文档转换为一个标准 JSON 配置对象。

## 背景

我们有一个统一 AI 网关系统，通过数据库表 ai_model_configs 存储各厂商 API 的调用配置。系统在运行时读取配置，将 {{占位符}} 替换为实际值后发起 HTTP 请求。对于异步接口（如图片/视频生成），系统会用查询配置轮询任务状态，通过条件表达式判断成功/失败，再用映射提取结果。

## 输出规则

1. 只输出一个合法 JSON 对象，从 { 开始到 } 结束，不要有任何其他文字、Markdown 标记、注释或思考过程。
2. 严格使用下方字段名，不要自创字段。
3. 所有密钥/Token 必须用 {{apiKey}} 占位符，绝不硬编码。
4. URL 中的占位符不加引号：?key={{apiKey}} 而非 ?key="{{apiKey}}"。

## 全部字段说明

### 基础信息
| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 模型显示名称，如 "GPT-4o"、"可灵图片生成" |
| category | 是 | string | 必须是 TEXT / IMAGE / VIDEO / AUDIO 之一 |
| provider | 是 | string | 厂商标识（英文小写），如 openai、kling、minimax |
| description | 否 | string | 模型简短描述 |

### 计费配置
| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| price_config | 是 | object/null | 统一计费 JSON。格式：{"currency":"CNY","charge_on_failure":false,"components":[{"type":"input_tokens","unit":"per_million_tokens","price":2},{"type":"output_tokens","unit":"per_million_tokens","price":8}]} |

price_config 允许的 components.type：
- input_tokens
- output_tokens
- total_tokens
- duration_seconds
- request_count
- item_count

price_config 允许的 unit：
- per_million_tokens
- per_token
- per_second
- per_request
- per_item

### 提交请求配置（调用 API 创建任务）
| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| url_template | 是 | string | API 地址，支持 {{占位符}}。如 https://api.kling.com/v1/images/generations |
| request_method | 是 | string | GET / POST / PUT / DELETE |
| headers_template | 是 | object | 请求头 JSON。如 {"Authorization": "Bearer {{apiKey}}", "Content-Type": "application/json"} |
| body_template | 否 | object | 请求体 JSON。如 {"model": "kling-v1", "prompt": "{{prompt}}"} |
| default_params | 否 | object | 默认参数，前端未传时使用。如 {"aspect_ratio": "16:9"} |
| response_mapping | 是 | object | 提交响应的字段映射，用点号路径提取值。同步模型映射最终结果，异步模型映射 taskId |

### 查询配置（仅异步模型需要，用于轮询任务状态）
同步模型（如 TEXT 类的 Chat 接口）直接返回结果，不需要以下字段。异步模型（如图片/视频生成）提交后返回 taskId，需要轮询查询接口获取结果。

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| query_url_template | 是* | string | 查询任务状态的 URL。如 https://api.kling.com/v1/images/generations/{{taskId}} |
| query_method | 是* | string | GET 或 POST |
| query_headers_template | 是* | object | 查询请求头，通常与提交请求头相同 |
| query_body_template | 否 | object | 查询请求体（POST 查询时使用） |
| query_response_mapping | 是* | object | 查询响应的基础字段映射，提取用于条件判断的原始值。如 {"status": "data.task_status"} |
| query_success_condition | 是* | string | 成功判断的 JS 表达式，变量来自 query_response_mapping 的 key。如 status == "succeed" |
| query_fail_condition | 是* | string | 失败判断的 JS 表达式。如 status == "failed" |
| query_success_mapping | 是* | object | 成功时从原始响应提取结果的映射。如 {"image_url": "data.task_result.images.0.url"} |
| query_fail_mapping | 是* | object | 失败时从原始响应提取错误信息的映射。如 {"error": "data.task_status_msg"} |

（是* = 异步模型必填，同步模型不需要）

### 计费 Handler（可选）
| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| billing_handler | 否 | string | 复杂计费解析 handler 名称，和 custom handler 分离 |
| billing_query_handler | 否 | string | 异步模型查询完成后用于解析最终 usage 的 handler 名称 |

### 占位符字典
{{apiKey}} API密钥 | {{prompt}} 提示词 | {{messages}} 消息数组 | {{model}} 模型名 | {{maxTokens}} 最大Token | {{temperature}} 温度 | {{imageUrl}} 单张图片URL(string) | {{imageUrls}} 图片URL数组(string[]) | {{startFrame}} 首帧图片URL | {{endFrame}} 尾帧图片URL | {{width}} 宽(像素) | {{height}} 高(像素) | {{aspectRatio}} 宽高比 | {{duration}} 时长(秒) | {{taskId}} 任务ID | {{style}} 风格

## 完整示例

### 示例 1：同步文本模型（TEXT）
特点：直接返回结果，无需查询配置。response_mapping 直接映射最终内容。
{
  "name": "DeepSeek Chat",
  "category": "TEXT",
  "provider": "deepseek",
  "description": "DeepSeek-V3.2 高性价比文本生成，支持128K上下文",
  "price_config": {
    "currency": "CNY",
    "charge_on_failure": false,
    "components": [
      {
        "type": "input_tokens",
        "unit": "per_million_tokens",
        "price": 2
      },
      {
        "type": "output_tokens",
        "unit": "per_million_tokens",
        "price": 3
      }
    ]
  },
  "request_method": "POST",
  "url_template": "https://api.deepseek.com/v1/chat/completions",
  "headers_template": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body_template": {
    "model": "deepseek-chat",
    "messages": "{{messages}}",
    "max_tokens": "{{maxTokens}}",
    "temperature": "{{temperature}}"
  },
  "default_params": {
    "maxTokens": 8000,
    "temperature": 0.7
  },
  "response_mapping": {
    "content": "choices.0.message.content",
    "reasoningContent": "choices.0.message.reasoning_content",
    "tokens": "usage.total_tokens",
    "inputTokens": "usage.prompt_tokens",
    "outputTokens": "usage.completion_tokens",
    "finishReason": "choices.0.finish_reason"
  },
  "custom_handler": "deepseek"
}

### 示例 2：异步图片模型（IMAGE）
特点：提交后返回 taskId，需要轮询查询接口。query_response_mapping 提取 status 用于条件判断，query_success_mapping 提取图片 URL。
{
  "name": "可灵图片生成",
  "category": "IMAGE",
  "provider": "kling",
  "description": "高质量AI图片生成",
  "price_config": {
    "currency": "CNY",
    "charge_on_failure": false,
    "components": [
      {
        "type": "item_count",
        "unit": "per_item",
        "price": 0.1
      }
    ]
  },
  "request_method": "POST",
  "url_template": "https://api.klingai.com/v1/images/generations",
  "headers_template": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiKey}}"
  },
  "body_template": {
    "model": "kling-v1",
    "prompt": "{{prompt}}",
    "aspect_ratio": "{{aspectRatio}}",
    "n": 1
  },
  "default_params": {
    "aspectRatio": "16:9"
  },
  "response_mapping": {
    "taskId": "data.task_id"
  },
  "query_url_template": "https://api.klingai.com/v1/images/generations/{{taskId}}",
  "query_method": "GET",
  "query_headers_template": {
    "Authorization": "Bearer {{apiKey}}"
  },
  "query_response_mapping": {
    "status": "data.task_status"
  },
  "query_success_condition": "status == \\"succeed\\"",
  "query_fail_condition": "status == \\"failed\\"",
  "query_success_mapping": {
    "image_url": "data.task_result.images.0.url"
  },
  "query_fail_mapping": {
    "error": "data.task_status_msg"
  }
}

### 示例 3：异步视频模型（VIDEO），查询用 POST + Body
特点：与示例 2 的区别是查询接口用 POST 方法并需要 Body，且成功映射提取的是 video_url。支持 imageUrl（单张参考图）、startFrame/endFrame（首尾帧）。
{
  "name": "Sora 视频生成",
  "category": "VIDEO",
  "provider": "sora",
  "description": "文生视频/图生视频",
  "price_config": {
    "currency": "CNY",
    "charge_on_failure": false,
    "components": [
      {
        "type": "duration_seconds",
        "unit": "per_second",
        "price": 0.05
      }
    ]
  },
  "request_method": "POST",
  "url_template": "https://api.sora.com/v1/videos/create",
  "headers_template": {
    "Content-Type": "application/json",
    "X-Api-Key": "{{apiKey}}"
  },
  "body_template": {
    "prompt": "{{prompt}}",
    "image_url": "{{imageUrl}}",
    "start_frame": "{{startFrame}}",
    "end_frame": "{{endFrame}}",
    "duration": "{{duration}}",
    "aspect_ratio": "{{aspectRatio}}"
  },
  "default_params": {
    "duration": 5,
    "aspectRatio": "16:9"
  },
  "response_mapping": {
    "taskId": "data.id"
  },
  "query_url_template": "https://api.sora.com/v1/videos/query",
  "query_method": "POST",
  "query_headers_template": {
    "Content-Type": "application/json",
    "X-Api-Key": "{{apiKey}}"
  },
  "query_body_template": {
    "task_id": "{{taskId}}"
  },
  "query_response_mapping": {
    "status": "data.status"
  },
  "query_success_condition": "status == \\"completed\\" || status == \\"success\\"",
  "query_fail_condition": "status == \\"failed\\" || status == \\"error\\"",
  "query_success_mapping": {
    "video_url": "data.result.video_url"
  },
  "query_fail_mapping": {
    "error": "data.error_message",
    "message": "data.fail_reason"
  }
}`;

  const userMessage = `请分析以下 API 文档，并生成配置 JSON："\n\n${apiDoc} "`;

  if (onProgress) onProgress(20);

  const fullPrompt = `${customPrompt || systemInstruction}

---

${userMessage}`;

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: selectedModel,
    maxTokens: 8192,
    temperature: 0.1
  }, onProgress);

  if (onProgress) onProgress(80);

  // 清洗 + 解析 JSON
  const parsedConfig = washForJSON(result.content);
  if (!parsedConfig) {
    throw new Error('AI 返回内容无法解析为 JSON');
  }

  if (onProgress) onProgress(95);

  return {
    config: parsedConfig,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown',
    rawContent: result.content
  };
}

module.exports = handleSmartParse;
