/**
 * AI 助手对话路由
 * POST /api/ai-assistant/chat - 多模态AI对话
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware');
const { callAIModel } = require('./aiModelService');
const { withAIBillingContext } = require('./aiBillingContext');
const { queryOne, queryAll, execute } = require('./dbHelper');
const fetch = require('node-fetch');
const workflowEngine = require('./nosyntask/engine');
const { encodeId } = require('./utils/workflowId');

// AI_ASSISTANT_LONG_TASK_ENABLED 灰度开关（默认开启；设置为 'false' 可关闭）
const LONG_TASK_ENABLED = process.env.AI_ASSISTANT_LONG_TASK_ENABLED !== 'false';

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
  let systemPrompt = '你是 NanoStory 的 AI 助手，拥有当前项目的完整操作权限，能查看角色/场景/剧本/分镜资源，也能帮用户生成、检查、增删改分镜。回复要简洁自然，像朋友一样对话即可；只有在用户明确请求分析时才给出专业建议。';

  if (!context) return systemPrompt;

  // 项目概览
  if (context.projectName) {
    systemPrompt += `\n\n【当前项目】${context.projectName}${context.projectDescription ? '：' + context.projectDescription : ''}`;
  }

  // 当前选中分镜
  if (context.sceneDescription) {
    systemPrompt += `\n\n【当前选中分镜描述】${context.sceneDescription}`;
  }
  if (context.frameId) {
    systemPrompt += `\n【当前选中分镜ID】${context.frameId}`;
  }
  if (context.frameIndex) {
    systemPrompt += `\n【当前选中第 ${context.frameIndex} 个分镜】`;
  }

  // 角色清单
  if (Array.isArray(context.characters) && context.characters.length > 0) {
    const list = context.characters.map(c => `${c.name}(ID:${c.id})${c.description ? '-' + String(c.description).slice(0, 40) : ''}`).join('；');
    systemPrompt += `\n\n【项目角色】${list}`;
  }

  // 场景清单
  if (Array.isArray(context.locations) && context.locations.length > 0) {
    const list = context.locations.map(l => `${l.name}(ID:${l.id})${l.description ? '-' + String(l.description).slice(0, 40) : ''}`).join('；');
    systemPrompt += `\n\n【项目场景】${list}`;
  }

  // 剧本清单
  if (Array.isArray(context.scripts) && context.scripts.length > 0) {
    const list = context.scripts.map(s => `第${s.episode_number}集《${s.title || '未命名'}》(ID:${s.id})`).join('；');
    systemPrompt += `\n\n【项目剧本】${list}`;
  }

  // 分镜清单（带提示词 & 素材状态，供 AI 判断是否需要质检/生成）
  if (Array.isArray(context.scenes) && context.scenes.length > 0) {
    const lines = context.scenes.map(s => {
      const flags = [];
      if (s.first_frame_url) flags.push('首帧✓');
      if (s.last_frame_url) flags.push('尾帧✓');
      if (s.video_url) flags.push('视频✓');
      const status = flags.length > 0 ? `[${flags.join(' ')}]` : '[未生成]';
      const desc = s.description ? String(s.description).slice(0, 50) : '';
      return `第${s.index}(ID:${s.id})${status} ${desc}`;
    }).join('\n');
    systemPrompt += `\n\n【项目分镜列表（按顺序）】\n${lines}\n\n当用户说"第X个分镜"时，请根据上面列表匹配对应的分镜ID，并在 action 的 params 中传入正确的 sceneId。`;
  }

  // 行动协议：AI 直接执行，不需要用户确认
  systemPrompt += '\n\n当用户要求你执行操作时，直接在回复中告诉用户你正在做什么，并在末尾附上 action 指令，系统会自动执行。格式：\n[SUGGESTIONS]{"suggestions":[{"action":"操作标识","label":"执行内容描述","params":{}}]}[/SUGGESTIONS]\n你可以在一次回复中附带多个 action 指令，系统会依次自动执行。纯闲聊或简单提问不需要 SUGGESTIONS。';

  // Action 清单（全量扩充）
  systemPrompt += '\n\n【可用 action 清单】' +
    '\n// 分镜生成与质检' +
    '\n- generate_frame：生成首尾帧图片。params:{sceneId}' +
    '\n- generate_video：生成视频。params:{sceneId}' +
    '\n- upload_material：上传分镜素材。params:{sceneId}' +
    '\n- optimize_prompt：优化分镜提示词。params:{sceneId}' +
    '\n- auto_storyboard：由当前剧本自动拆分镜。' +
    '\n- inspect_quality：检查分镜质量。params:{sceneId}。视频>图片>提示词 降级，1-5 星评级 + 改进建议。' +
    '\n// 分镜 CRUD（破坏性）' +
    '\n- insert_scene：插入新分镜。params:{atIndex:从0开始}' +
    '\n- delete_scene：删除分镜。params:{sceneId}' +
    '\n- update_scene：更新分镜字段。params:{sceneId, field:"description|base_description|first_frame_prompt|last_frame_prompt|video_prompt|voiceover|duration", value:"新内容"（duration 传秒数的数字字符串）}' +
    '\n- update_scene_dialogues：更新对白。params:{sceneId, dialogues:[{character,line}或字符串列表]}' +
    '\n- update_scene_characters_location：绑定角色和场景。params:{sceneId, characters:["角色名1",..], location:"场景名", characterIds?:[角色ID,..], locationId?:场景ID}' +
    '\n- move_scene：上移/下移一步。params:{sceneId, direction:"up|down"}' +
    '\n- reorder_scenes：按给定顺序重排。params:{sceneIds:[ID1,ID2,..]}' +
    '\n// 角色' +
    '\n- create_character：新建角色。params:{name, description?, base_appearance?}' +
    '\n- update_character：更新角色字段。params:{characterId, fields:{name?, description?, base_appearance?, outfit_appearance?}}' +
    '\n- delete_character：删除角色。params:{characterId}（破坏性）' +
    '\n- generate_base_model：生成角色白膜三视图。params:{characterId}' +
    '\n// 场景（环境地点）' +
    '\n- create_location：新建场景。params:{name, description?}' +
    '\n- update_location：更新场景字段。params:{locationId, fields:{name?, description?}}' +
    '\n- delete_location：删除场景。params:{locationId}（破坏性）' +
    '\n// 剧本' +
    '\n- create_script：新建剧本。params:{title?, episodeNumber?, content}' +
    '\n- delete_script：删除剧本。params:{scriptId}（破坏性）' +
    '\n- bind_script：切换当前参考剧本（弱绑定）。params:{scriptId}——传 null 则解绑' +
    '\n- switch_episode：切换当前集数进度标签。params:{episodeNumber:数字}' +
    '\n// 项目' +
    '\n- update_project：更新项目信息。params:{fields:{name?, description?, art_style?}}' +
    '\n// 协作 & 版本' +
    '\n- invite_member：邀请协作者。params:{username, role?:"editor|viewer"}' +
    '\n- assign_task：分配分镜任务。params:{sceneId, username}' +
    '\n- restore_version：回滚到指定版本。params:{versionId, restoreType?:"single|create_new"}（破坏性）' +
    '\n\n重要：你拥有项目的完整操作权限。当用户明确要求执行某个操作时，直接在回复中说明你正在做什么，并附上对应的 action 指令。系统将自动执行，不需要用户再次确认。对于删除等不可逆操作，在回复正文中简要说明影响即可。';

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

/**
 * POST /compress
 * 将长对话压缩为一段简短摘要，用于前端替换历史消息
 */
