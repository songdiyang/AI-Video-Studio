// AI 助手聊天 / 模型目录 的离线直连处理
//
// 桌面离线模式下，把以下后端端点接到本地直连厂商层（localAI），完全不依赖 localhost:4001：
//  - POST /api/ai-assistant/chat          非流式对话
//  - POST /api/ai-assistant/chat/stream   流式对话（SSE，帧格式与后端一致）
//  - POST /api/ai-assistant/enhance-prompt 提示词增强
//  - POST /api/ai-assistant/compress       历史压缩
//  - GET  /api/ai-models                   由本地已保存模型配置合成目录
//  - GET/PUT /api/projects/:id/models      项目级模型选择（落 .jzp 文档）

import { getOfflineModels, resolveModel, chatText, chatTextStream, type OfflineModel } from './localAI';
import {
  buildSystemPrompt,
  buildChatMessages,
  parseSuggestions,
  type ChatInputMessage,
} from './localAiChatPayload';
import { readProjectDoc, writeProjectDoc, resolveLocalPath } from './localStore';
import type { AIModel } from '../components/AIModelSelector';

const NO_MODEL_MSG = '请先在设置中配置 AI 模型密钥';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 把 OfflineModel 映射为前端消费的 AIModel 形状（离线不支持长任务，supports_tool_calling=false） */
function toAiModel(m: OfflineModel): AIModel {
  return {
    name: m.model_name,
    provider: m.provider,
    type: m.type,
    category: m.type,
    supportedAspectRatios: m.supportedAspectRatios,
    supports_tool_calling: false,
    isActive: true,
  };
}

// ==================== 聊天端点 ====================

async function handleChat(body: any): Promise<Response> {
  const messages = (body?.messages || []) as ChatInputMessage[];
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ success: false, error: '缺少必填参数 messages' }, 400);
  }
  const model = await resolveModel(body?.modelName || '');
  if (!model) return jsonResponse({ success: false, error: NO_MODEL_MSG });

  const openAiMessages = buildChatMessages(messages, buildSystemPrompt(body?.context));
  const { content, usage } = await chatText({ model, messages: openAiMessages });
  if (!content) return jsonResponse({ success: false, error: 'AI 返回内容为空，请稍后重试' }, 500);

  const { cleanReply, suggestions } = parseSuggestions(content);
  return jsonResponse({ success: true, reply: cleanReply, suggestions, usage });
}

/** 构造 SSE Response：start 回调同步取得 controller，异步生成期间安全 enqueue */
function makeSseResponse(
  generate: (emit: (frame: string) => void, done: () => void) => void
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame));
      };
      const done = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      generate(emit, done);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function handleChatStream(body: any): Promise<Response> {
  return (async () => {
    const messages = (body?.messages || []) as ChatInputMessage[];
    const model = await resolveModel(body?.modelName || '');
    const openAiMessages = buildChatMessages(messages, buildSystemPrompt(body?.context));

    return makeSseResponse((emit, done) => {
      (async () => {
        if (!model) {
          emit(`data: ${JSON.stringify({ error: NO_MODEL_MSG })}\n\n`);
          emit('data: [DONE]\n\n');
          done();
          return;
        }
        try {
          await chatTextStream({
            model,
            messages: openAiMessages,
            onDelta: (t) => emit(`data: ${JSON.stringify({ delta: t })}\n\n`),
            onReasoning: (t) => emit(`data: ${JSON.stringify({ reasoningDelta: t })}\n\n`),
          });
          emit('data: [DONE]\n\n');
        } catch (err: any) {
          emit(`data: ${JSON.stringify({ error: err?.message || 'AI 对话失败' })}\n\n`);
          emit('data: [DONE]\n\n');
        } finally {
          done();
        }
      })();
    });
  })();
}

