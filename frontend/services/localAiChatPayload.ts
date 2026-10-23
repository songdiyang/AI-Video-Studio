// AI 助手聊天载荷组装（离线直连层复用）
//
// 从原后端 aiAssistantRoutes 忠实移植的纯函数（backend 目录已删除），供离线聊天/增强/压缩使用：
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
 * OpenAI: [{type: "image_url", image_url: {url: "..."}}]
 * 处理器: [{type: "input_image", image_url: "..."}]
 */
export function transformMessageContent(content: unknown): unknown {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');

  return (content as any[]).map((item) => {
    switch (item.type) {
      case 'text':
        return { type: 'text', text: item.text || '' };
      case 'image':
        // 前端格式：{type: 'image', url: '...'}
        return { type: 'image_url', image_url: { url: item.url || '' } };
      case 'image_url':
        // 已经是 OpenAI 格式，直接返回
        return item;
      case 'video':
        return { type: 'video_url', video_url: { url: item.url || '' } };
      case 'video_url':
        return item;
      case 'file':
        // DeepSeek 文件引用：{ type: 'file', file_id: 'file-api-xxx' } 原样透传
        if (item.file_id) return { type: 'file', file_id: item.file_id };
        return { type: 'file', file: { url: item.url || '' } };
      default:
        // 如果已经是正确的格式（text/image_url/video_url等），直接返回
        if (['text', 'image_url', 'video_url', 'file'].includes(item.type)) return item;
        if (item.text) return { type: 'text', text: item.text };
        return { type: 'text', text: JSON.stringify(item) };
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

  // 推理/思考类模型常把结论留在 reasoning_content 而正文为空，这里强制要求单独输出面向用户的最终回复
  systemPrompt +=
    '\n\n【输出要求】思考/推理过程不会展示给用户，务必在思考结束后单独输出一段完整、面向用户的最终回复正文，不要只留下思考内容。';

  // 行动协议 + action 清单（与后端 buildSystemPrompt 对齐）：
  // 离线聊天同样走 [SUGGESTIONS] 文本协议，前端解析并自动执行。
  // 必须在任何上下文存在与否时都告知模型该格式，否则模型会臆造   等伪工具调用文本。
  systemPrompt +=
    '\n\n当用户要求你执行操作时，直接在回复中告诉用户你正在做什么，并在末尾附上 action 指令，系统会自动执行。格式：\n[SUGGESTIONS]{"suggestions":[{"action":"操作标识","label":"执行内容描述","params":{}}]}[/SUGGESTIONS]\n你可以在一次回复中附带多个 action 指令，系统会依次自动执行。纯闲聊或简单提问不需要 SUGGESTIONS。注意：只能使用下方清单中的 action，严禁使用   或其他自定义的工具调用格式。';

  systemPrompt +=
    '\n\n【可用 action 清单】' +
    '\n// 分镜生成与质检' +
    '\n- generate_frame：生成首尾帧图片。params:{sceneId}' +
    '\n- generate_video：生成视频。params:{sceneId}' +
    '\n- upload_material：上传分镜素材。params:{sceneId}' +
    '\n- optimize_prompt：优化分镜提示词。params:{sceneId}' +
    '\n- auto_storyboard：由当前绑定的剧本自动拆分分镜。⚠️ 前置条件：必须已有绑定的剧本（currentScriptId 存在）；若当前没有剧本，禁止直接调用它，必须先用 ask 询问用户想要什么样的故事，收到回答后用 generate_script 生成剧本，再 auto_storyboard 拆分。' +
    '\n- inspect_quality：检查分镜质量。params:{sceneId}。视频>图片>提示词 降级，1-5 星评级 + 改进建议。' +
    '\n// 交互（向用户提问）' +
    '\n- ask：向用户提出澄清问题并暂停，等待用户回答后再继续后续动作。params:{question:"要问用户的问题", options?["可选选项1","选项2"]}。当缺少必要信息（例如没有绑定剧本、不清楚要什么题材/风格/篇幅/主角）时必须先用它询问用户，不要臆测。' +
    '\n// 分镜 CRUD（破坏性）' +
    '\n- insert_scene：插入新分镜。params:{atIndex:从0开始}' +
    '\n- delete_scene：删除分镜。params:{sceneId}' +
    '\n- update_scene：更新分镜字段。params:{sceneId, field:"description|base_description|first_frame_prompt|last_frame_prompt|video_prompt|voiceover|duration", value:"新内容（duration 传秒数的数字字符串）"}' +
    '\n- update_scene_dialogues：更新对白。params:{sceneId, dialogues:[{character,line}或字符串列表]}' +
    '\n- update_scene_characters_location：绑定角色和分镜地点。params:{sceneId, characters:["角色名1",..], location:"地点名", characterIds?:[角色ID,..], locationId?:分镜地点ID}。注意 locationId 来自【分镜地点】清单，不是场景库 Studio 的 ID。' +
    '\n- move_scene：上移/下移一步。params:{sceneId, direction:"up|down"}' +
    '\n- reorder_scenes：按给定顺序重排。params:{sceneIds:[ID1,ID2,..]}' +
    '\n// 角色库（资源面板「角色」页）' +
    '\n- create_character：新建角色。params:{name, description?, appearance?, base_appearance?, outfit_appearance?, personality?, gender?, tags?}。仅生成角色设定图/参考图，不是白膜。' +
    '\n- update_character：更新角色字段。params:{characterId, fields:{name?, description?, appearance?, base_appearance?, outfit_appearance?, personality?, gender?, tags?}}' +
    '\n- delete_character：删除角色。params:{characterId}（破坏性）' +
    '\n- generate_base_model：生成白膜三视图（基础网格）。params:{characterId}。默认强制流程：白膜三视图完成前不能创建派生状态；生成期间按长任务反馈。' +
    '\n- create_character_state：在白膜三视图完成后创建角色状态。params:{characterId, name, description?, state_category?, outfit?, age_stage?, hairstyle?, accessories?, body_elements?, held_props?, costume_id?, tags?}。状态 = 白膜基础 + 服装 + 道具 + 状态属性，对应一场戏中角色需要的造型。' +
    '\n- update_character_state：更新角色状态。params:{characterId, stateId, fields:{...}}。白膜三视图未完成时禁止修改派生状态。' +
    '\n// 场景库（资源面板「场景」页，Studio：环境+建筑）' +
    '\n- create_studio：新建场景库条目（会显示在资源面板「场景」页）。params:{name, description?, coverImageUrl?}' +
    '\n- update_studio：更新场景库条目。params:{studioId, fields:{name?, description?, coverImageUrl?}}' +
    '\n- delete_studio：删除场景库条目。params:{studioId}（破坏性）' +
    '\n// 分镜地点（Scenes，用于给分镜绑定地点；与场景库 Studio 独立）' +
    '\n- create_location：新建分镜地点（仅用于分镜绑定，不显示在资源面板「场景」页）。params:{name, description?}' +
    '\n- update_location：更新分镜地点。params:{locationId, fields:{name?, description?}}' +
    '\n- delete_location：删除分镜地点。params:{locationId}（破坏性）' +
    '\n// 剧本' +
    '\n- create_script：新建剧本。params:{title?, episodeNumber?, content}' +
    '\n- read_script：查看/读取剧本正文。params:{scriptId?}——不传则读当前集剧本。需要参考剧情、回答“大纲/内容是什么”、或基于剧本拆分前，先用它获取完整正文。' +
    '\n- generate_script：AI生成剧本。params:{projectId, episodeNumber?, title?, description?, style?, length?, textModel?}。启动异步工作流生成剧本，生成中剧本状态为 generating，完成后自动保存。' +
    '\n- get_task_status：查看后台长任务状态。params:{jobId?}——不传返回最近长任务，传 jobId 查单个。用户问“任务进度/好了没”时使用。' +
    '\n- delete_script：删除剧本。params:{scriptId}（破坏性）' +
    '\n- bind_script：切换当前参考剧本（弱绑定）。params:{scriptId}——传 null 则解绑' +
    '\n- switch_episode：切换当前集数进度标签。params:{episodeNumber:数字}' +
    '\n// 项目' +
    '\n- update_project：更新项目信息。params:{fields:{name?, description?, art_style?}}' +
    '\n// 协作 & 版本' +
    '\n- invite_member：邀请协作者。params:{username, role?:"editor|viewer"}' +
    '\n\n重要：你拥有项目的完整操作权限。当用户明确要求执行某个操作时，直接在回复中说明你正在做什么，并附上对应的 action 指令。系统将自动执行，不需要用户再次确认。对于删除等不可逆操作，在回复正文中简要说明影响即可。' +
    '\n\n【角色状态生产流程（默认强制）】' +
    '\n1. create_character 生成角色设定图/参考图；设定图只是参考层，不是白膜。' +
    '\n2. generate_base_model 生成白膜三视图；这是基础网格，必须先完成并等待任务结束。' +
    '\n3. 只有白膜三视图完成后，才能 create_character_state / update_character_state，组合服装、道具与体貌/状态属性。' +
    '\n4. 一个角色状态 = 白膜基础 + 服装 + 道具 + 状态属性，对应一场戏中角色需要的造型；不要跳过白膜直接造状态或出图。' +
    '\n例外：用户明确说明该资源只出现一次/为一次性资源时，可按需求一次性生成完整内容；其余情况必须走白膜→状态流程。' +
    '\n角色库与场景库的完整清单会随项目上下文一并提供；新增成功后系统会返回新条目的 ID，可直接用于后续 update_* 或绑定分镜。不要臆造清单中不存在的 ID。' +
    '\n\n【场景库与分镜地点的区别】场景库 Studio 是资源面板「场景」页的数据；分镜地点 Scenes 仅用于分镜绑定。创建场景库 Studio 后，如需在分镜中引用该场景，直接把 Studio 名称作为 location 传给 update_scene_characters_location，不要为同一个场景重复 create_location；只有用户明确要求维护分镜地点清单时才创建 Scenes。';

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

  if (Array.isArray(context.characters)) {
    const list = context.characters
      .map((c: any) => {
        const bits: string[] = [];
        if (c.active_state_name) bits.push(`当前造型:${c.active_state_name}`);
        if (c.states_count != null) bits.push(`造型数:${c.states_count}`);
        if (c.has_base_model_views) bits.push('白膜已建');
        const meta = bits.length ? `（${bits.join('，')}）` : '';
        const appearance = c.appearance || c.base_appearance || c.outfit_appearance || c.description;
        const desc = appearance ? `：${String(appearance).slice(0, 120)}` : '';
        return `- ${c.name}（ID:${c.id}）${meta}${desc}`;
      })
      .join('\n');
    systemPrompt += `\n\n【项目角色库】\n${list || '（空，可用 create_character 创建）'}`;
  }

  if (Array.isArray(context.studios)) {
    const list = context.studios
      .map((s: any) => {
        const bits: string[] = [];
        if (s.environment_name) bits.push(`环境:${s.environment_name}`);
        if (Array.isArray(s.building_names) && s.building_names.length) bits.push(`建筑:${s.building_names.join('、')}`);
        if (s.cover_image_url) bits.push('有封面');
        const meta = bits.length ? `（${bits.join('，')}）` : '';
        const desc = s.description ? `：${String(s.description).slice(0, 100)}` : '';
        return `- ${s.name}（ID:${s.id}）${meta}${desc}`;
      })
      .join('\n');
    systemPrompt += `\n\n【项目场景库（Studio）】\n${list || '（空，可用 create_studio 创建）'}`;
  }

  if (Array.isArray(context.locations)) {
    const list = context.locations
      .map((l: any) => {
        const desc = l.description ? `：${String(l.description).slice(0, 80)}` : '';
        return `- ${l.name}（ID:${l.id}）${desc}`;
      })
      .join('\n');
    systemPrompt += `\n\n【分镜地点（Scenes，用于绑定分镜）】\n${list || '（空；通常无需单独创建，绑定场景时可直接使用场景库 Studio 名称）'}`;
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
    systemPrompt += `\n\n【项目分镜列表（按顺序）】\n${lines}\n\n当用户说"第X个分镜"时，请根据上面列表匹配对应的分镜ID，并在 action 的 params 中传入正确的 sceneId。`;
  }

  if (Array.isArray(context.longTasks) && context.longTasks.length > 0) {
    const statusLabel: Record<string, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    const lines = context.longTasks
      .map((task: any) => {
        const count = task.total > 0 ? `（${task.current || 0}/${task.total}）` : '';
        const error = task.error ? `，错误：${task.error}` : '';
        return `- [${task.jobId}] ${task.title}：${statusLabel[task.status] || task.status} ${task.progress || 0}%${count}${error}`;
      })
      .join('\n');
    systemPrompt += `\n\n【后台长任务】\n${lines}\n\n这些长任务在后台执行，用户可以继续其他操作；完成后会通过站内信通知。用户询问进度时按上述状态回答，不要虚构进度；需要最新状态时可调用 get_task_status。`;
  }

  return systemPrompt;
}

/**
 * 组装发给厂商的 OpenAI messages：可选 system 提示词 + 转换后的对话。
 * 支持多模态：将 attachments 合并到 content 中。
 */
export function buildChatMessages(
  messages: ChatInputMessage[],
  systemPrompt?: string,
  provider?: string
): Array<{ role: string; content: unknown }> {
  // DeepSeek 通过 { type:'file', file_id } 内容块引用已上传文件（而非 image_url + file://）
  const isDeepSeek = (provider || '').toLowerCase().includes('deepseek');
  const out: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  
  for (const msg of messages) {
    // 如果有附件，需要将文本和附件合并为多模态内容
    if (msg.attachments && msg.attachments.length > 0) {
      const contentParts: any[] = [];
      
      // 添加文本内容
      if (msg.content) {
        const textContent = typeof msg.content === 'string' ? msg.content : String(msg.content);
        if (textContent.trim()) {
          contentParts.push({ type: 'text', text: textContent });
        }
      }
      
      // 添加附件内容
      for (const att of msg.attachments) {
        if (att.type === 'image' && att.url) {
          // 检查是否为 file_id（file:// 前缀）
          if (att.url.startsWith('file://')) {
            const fileId = att.url.replace('file://', '');
            if (isDeepSeek) {
              // DeepSeek：用 { type:'file', file_id } 内容块引用已上传文件
              contentParts.push({ type: 'file', file_id: fileId });
            } else {
              // 其他厂商暂以 image_url 透传（方案 A 待补 base64 还原）
              contentParts.push({ type: 'image_url', image_url: { url: att.url } });
            }
          } else {
            // Base64 或 HTTP URL
            contentParts.push({ type: 'image_url', image_url: { url: att.url } });
          }
        } else if (att.type === 'video' && att.url) {
          // 检查是否为 file_id（file:// 前缀）
          if (att.url.startsWith('file://')) {
            const fileId = att.url.replace('file://', '');
            contentParts.push({ 
              type: 'video_url', 
              video_url: { url: `file://${fileId}` } 
            });
          } else {
            contentParts.push({ type: 'video_url', video_url: { url: att.url } });
          }
        }
      }
      
      // 如果有多模态内容，使用数组格式；否则使用原始 content
      const finalContent = contentParts.length > 0 ? contentParts : msg.content;
      out.push({ role: msg.role || 'user', content: transformMessageContent(finalContent) });
    } else {
      // 没有附件，直接转换 content
      out.push({ role: msg.role || 'user', content: transformMessageContent(msg.content) });
    }
  }
  
  return out;
}