router.post('/compress', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId, modelName, messages } = req.body;
  if (!modelName) return res.status(400).json({ success: false, error: '缺少 modelName' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: '缺少 messages' });
  }
  try {
    // 把对话拼成一段文本交给模型总结
    const convo = messages.map(m => {
      const role = m.role === 'user' ? '用户' : (m.role === 'assistant' ? 'AI' : '系统');
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `[${role}] ${content}`;
    }).join('\n\n');

    const systemPrompt = '你是一个专业的对话压缩器。请把用户与 AI 的历史对话压缩成一段结构化的中文摘要，保留关键事实、决策、已完成的操作、未完成的待办、用户偏好；去除客套语和无关的闲聊。输出格式：三个小标题【已确定】【进行中】【待办】，每个下面用 - 带的短语列表。长度不超过 300 字。';
    const callParams = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请压缩以下对话：\n\n${convo}` }
      ],
      systemPrompt,
      input: `请压缩以下对话：\n\n${convo}`
    };
    const result = await withAIBillingContext(
      { userId, projectId: projectId || null, sourceType: 'ai_assistant', operationKey: 'compress' },
      () => callAIModel(modelName, callParams)
    );
    const summary = extractReplyText(result);
    if (!summary) return res.status(500).json({ success: false, error: '压缩失败，未返回内容' });
    res.json({ success: true, summary, originalCount: messages.length });
  } catch (err) {
    console.error('[AI Assistant] compress 失败:', err.message);
    res.status(500).json({ success: false, error: err.message || '压缩对话失败' });
  }
});

/**
 * POST /enhance-prompt
 * 接收用户原始输入 prompt，返回一个结构更清晰、信息更完整的增强版
 */
router.post('/enhance-prompt', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId, modelName, prompt, context } = req.body;
  if (!modelName) return res.status(400).json({ success: false, error: '缺少 modelName' });
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: '缺少 prompt' });
  }
  try {
    const ctxHint = context ? `\n\n用户当前场景：${[context.projectName, context.currentTask].filter(Boolean).join('，')}` : '';
    const systemPrompt = '你是一个 Prompt 优化专家。用户给你一段原始说明，你要把它改写成更清晰、更具体、更有结构的指令，让后续 AI 更容易执行。规则：\n1. 保留用户原意，不要增加链路外的任务\n2. 补全模糊的主语/宾语（如只写了"推荐"→改写为"请推荐 X 以便 Y"）\n3. 如有多个需求，拆为序号列表\n4. 只输出改写后的 prompt 本身，不要加任何前缀解释\n5. 长度控制在原文的 2-3 倍以内';
    const callParams = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `原始 prompt：\n${prompt}${ctxHint}` }
      ],
      systemPrompt,
      input: `原始 prompt：\n${prompt}${ctxHint}`
    };
    const result = await withAIBillingContext(
      { userId, projectId: projectId || null, sourceType: 'ai_assistant', operationKey: 'enhance_prompt' },
      () => callAIModel(modelName, callParams)
    );
    const enhanced = extractReplyText(result);
    if (!enhanced) return res.status(500).json({ success: false, error: '提示词增强失败，未返回内容' });
    res.json({ success: true, enhanced: enhanced.trim(), original: prompt });
  } catch (err) {
    console.error('[AI Assistant] enhance-prompt 失败:', err.message);
    res.status(500).json({ success: false, error: err.message || '提示词增强失败' });
  }
});

/* ──────────────────────────────────────────────────────────────
 * Sessions CRUD
 * 一个项目可以有多个 AI 助手会话，对话窗口之间可切换
 * ────────────────────────────────────────────────────────────── */

/** GET /sessions?projectId= 列出当前用户的会话（按项目过滤） */
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const sql = projectId
      ? 'SELECT id, title, model_name, message_count, last_message_at, created_at FROM ai_assistant_sessions WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC LIMIT 100'
      : 'SELECT id, title, model_name, message_count, last_message_at, created_at FROM ai_assistant_sessions WHERE user_id = ? AND project_id IS NULL ORDER BY updated_at DESC LIMIT 100';
    const params = projectId ? [userId, projectId] : [userId];
    const sessions = await queryAll(sql, params);
    res.json({ success: true, sessions });
  } catch (err) {
    console.error('[AI Assistant] list sessions failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /sessions 创建新会话 */
router.post('/sessions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId = null, title = '新会话', modelName = null } = req.body || {};
    const result = await execute(
      'INSERT INTO ai_assistant_sessions (user_id, project_id, title, model_name) VALUES (?, ?, ?, ?)',
      [userId, projectId || null, String(title).slice(0, 120), modelName]
    );
    const session = await queryOne(
      'SELECT id, title, model_name, message_count, last_message_at, created_at FROM ai_assistant_sessions WHERE id = ?',
      [result.insertId]
    );
    res.json({ success: true, session });
  } catch (err) {
    console.error('[AI Assistant] create session failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /sessions/:id/messages 读取会话所有消息 */
router.get('/sessions/:id/messages', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const session = await queryOne('SELECT id FROM ai_assistant_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
    const rows = await queryAll(
      'SELECT id, role, content, attachments, suggestions, created_at FROM ai_assistant_messages WHERE session_id = ? ORDER BY id ASC',
      [sessionId]
    );
    const messages = rows.map((r) => ({
      id: String(r.id),
      role: r.role,
      content: safeJson(r.content) ?? r.content,
      attachments: safeJsonArray(r.attachments),
      suggestions: safeJsonArray(r.suggestions),
      timestamp: new Date(r.created_at).getTime()
    }));
    res.json({ success: true, messages });
  } catch (err) {
    console.error('[AI Assistant] load messages failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /sessions/:id/messages 追加一条消息（前端乐观写入） */
router.post('/sessions/:id/messages', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const session = await queryOne('SELECT id FROM ai_assistant_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
    const { role, content, attachments = null, suggestions = null } = req.body || {};
    if (!role || content == null) return res.status(400).json({ success: false, error: '缺少 role 或 content' });
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const result = await execute(
      'INSERT INTO ai_assistant_messages (session_id, role, content, attachments, suggestions) VALUES (?, ?, ?, ?, ?)',
      [sessionId, String(role).slice(0, 16), contentStr, attachments ? JSON.stringify(attachments) : null, suggestions ? JSON.stringify(suggestions) : null]
    );
    await execute(
      'UPDATE ai_assistant_sessions SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sessionId]
    );
    res.json({ success: true, messageId: result.insertId });
  } catch (err) {
    console.error('[AI Assistant] append message failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PATCH /sessions/:id 重命名 */
router.patch('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: '缺少 title' });
    const r = await execute(
      'UPDATE ai_assistant_sessions SET title = ? WHERE id = ? AND user_id = ?',
      [String(title).slice(0, 120), sessionId, userId]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, error: '会话不存在' });
    res.json({ success: true });
  } catch (err) {
    console.error('[AI Assistant] rename session failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** DELETE /sessions/:id 删除会话 */
router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const r = await execute('DELETE FROM ai_assistant_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, error: '会话不存在' });
    await execute('DELETE FROM ai_assistant_messages WHERE session_id = ?', [sessionId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI Assistant] delete session failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /sessions/:id/generate-title 根据前几条消息生成标题 */
router.post('/sessions/:id/generate-title', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const { modelName } = req.body || {};
    const session = await queryOne('SELECT id, project_id FROM ai_assistant_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
    const msgs = await queryAll(
      'SELECT role, content FROM ai_assistant_messages WHERE session_id = ? ORDER BY id ASC LIMIT 6',
      [sessionId]
    );
    if (!msgs || msgs.length === 0) return res.json({ success: true, title: '新会话' });
    const sample = msgs.map((m) => `[${m.role === 'user' ? '用户' : 'AI'}] ${String(m.content).slice(0, 200)}`).join('\n');
    const systemPrompt = '请为以下对话生成一个不超过 12 字的简短中文标题，只输出标题本身，不要引号或解释。';
    const callParams = {
      messages: [{ role: 'user', content: sample }],
      systemPrompt,
      input: sample
    };
    const result = await withAIBillingContext(
      { userId, projectId: session.project_id, sourceType: 'ai_assistant', operationKey: 'generate_title' },
      () => callAIModel(modelName || 'Doubao-Seed-1.6', callParams)
    );
    let title = extractReplyText(result) || '新会话';
    title = title.replace(/["“”《》]/g, '').trim().slice(0, 24);
    await execute('UPDATE ai_assistant_sessions SET title = ? WHERE id = ?', [title, sessionId]);
    res.json({ success: true, title });
  } catch (err) {
    console.error('[AI Assistant] generate title failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

function safeJson(str) {
  if (str == null) return null;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return null; }
}
function safeJsonArray(str) {
  const v = safeJson(str);
  if (Array.isArray(v)) return v;
  return undefined;
}

/* ───────────────────────────────────────────────────────────────
 * 长任务（AI 助手接入 nosyntask workflow）
 * POST /sessions/:id/run    启动 ai_assistant_session 主 workflow
 * POST /sessions/:id/cancel 取消当前 active_job_id
 * ─────────────────────────────────────────────────────────────── */
router.post('/sessions/:id/run', authMiddleware, async (req, res) => {
  try {
    if (!LONG_TASK_ENABLED) {
      return res.status(503).json({ success: false, error: 'AI 助手长任务未启用' });
    }
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const { message, modelName, defaultTextModel, defaultImageModel, projectId: bodyProjectId } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: '缺少 message' });
    if (!modelName) return res.status(400).json({ success: false, error: '缺少 modelName' });

    // 1) 校验 session 归属
    const session = await queryOne(
      'SELECT id, project_id, active_job_id FROM ai_assistant_sessions WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });

    // 2) 校验模型支持 tool calling
    const model = await queryOne(
      'SELECT name, supports_tool_calling FROM ai_model_configs WHERE name = ? AND is_active = 1',
      [modelName]
    );
    if (!model) return res.status(404).json({ success: false, error: '模型不存在或未启用' });
    if (!model.supports_tool_calling) {
      return res.status(400).json({
        success: false,
        error: `模型 ${modelName} 不支持 AI 助手长任务（function calling），请更换为支持 tool calling 的模型`
      });
    }

    // 3) 并发保护：已有运行中的 active_job_id 拒绝新 run
    if (session.active_job_id) {
      const activeJob = await queryOne(
        'SELECT id, status FROM workflow_jobs WHERE id = ?',
        [session.active_job_id]
      );
      if (activeJob && !['completed', 'failed', 'cancelled'].includes(activeJob.status)) {
        return res.status(409).json({
          success: false,
          error: '本会话已有运行中的任务，请稍候或先取消',
          activeJobId: encodeId(activeJob.id)
        });
      }
    }

    // 4) 获取最近历史消息作为上下文（最多 20 条）
    const history = await queryAll(
      'SELECT role, content FROM ai_assistant_messages WHERE session_id = ? ORDER BY id DESC LIMIT 20',
      [sessionId]
    );
    const conversation = history.reverse().map(m => {
      let content = m.content;
      try { const parsed = JSON.parse(m.content); content = typeof parsed === 'string' ? parsed : JSON.stringify(parsed); } catch { /* 非 JSON 保留原文 */ }
      return { role: m.role, content: typeof content === 'string' ? content : JSON.stringify(content) };
    });

    // 5) 启动主 workflow
    const projectId = bodyProjectId || session.project_id || null;
    const jobParams = {
      message: typeof message === 'string' ? message : JSON.stringify(message),
      conversation,
      textModel: modelName,
      defaultTextModel: defaultTextModel || modelName,
      defaultImageModel: defaultImageModel || null,
      projectId,
      sessionId
    };

    const { jobId, tasks } = await workflowEngine.startWorkflow('ai_assistant_session', {
      userId,
      projectId,
      jobParams,
      metadata: { source: 'ai_assistant', sessionId }
    });

    // 6) 更新 session.active_job_id
    await execute('UPDATE ai_assistant_sessions SET active_job_id = ? WHERE id = ?', [jobId, sessionId]);

    // 注：用户消息的持久化由前端通过 POST /sessions/:id/messages 完成，避免双写

    res.json({
      success: true,
      jobId: encodeId(jobId),
      tasks: tasks.map(t => ({ stepIndex: t.stepIndex, type: t.type, displayName: t.displayName, status: t.status }))
    });
  } catch (err) {
    console.error('[AI Assistant] run session failed:', err.message, err.stack);
    res.status(500).json({ success: false, error: err.message || '启动任务失败' });
  }
});

router.post('/sessions/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = Number(req.params.id);
    const session = await queryOne(
      'SELECT id, active_job_id FROM ai_assistant_sessions WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );
    if (!session) return res.status(404).json({ success: false, error: '会话不存在' });
    if (!session.active_job_id) return res.json({ success: true, cancelled: false, message: '无运行中任务' });

    const result = await workflowEngine.cancelWorkflow(session.active_job_id, userId);
    await execute('UPDATE ai_assistant_sessions SET active_job_id = NULL WHERE id = ?', [sessionId]);
    res.json({ success: true, cancelled: true, result });
  } catch (err) {
    console.error('[AI Assistant] cancel session failed:', err.message);
    res.status(500).json({ success: false, error: err.message || '取消任务失败' });
  }
});

module.exports = router;
