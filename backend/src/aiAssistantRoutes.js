/**
 * AI 助手对话路由
 * POST /api/ai-assistant/chat - 多模态AI对话
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware');
const { callAIModel } = require('./aiModelService');
const { withAIBillingContext } = require('./aiBillingContext');
const { queryOne } = require('./dbHelper');
const fetch = require('node-fetch');

/**
 * 从 AI 回复中解析结构化建议
 */
function parseSuggestions(reply) {
  const match = reply.match(/\[SUGGESTIONS\](.*?)\[\/SUGGESTIONS\]/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        cleanReply: reply.replace(/\[SUGGESTIONS\].*?\[\/SUGGESTIONS\]/s, '').trim(),
        suggestions: parsed.suggestions || []
      };
    } catch { /* ignore parse error */ }
  }
  return { cleanReply: reply, suggestions: [] };
}

/**
 * 将前端 content 格式转换为处理器需要的格式
 * 前端: [{type: "image", url: "..."}]
 * 处理器: [{type: "input_image", image_url: "..."}]
 */
function transformMessageContent(content) {
  if (typeof content === 'string') {
    return content; // 纯文本直接透传，处理器内部会处理
  }

  if (!Array.isArray(content)) {
    return String(content || '');
  }

  return content.map(item => {
    switch (item.type) {
      case 'text':
        return { type: 'input_text', text: item.text || '' };
      case 'image':
        return { type: 'input_image', image_url: item.url || '' };
      case 'video':
        return { type: 'input_video', video_url: item.url || '' };
      case 'file':
        return { type: 'input_file', file_url: item.url || '' };
      default:
        // 已经是处理器格式或未知格式，直接透传
        if (item.type && item.type.startsWith('input_')) {
          return item;
        }
        if (item.text) {
          return { type: 'input_text', text: item.text };
        }
        return { type: 'input_text', text: JSON.stringify(item) };
    }
  });
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(context) {
  let systemPrompt = '你是 NanoStory 的 AI 助手，擅长多媒体内容分析和创作辅助。回复要简洁自然，不要过度分析，像朋友一样对话即可。只有在用户明确请求分析时，才给出专业建议。';

  if (context) {
    if (context.sceneDescription) {
      systemPrompt += `\n\n当前分镜描述：${context.sceneDescription}`;
    }
    if (context.frameId) {
      systemPrompt += `\n\n当前分镜ID：${context.frameId}`;
    }
    if (context.frameIndex) {
      systemPrompt += `\n\n当前是第 ${context.frameIndex} 个分镜`;
    }
    if (context.scenes && Array.isArray(context.scenes) && context.scenes.length > 0) {
      const sceneList = context.scenes.map(s => `第${s.index}个分镜(ID:${s.id})`).join('、');
      systemPrompt += `\n\n项目中所有分镜：${sceneList}。当用户说"第X个分镜"时，请根据此列表匹配对应的分镜ID，并在 action 的 params 中传入正确的 sceneId。`;
    }
    systemPrompt += '\n\n当用户需要你分析当前分镜或提供操作建议时，请在回复末尾以JSON格式提供结构化建议，格式为：\n[SUGGESTIONS]{"suggestions":[{"action":"操作标识","label":"显示文本","params":{}}]}[/SUGGESTIONS]\n如果用户只是闲聊或简单提问，不需要提供 SUGGESTIONS。';
    systemPrompt += '\n\n你可以建议或直接帮用户执行以下操作：\n- generate_frame：生成首尾帧图片。params 需包含 sceneId（分镜ID）。如果用户说"生成第四个分镜的图片"，请找到第4个分镜的ID并传入 sceneId。\n- generate_video：生成视频。params 需包含 sceneId（分镜ID）。\n- upload_material：上传分镜素材。params 需包含 sceneId。\n- optimize_prompt：优化分镜提示词。params 需包含 sceneId。\n- auto_storyboard：自动分镜。';
  }

  return systemPrompt;
}

/**
 * 从 callAIModel 结果中提取回复文本
 */
function extractReplyText(result) {
  if (!result) return '';

  // 优先从 response_mapping 映射后的字段取
  if (typeof result.content === 'string') return result.content;
  if (typeof result.text === 'string') return result.text;
  if (typeof result.message === 'string') return result.message;

  // 从 _raw 中尝试提取（Responses API 格式）
  const raw = result._raw;
  if (raw) {
    // Responses API: output[].content[].text
    if (Array.isArray(raw.output)) {
      for (const item of raw.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          const texts = item.content
            .filter(c => c.type === 'output_text')
            .map(c => c.text);
          if (texts.length > 0) return texts.join('');
        }
      }
    }
    // Chat Completions 格式
    if (raw.choices && raw.choices[0]?.message?.content) {
      return raw.choices[0].message.content;
    }
    if (typeof raw.content === 'string') return raw.content;
  }

  return '';
}

