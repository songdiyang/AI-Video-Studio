/**
 * AI 助手对话路由
 * POST /api/ai-assistant/chat - 多模态AI对话
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware');
const { callAIModel } = require('./aiModelService');
const { withAIBillingContext } = require('./aiBillingContext');

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
  let systemPrompt = '你是一个专业的多媒体内容分析助手，擅长分析图片构图、色彩、角色表情、场景氛围等。你可以提供具体的优化建议。';

  if (context) {
    if (context.sceneDescription) {
      systemPrompt += `\n\n当前分镜描述：${context.sceneDescription}`;
    }
    systemPrompt += '\n\n请分析用户提供的多媒体内容，给出专业的分析和可执行的优化建议。如果有具体的操作建议，请在回复末尾以JSON格式提供，格式为：\n[SUGGESTIONS]{"suggestions":[{"action":"操作标识","label":"显示文本","params":{}}]}[/SUGGESTIONS]';
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
    const callParams = {
      messages: transformedMessages,
      systemPrompt
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

module.exports = router;
