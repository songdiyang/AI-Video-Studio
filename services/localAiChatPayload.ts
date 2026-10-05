// AI 助手聊天载荷组装（离线直连层复用）
//
// 从 backend/src/aiAssistantRoutes.js 忠实移植的纯函数，供离线聊天/增强/压缩使用：
//  - buildSystemPrompt(context)：把项目上下文（角色/场景/剧本/分镜）拼进系统提示词
//  - transformMessageContent(content)：前端 content → 处理器多模态数组
//  - parseSuggestions(reply)：解析 [SUGGESTIONS]...[/SUGGESTIONS]
//  - buildChatMessages(...)：组装最终发给厂商的 OpenAI messages（含 system）

/** 前端传入的消息项（与 AIAssistantPanel 的 apiMessages 对齐） */
export interface ChatInputMessage {
  role: string;
  content: unknown;
  attachments?: Array<{ type: string; url?: string; name?: string }>;
}

/**
 * 将前端 content 格式转换为处理器需要的格式（移植自后端 transformMessageContent）
 * 前端: [{type: "image", url: "..."}]
 * 处理器: [{type: "input_image", image_url: "..."}]
 */
export function transformMessageContent(content: unknown): unknown {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');

  return (content as any[]).map((item) => {
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
        if (item.type && String(item.type).startsWith('input_')) return item;
        if (item.text) return { type: 'input_text', text: item.text };
        return { type: 'input_text', text: JSON.stringify(item) };
    }
  });
}

/** 从 AI 回复中解析结构化建议（移植自后端 parseSuggestions） */
export function parseSuggestions(reply: string): { cleanReply: string; suggestions: any[] } {
  const match = reply.match(/\[SUGGESTIONS\](.*?)\[\/SUGGESTIONS\]/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        cleanReply: reply.replace(/\[SUGGESTIONS\].*?\[\/SUGGESTIONS\]/s, '').trim(),
        suggestions: parsed.suggestions || [],
      };
    } catch {
      /* ignore parse error */
    }
  }
  return { cleanReply: reply, suggestions: [] };
}

/**
 * 构建系统提示词（移植自后端 buildSystemPrompt）。
 * context 形状与 AIAssistantPanel 的 contextPayload 对齐。
 */
export function buildSystemPrompt(context: any): string {
  let systemPrompt =
    '你是 NanoStory 的 AI 助手，拥有当前项目的完整操作权限，能查看角色/场景/剧本/分镜资源，也能帮用户生成、检查、增删改分镜。回复要简洁自然，像朋友一样对话即可；只有在用户明确请求分析时才给出专业建议。';

  if (!context) return systemPrompt;

  if (context.projectName) {
    systemPrompt += `\n\n【当前项目】${context.projectName}${context.projectDescription ? '：' + context.projectDescription : ''}`;
  }

  if (context.sceneDescription) {
    systemPrompt += `\n\n【当前选中分镜描述】${context.sceneDescription}`;
  }
  if (context.frameId) {
    systemPrompt += `\n【当前选中分镜ID】${context.frameId}`;
  }
  if (context.frameIndex) {
    systemPrompt += `\n【当前选中第 ${context.frameIndex} 个分镜】`;
  }

  if (Array.isArray(context.characters) && context.characters.length > 0) {
    const list = context.characters
      .map((c: any) => `${c.name}(ID:${c.id})${c.description ? '-' + String(c.description).slice(0, 40) : ''}`)
      .join('；');
    systemPrompt += `\n\n【项目角色】${list}`;
  }

  if (Array.isArray(context.locations) && context.locations.length > 0) {
    const list = context.locations
      .map((l: any) => `${l.name}(ID:${l.id})${l.description ? '-' + String(l.description).slice(0, 40) : ''}`)
      .join('；');
    systemPrompt += `\n\n【项目场景】${list}`;
  }

  if (Array.isArray(context.scripts) && context.scripts.length > 0) {
    const MAX_SCRIPT_CONTENT_LEN = 3000;
    const scriptDetails = context.scripts
      .map((s: any) => {
        let detail = `第${s.episode_number}集《${s.title || '未命名'}》(ID:${s.id})`;
        if (s.content) {
          const content =
            s.content.length > MAX_SCRIPT_CONTENT_LEN
              ? s.content.slice(0, MAX_SCRIPT_CONTENT_LEN) + `\n[…剧本内容已截断，原长 ${s.content.length} 字符…]`
              : s.content;
          detail += `\n${content}`;
        }
        return detail;
      })
      .join('\n\n---\n\n');
    systemPrompt += `\n\n【项目剧本内容】\n${scriptDetails}`;
  }

  if (Array.isArray(context.scenes) && context.scenes.length > 0) {
    const lines = context.scenes
      .map((s: any) => {
        const flags: string[] = [];
        if (s.first_frame_url) flags.push('首帧✓');
        if (s.last_frame_url) flags.push('尾帧✓');
        if (s.video_url) flags.push('视频✓');
        const status = flags.length > 0 ? `[${flags.join(' ')}]` : '[未生成]';
        const desc = s.description ? String(s.description).slice(0, 50) : '';
        return `第${s.index}(ID:${s.id})${status} ${desc}`;
      })
      .join('\n');
    systemPrompt += `\n\n【项目分镜列表（按顺序）】\n${lines}`;
  }

  return systemPrompt;
}

/**
 * 组装发给厂商的 OpenAI messages：可选 system 提示词 + 转换后的对话。
 * 与后端 /chat 行为一致：仅使用 msg.content（attachments 不并入）。
 */
export function buildChatMessages(
  messages: ChatInputMessage[],
  systemPrompt?: string
): Array<{ role: string; content: unknown }> {
  const out: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  for (const msg of messages) {
    out.push({ role: msg.role || 'user', content: transformMessageContent(msg.content) });
  }
  return out;
}