/**
 * 从结果中提取 usage 信息
 */
function extractUsage(result) {
  const raw = result?._raw;
  if (!raw?.usage) return null;

  const u = raw.usage;
  return {
    input_tokens: u.input_tokens || u.prompt_tokens || 0,
    output_tokens: u.output_tokens || u.completion_tokens || 0,
    total_tokens: u.total_tokens || (u.input_tokens || u.prompt_tokens || 0) + (u.output_tokens || u.completion_tokens || 0)
  };
}

/**
 * POST /chat
 * 多模态 AI 对话
 */
router.post('/chat', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId, modelName, messages, context } = req.body;

  // 参数验证
  if (!modelName) {
    return res.status(400).json({ success: false, error: '缺少必填参数 modelName' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: '缺少必填参数 messages，需要至少一条消息' });
  }

  console.log(`[AI Assistant] 用户 ${userId} 发起对话, 模型: ${modelName}, 项目: ${projectId || 'N/A'}, 消息数: ${messages.length}`);

  try {
    // 转换 messages 格式
    const transformedMessages = messages.map(msg => ({
      role: msg.role || 'user',
      content: transformMessageContent(msg.content)
    }));

    // 构建系统提示词
    const systemPrompt = buildSystemPrompt(context);

    // 构建调用参数
    // input 用于模板渲染（body_template 中的 {{input}} 占位符）
    // messages 和 systemPrompt 用于 custom_handler（如 doubao_multimodal）
    const callParams = {
      messages: transformedMessages,
      systemPrompt,
      input: JSON.stringify(transformedMessages)
    };

    // 使用计费上下文包裹调用
    const result = await withAIBillingContext(
      {
        userId,
        projectId: projectId || null,
        sourceType: 'ai_assistant',
        operationKey: 'chat'
      },
      () => callAIModel(modelName, callParams)
    );

    // 提取回复文本
    const rawReply = extractReplyText(result);

    if (!rawReply) {
      console.warn('[AI Assistant] 未能从模型结果中提取回复文本, result keys:', Object.keys(result || {}));
      return res.status(500).json({ success: false, error: 'AI 返回内容为空，请稍后重试' });
    }

    // 解析建议
    const { cleanReply, suggestions } = parseSuggestions(rawReply);

    // 提取 usage
    const usage = extractUsage(result);

    console.log(`[AI Assistant] 对话完成, 回复长度: ${cleanReply.length}, 建议数: ${suggestions.length}`);

    res.json({
      success: true,
      reply: cleanReply,
      suggestions,
      usage
    });
  } catch (error) {
    console.error('[AI Assistant] 对话失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 对话失败，请稍后重试'
    });
  }
});

/**
 * POST /chat/stream
 * 流式多模态 AI 对话（SSE）
 */