async function handleEnhancePrompt(body: any): Promise<Response> {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return jsonResponse({ success: false, error: '缺少 prompt' }, 400);
  const model = await resolveModel(body?.modelName || '');
  if (!model) return jsonResponse({ success: false, error: NO_MODEL_MSG });

  const ctx = body?.context;
  const ctxHint = ctx ? `\n\n用户当前场景：${[ctx.projectName, ctx.currentTask].filter(Boolean).join('，')}` : '';
  const systemPrompt =
    '你是一个 Prompt 优化专家。用户给你一段原始说明，你要把它改写成更清晰、更具体、更有结构的指令，让后续 AI 更容易执行。规则：\n1. 保留用户原意，不要增加链路外的任务\n2. 补全模糊的主语/宾语（如只写了"推荐"→改写为"请推荐 X 以便 Y"）\n3. 如有多个需求，拆为序号列表\n4. 只输出改写后的 prompt 本身，不要加任何前缀解释\n5. 长度控制在原文的 2-3 倍以内';

  const { content } = await chatText({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `原始 prompt：\n${prompt}${ctxHint}` },
    ],
  });
  if (!content) return jsonResponse({ success: false, error: '提示词增强失败，未返回内容' }, 500);
  return jsonResponse({ success: true, enhanced: content.trim(), original: body.prompt });
}

async function handleCompress(body: any): Promise<Response> {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ success: false, error: '缺少 messages' }, 400);
  }
  const model = await resolveModel(body?.modelName || '');
  if (!model) return jsonResponse({ success: false, error: NO_MODEL_MSG });

  const convo = messages
    .map((m: any) => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : '系统';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `[${role}] ${content}`;
    })
    .join('\n\n');

  const systemPrompt =
    '你是一个专业的对话压缩器。请把用户与 AI 的历史对话压缩成一段结构化的中文摘要，保留关键事实、决策、已完成的操作、未完成的待办、用户偏好；去除客套语和无关的闲聊。输出格式：三个小标题【已确定】【进行中】【待办】，每个下面用 - 带的短语列表。长度不超过 300 字。';

  const { content } = await chatText({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请压缩以下对话：\n\n${convo}` },
    ],
  });
  if (!content) return jsonResponse({ success: false, error: '压缩失败，未返回内容' }, 500);
  return jsonResponse({ success: true, summary: content.trim(), originalCount: messages.length });
}

// ==================== 模型目录 / 项目级选择 ====================

async function handleModelsList(): Promise<Response> {
  const offline = await getOfflineModels();
  const models = offline.map(toAiModel);
  return jsonResponse({ success: true, models });
}

interface ModelSelectionDoc {
  useModels: Record<string, string>;
}

async function handleProjectModelsGet(projectId: number): Promise<Response> {
  const path = await resolveLocalPath(projectId);
  if (!path) return jsonResponse({ useModels: {} });
  const doc = await readProjectDoc<ModelSelectionDoc>(projectId, 'aiModelSelection', { useModels: {} });
  return jsonResponse({ useModels: doc.useModels || {} });
}

async function handleProjectModelsPut(projectId: number, body: any): Promise<Response> {
  const useModels = (body?.useModels && typeof body.useModels === 'object') ? body.useModels : {};
  await writeProjectDoc<ModelSelectionDoc>(projectId, 'aiModelSelection', { useModels });
  return jsonResponse({ success: true });
}

// ==================== 路由入口 ====================

/**
 * 匹配聊天 / 模型目录 / 项目模型选择路由；未匹配返回 null（透传）。
 */
export async function routeAiChatAndModels(
  url: URL,
  method: string,
  body: any
): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  if (pathname === '/api/ai-assistant/chat' && m === 'POST') return handleChat(body);
  if (pathname === '/api/ai-assistant/chat/stream' && m === 'POST') return handleChatStream(body);
  if (pathname === '/api/ai-assistant/enhance-prompt' && m === 'POST') return handleEnhancePrompt(body);
  if (pathname === '/api/ai-assistant/compress' && m === 'POST') return handleCompress(body);

  if (pathname === '/api/ai-models' && m === 'GET') return handleModelsList();

  if ((mt = pathname.match(/^\/api\/projects\/(\d+)\/models$/))) {
    const projectId = Number(mt[1]);
    if (m === 'GET') return handleProjectModelsGet(projectId);
    if (m === 'PUT') return handleProjectModelsPut(projectId, body);
  }

  return null;
}
