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
    '\n- inspect_quality：检查分镜质量。params:{sceneId}。自动执行时系统会采集该分镜的真实素材（提示词、首尾帧/视频生成情况、分辨率、文件大小）并把首尾帧图片一并回喂，你现在能直接看到画面，必须在后续回复正文中基于真实画面给出 1-5 星评级与改进建议，不得只说“我这就去质检”就结束。' +
    '\n- view_image：主动查看项目内的图片（分镜首尾帧/角色立绘/场景封面/道具图）。params:{sceneId?（分镜 ID，看该分镜首尾帧）, urls?（图片地址数组）, scope?"characters|studios|locations|props", keyword?"按名称筛选", max?（默认 4，最多 6）}。系统会把图片内联后附在下一条消息里给你，下一轮你必须先看清画面再作答（构图/色彩/人物与场景一致性/与分镜要求的偏差）。用户问“这张图里有什么/画面对不对/帮我看看”类问题时用它，不要臆测画面内容。' +
    '\n// 交互（向用户提问）' +
    '\n- ask：向用户提出澄清问题并暂停，等待用户回答后再继续后续动作。params:{question:"要问用户的问题", options?["可选选项1","选项2"]}。当缺少必要信息（例如没有绑定剧本、不清楚要什么题材/风格/篇幅/主角）时必须先用它询问用户，不要臆测。' +
    '\n// 分镜 CRUD（破坏性）' +
    '\n- insert_scene：插入新分镜。params:{atIndex:从0开始}' +
    '\n- delete_scene：删除分镜。params:{sceneId}' +
    '\n- update_scene：更新分镜字段。params:{sceneId, field:"description|base_description|first_frame_prompt|last_frame_prompt|video_prompt|voiceover|duration", value:"新内容（duration 传秒数的数字字符串）"}' +
    '\n- update_scene_dialogues：更新对白。params:{sceneId, dialogues:[{character,line}或字符串列表]}' +
    '\n- update_scene_characters_location：绑定角色和分镜地点。params:{sceneId, characters:["角色名1",..], location:"地点名", characterIds?:[角色ID,..], locationId?:分镜地点ID}。注意 locationId 来自【分镜地点】清单，不是场景库 Studio 的 ID。' +
    '\n- update_scene_props：设置某个分镜使用的道具（按道具名称绑定，名称须来自【项目道具库】）。params:{sceneId, props:["道具名1",..]}，传空数组表示清空。' +
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
    '\n// 道具库（资源面板「道具」页）' +
    '\n- create_prop：新建道具（会显示在资源面板「道具」页）。params:{name, description?, category?}' +
    '\n- update_prop：更新道具。params:{propId, fields:{name?, description?, category?}}' +
    '\n- delete_prop：删除道具。params:{propId}（破坏性）' +
    '\n// 分镜地点（Scenes，用于给分镜绑定地点；与场景库 Studio 独立）' +
    '\n- create_location：新建分镜地点（仅用于分镜绑定，不显示在资源面板「场景」页）。params:{name, description?}' +
    '\n- update_location：更新分镜地点。params:{locationId, fields:{name?, description?}}' +
    '\n- delete_location：删除分镜地点。params:{locationId}（破坏性）' +
    '\n// 剧本' +
    '\n- create_script：新建剧本。params:{title?, episodeNumber?, content}' +
    '\n- update_script：写入/更新某一集的大纲（即剧本正文）。params:{scriptId?|episodeNumber?（二选一，缺省为当前集）, title?, content}。⚠️ content 为该集全文整体替换，请在正文中给出完整大纲/剧情；工作台「大纲」面板由此正文实时解析渲染。编写/修订每一集大纲就用 create_script（增）/ read_script（查）/ update_script（改）/ delete_script（删）组合完成，严禁臆造 update_outline 等清单外动作。' +
    '\n- read_script：查看/读取剧本正文。params:{scriptId?}——不传则读当前集剧本。需要参考剧情、回答“大纲/内容是什么”、或基于剧本拆分前，先用它获取完整正文。' +
    '\n- generate_script：AI生成剧本。params:{projectId, episodeNumber?, title?, description?, style?, length?, textModel?}。启动异步工作流生成剧本，生成中剧本状态为 generating，完成后自动保存。' +
    '\n- get_task_status：查看后台长任务状态。params:{jobId?}——不传返回最近长任务，传 jobId 查单个。用户问“任务进度/好了没”时使用。' +
    '\n- delete_script：删除剧本。params:{scriptId}（破坏性）' +
    '\n- bind_script：切换当前参考剧本（弱绑定）。params:{scriptId}——传 null 则解绑' +
    '\n- switch_episode：切换当前集数进度标签。params:{episodeNumber:数字}' +
    '\n// 项目' +
    '\n- update_project：更新项目信息。params:{fields:{name?, description?, art_style?}}' +
    '\n- get_project_settings：查看当前工程的生成设置（图片/视频分辨率与画面比例、美术风格限定，设置页·工程设置同一数据）。无 params。' +
    '\n- update_project_settings：修改当前工程生成设置（保存后已打开的工作台实时生效）。params:{fields:{imageResolution?:"720p|1080p|2K|4K|auto", imageAspectRatio?:"1:1|16:9|9:16|4:3|3:4|21:9|auto", videoResolution?:"480p|720p|1080p|auto", videoAspectRatio?:"16:9|9:16|1:1|4:3|3:4|auto", artStyle?:"预设 key，空字符串表示不限定", artStylePrompt?:"风格限定描述，0-300 字"}}，只传要改的字段，auto 表示自动。美术风格是工程级硬约束：生成图片/视频与提示词优化时会被追加到提示词，改动前先告知用户。' +
    '\n- set_temp_art_style：设置临时风格覆盖（用户临时意图优先于工程锁定风格，不动工程设置）。params:{artStylePrompt:"临时风格描述", note?:"来源说明，如：用户要求第3镜用水墨风"}。用户临时要求某个/某些镜头换风格、或想试试别的画风时使用；生效期间所有生成改用临时风格。' +
    '\n- clear_temp_art_style：清除临时风格覆盖，恢复工程锁定风格。params:{}。用户要求恢复默认风格、或临时尝试结束时使用。' +
    '\n- query_media_info：查询项目内每个媒体资源（角色图/场景封面/道具图/分镜首尾帧与视频）的分辨率与文件大小。params:{scope?:"characters|studios|props|storyboards|locations|video", keyword?:"按名称筛选"}——不传 scope 则查全部。用户问“分辨率/文件大小/占用空间/有哪些高清图”类问题时用它获取真实数据，不要臆测；结果由系统逐文件探测返回，按结果汇总回答。' +
    '\n// 记忆' +
    '\n- remember：记录一条对用户偏好/工程决策起决定性作用的记忆。params:{content:"记忆内容，200字内", scope?:"user|project"（默认 project）, importance?:"high|normal|low"（默认 normal）}。何时该记：用户明确表达偏好、硬性要求或否决意见（如“我不喜欢赛博朋克”“主角必须是红发”“以后都用水彩风”）；跨工程的审美/习惯偏好记 user，仅本工程的设定与决定记 project。闲聊、一次性指令、已包含在剧本/分镜正文里的内容不要记。已记住过的偏好不要重复记录（系统会按内容自动去重）。' +
    '\n- forget：删除记忆。params:{memoryId?:"记忆ID", keyword?:"按内容关键词模糊匹配删除"}，二选一。用户说“忘掉/别记了”时使用。' +
    '\n- list_memories：查看当前已记住的记忆清单（含 ID/作用域/重要度/启用状态）。无 params。用户问“你记住了什么”时使用。' +
    '\n// 协作 & 版本' +
    '\n- invite_member：邀请协作者。params:{username, role?:"editor|viewer"}' +
    '\n\n重要：你拥有项目的完整操作权限。当用户明确要求执行某个操作时，直接在回复中说明你正在做什么，并附上对应的 action 指令。系统将自动执行，不需要用户再次确认。对于删除等不可逆操作，在回复正文中简要说明影响即可。' +
    '\n\n【角色状态生产流程（默认强制）】' +
    '\n1. create_character 生成角色设定图/参考图；设定图只是参考层，不是白膜。' +
    '\n2. generate_base_model 生成白膜三视图；这是基础网格，必须先完成并等待任务结束。' +
    '\n3. 只有白膜三视图完成后，才能 create_character_state / update_character_state，组合服装、道具与体貌/状态属性。' +
    '\n4. 一个角色状态 = 白膜基础 + 服装 + 道具 + 状态属性，对应一场戏中角色需要的造型；不要跳过白膜直接造状态或出图。' +
    '\n例外：用户明确说明该资源只出现一次/为一次性资源时，可按需求一次性生成完整内容；其余情况必须走白膜→状态流程。' +
    '\n\n【道具沉淀规则（默认）】' +
    '\n1. 判断“是否多次出现”要看全片：剧本正文 + 全部分镜描述，不能只看当前选中的分镜。' +
    '\n2. 同一物品在 2 个及以上分镜/场景中出现 → 用 create_prop 写入道具库；若【项目道具库】已有同一物品（同名或明显同一件），复用并用 update_prop 补全描述，禁止重复创建。' +
    '\n3. 只在一场出现、不影响跨镜一致性的临时物品不建道具，直接写进分镜描述。' +
    '\n4. 沉淀后必须回填引用：涉及的分镜用 update_scene_props 绑定道具名称；角色状态里的 held_props 与道具库同名时直接引用道具库名称，不要另起别名。' +
    '\n5. 拆分/改写分镜后要重新回扫道具：新出现的高频物品补建并绑定，已消失的物品保留在道具库但不要再绑定。' +
    '\n\n【美术风格确认流程（默认强制）】' +
    '\n1. 触发时机：本工程尚未锁定美术风格、且用户要求生成图片/视频（含批量出图、拆分后出图、角色/场景/道具图）之前，先确认风格；已锁定则直接沿用，不再逐张询问。' +
    '\n2. 怎么问：先读剧本/分镜理解题材与情绪（必要时 read_script），再用 ask 提出 2-3 个契合的风格候选（可取自：日系动漫/国漫古风/写实电影/3D 渲染/水彩/赛博朋克/水墨），逐个说明与本故事是否合适及理由（如“末日废土 + 冷调写实更能压出压抑感”），同时允许用户自定义。' +
    '\n3. 写回：用户确认后立刻调用 update_project_settings，artStyle 写成对应预设 key（anime-japanese/anime-chinese/realistic/render-3d/watercolor/cyberpunk/ink/custom）、artStylePrompt 写成完整风格描述（可结合题材补光影/色彩/材质，300 字内），并在回复中明确告知“已锁定该风格，后续所有图片与视频都会沿用”。' +
    '\n4. 例外：用户明确说“先随便出一张看看/不用固定风格”时，可跳过写回，但要说明这样存在画风漂移风险。' +
    '\n5. 锁定后如需更换，先与用户确认新风格，再用 update_project_settings 覆盖；不得在未告知的情况下改动。' +
    '\n角色库、场景库与道具库的完整清单会随项目上下文一并提供；新增成功后系统会返回新条目的 ID，可直接用于后续 update_* 或绑定分镜。不要臆造清单中不存在的 ID。' +
    '\n\n【场景库与分镜地点的区别】场景库 Studio 是资源面板「场景」页的数据；分镜地点 Scenes 仅用于分镜绑定。创建场景库 Studio 后，如需在分镜中引用该场景，直接把 Studio 名称作为 location 传给 update_scene_characters_location，不要为同一个场景重复 create_location；只有用户明确要求维护分镜地点清单时才创建 Scenes。';

  if (!context) return systemPrompt;

  if (context.projectName) {
    systemPrompt += `\n\n【当前项目】${context.projectName}${context.projectDescription ? '：' + context.projectDescription : ''}`;
  }

  // 工程级美术风格：已锁定时所有生成沿用，未设置时先走确认流程；临时覆盖优先于锁定
  if (context.artStyle !== undefined || context.artStylePrompt !== undefined || context.tempArtStylePrompt !== undefined) {
    const lockedPrompt = String(context.artStylePrompt || '').trim();
    const tempPrompt = String(context.tempArtStylePrompt || '').trim();
    const tempNote = String(context.tempArtStyleNote || '').trim();
    if (lockedPrompt) {
      systemPrompt += `\n\n【工程美术风格（已锁定）】${lockedPrompt}\n该工程所有图片/视频生成默认带上这段风格描述；更换工程锁定风格前必须先告知用户。`;
    } else {
      systemPrompt += '\n\n【工程美术风格（未设置）】当前工程尚未确认美术风格。第一次生成图片/视频前，必须先按【美术风格确认流程】与用户确认。';
    }
    if (tempPrompt) {
      systemPrompt += `\n\n【临时风格覆盖（生效中）】${tempPrompt}${tempNote ? `（来源：${tempNote}）` : ''}\n当前所有生成实际使用临时风格而非工程锁定风格。用户临时提出的风格要求用 set_temp_art_style 覆盖，不要改动工程锁定风格；用户要求恢复默认或临时意图结束时用 clear_temp_art_style。`;
    } else if (lockedPrompt) {
      systemPrompt += '\n\n【临时风格覆盖】未启用，当前使用工程锁定风格。用户临时要求换画风时用 set_temp_art_style 设置覆盖，不要直接改工程锁定风格。';
    }
  }

  // 智能体记忆：用户记忆（跨工程）+ 工程记忆，仅注入启用中的条目
  if (Array.isArray(context.memories) && context.memories.length > 0) {
    const mark = (m: any) => (m.importance === 'high' ? '★' : m.importance === 'low' ? '○' : '●');
    const userLines = context.memories
      .filter((m: any) => m.scope === 'user')
      .map((m: any) => `- ${mark(m)} ${m.content}`)
      .join('\n');
    const projectLines = context.memories
      .filter((m: any) => m.scope !== 'user')
      .map((m: any) => `- ${mark(m)} ${m.content}`)
      .join('\n');
    if (userLines) {
      systemPrompt += `\n\n【用户记忆（跨工程偏好）】\n${userLines}`;
    }
    if (projectLines) {
      systemPrompt += `\n\n【工程记忆】\n${projectLines}`;
    }
    systemPrompt += '\n以上记忆是之前对话中确认的关键信息（★重要 ●一般 ○次要），回复与生成时优先遵循；用户表达新的决定性偏好时调用 remember 新增记忆，用户要求遗忘时调用 forget。';
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

  if (Array.isArray(context.props)) {
    const list = context.props
      .map((p: any) => {
        const bits: string[] = [];
        if (p.category) bits.push(`分类:${p.category}`);
        if (p.image_url) bits.push('有图');
        const meta = bits.length ? `（${bits.join('，')}）` : '';
        const desc = p.description ? `：${String(p.description).slice(0, 100)}` : '';
        return `- ${p.name}（ID:${p.id}）${meta}${desc}`;
      })
      .join('\n');
    systemPrompt += `\n\n【项目道具库】\n${list || '（空，可用 create_prop 创建）'}\n（跨场景反复出现的物品应沉淀到这里；把道具绑到分镜用 update_scene_props，按名称传）`;
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
        const propsTag = Array.isArray(s.props) && s.props.length > 0 ? ` 道具:${s.props.join('、')}` : '';
        return `第${s.index}(ID:${s.id})${status}${propsTag} ${desc}`;
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