router.post('/chat/stream', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId, modelName, messages, context } = req.body;

  if (!modelName) {
    return res.status(400).json({ success: false, error: '缺少必填参数 modelName' });
  }
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: '缺少必填参数 messages' });
  }

  console.log(`[AI Assistant Stream] 用户 ${userId} 发起流式对话, 模型: ${modelName}`);

  try {
    // 获取模型配置
    const model = await queryOne(
      'SELECT * FROM ai_model_configs WHERE name = ? AND is_active = 1',
      [modelName]
    );
    if (!model) {
      return res.status(404).json({ success: false, error: '模型不存在或未启用' });
    }

    // 只支持 MULTIMODAL 模型的流式输出
    if (model.category !== 'MULTIMODAL') {
      return res.status(400).json({ success: false, error: '该模型不支持流式输出' });
    }

    // 获取 API Key
    const rawApiKey = model.api_key || process.env.ARK_API_KEY;
    const apiKey = rawApiKey ? String(rawApiKey).replace(/[\r\n\0]/g, '').trim() : null;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'API Key 未配置' });
    }

    // 获取模型ID
    const defaultParams = model.default_params
      ? (typeof model.default_params === 'string' ? JSON.parse(model.default_params) : model.default_params)
      : {};
    const modelId = defaultParams.modelId || 'doubao-seed-2-0-pro-260215';

    // 转换 messages
    const transformedMessages = messages.map(msg => ({
      role: msg.role || 'user',
      content: transformMessageContent(msg.content)
    }));

    // 构建 input 数组
    const input = [];
    for (const msg of transformedMessages) {
      if (typeof msg.content === 'string') {
        input.push({ role: msg.role, content: [{ type: 'input_text', text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        input.push({ role: msg.role, content: msg.content });
      }
    }

    // 系统提示词
    const systemPrompt = buildSystemPrompt(context);
    if (systemPrompt) {
      input.unshift({ role: 'system', content: [{ type: 'input_text', text: systemPrompt }] });
    }

    // 构建请求体
    const requestBody = {
      model: modelId,
      input,
      stream: true
    };

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 发送流式请求
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `API 请求失败 (${response.status}): ${errText}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // 读取流并转发（过滤掉 reasoning_content，只保留 output_text）
    const reader = response.body;
    let eventBuffer = '';

    reader.on('data', (chunk) => {
      eventBuffer += chunk.toString('utf-8');
      // SSE 事件以 \n\n 分隔
      let boundary = eventBuffer.indexOf('\n\n');
      while (boundary !== -1) {
        const eventBlock = eventBuffer.slice(0, boundary);
        eventBuffer = eventBuffer.slice(boundary + 2);

        const eventLines = eventBlock.split('\n');
        let eventType = '';
        let dataLine = '';

        for (const line of eventLines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataLine = line.slice(6);
          }
        }

        if (!dataLine) {
          boundary = eventBuffer.indexOf('\n\n');
          continue;
        }

        // 过滤 reasoning 相关事件
        if (eventType.includes('reasoning') || eventType.includes('thinking')) {
          boundary = eventBuffer.indexOf('\n\n');
          continue;
        }

        if (dataLine === '[DONE]') {
          res.write('data: [DONE]\n\n');
          boundary = eventBuffer.indexOf('\n\n');
          continue;
        }

        try {
          const parsed = JSON.parse(dataLine);
          // 提取文本增量
          const delta = parsed?.response?.output_text?.delta ||
                        parsed?.output_text?.delta ||
                        parsed?.delta || '';
          if (delta) {
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {
          // ignore parse error
        }

        boundary = eventBuffer.indexOf('\n\n');
      }
    });

    reader.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    reader.on('error', (err) => {
      console.error('[AI Assistant Stream] 流读取错误:', err.message);
      res.write(`data: ${JSON.stringify({ error: '流读取失败' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

  } catch (error) {
    console.error('[AI Assistant Stream] 对话失败:', error.message);
    res.write(`data: ${JSON.stringify({ error: error.message || 'AI 对话失败' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

module.exports = router;
