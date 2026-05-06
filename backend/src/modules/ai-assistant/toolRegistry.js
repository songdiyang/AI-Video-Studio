/**
 * AI 助手工具注册表
 *
 * 将 nosyntask 的 workflow 定义包装成 AI 可调用的工具(function calling)。
 *
 * 职责：
 * - 向 LLM 暴露工具 schema（JSON Schema for function calling）
 * - 接收 LLM 返回的 tool_call（name + args），启动对应子 workflow
 * - 子 workflow 通过 parent_job_id 关联到 AI 助手主 workflow
 * - 统一入口做参数校验，未知工具/非法参数直接拒绝
 */

const workflowEngine = require('../../nosyntask/engine');

/**
 * 工具定义数组
 * 每个工具：
 *   - name:         LLM 使用的名字
 *   - description:  给 LLM 的说明
 *   - parameters:   JSON Schema，用于 function calling
 *   - workflowType: 对应 nosyntask 工作流
 *   - buildJobParams(args, ctx): 将 LLM 参数映射为 workflow jobParams
 *   - buildProjectId(args, ctx): 取 projectId（默认 ctx.projectId）
 */
const TOOLS = [
  // ================================================================
  //  角色相关
  // ================================================================
  {
    name: 'generate_character_views',
    description: '为指定角色生成白膜三视图（正面/侧面/背面）。适用于项目已有角色，需要生成或重新生成外观视图的场景。',
    parameters: {
      type: 'object',
      properties: {
        characterId: { type: 'number', description: '角色 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称，若未指定使用项目默认' }
      },
      required: ['characterId']
    },
    workflowType: 'character_views_generation',
    buildJobParams: (args, ctx) => ({
      characterId: args.characterId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_character_state_views',
    description: '为指定角色的特定状态生成三视图。适用于需要为角色的特定服装/发型/年龄状态生成外观视图。',
    parameters: {
      type: 'object',
      properties: {
        characterId: { type: 'number', description: '角色 ID（必填）' },
        stateId: { type: 'number', description: '角色状态 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['characterId', 'stateId']
    },
    workflowType: 'character_state_views_generation',
    buildJobParams: (args, ctx) => ({
      characterId: args.characterId,
      stateId: args.stateId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_costume_views',
    description: '为指定服装生成设定图。适用于需要为角色的特定服装生成独立设定图的场景。',
    parameters: {
      type: 'object',
      properties: {
        costumeId: { type: 'number', description: '服装 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['costumeId']
    },
    workflowType: 'costume_views_generation',
    buildJobParams: (args, ctx) => ({
      costumeId: args.costumeId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_character_concept_breakdown',
    description: '为指定角色生成概念分解图（将角色外观拆解为多个可独立调整的元素）。',
    parameters: {
      type: 'object',
      properties: {
        characterId: { type: 'number', description: '角色 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['characterId']
    },
    workflowType: 'character_concept_breakdown',
    buildJobParams: (args, ctx) => ({
      characterId: args.characterId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  // ================================================================
  //  场景/影棚相关
  // ================================================================
  {
    name: 'generate_scene_image',
    description: '为指定场景生成场景图片。适用于需要为已有场景生成视觉表现的场景。',
    parameters: {
      type: 'object',
      properties: {
        sceneId: { type: 'number', description: '场景 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['sceneId']
    },
    workflowType: 'scene_image_generation',
    buildJobParams: (args, ctx) => ({
      sceneId: args.sceneId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'extract_scene_elements',
    description: '从场景描述中抽取建筑、道具等元素清单。适用于需要为场景创建独立元素资产的场景。',
    parameters: {
      type: 'object',
      properties: {
        sceneId: { type: 'number', description: '场景 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['sceneId']
    },
    workflowType: 'scene_elements_extraction',
    buildJobParams: (args, ctx) => ({
      sceneId: args.sceneId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_scene_element',
    description: '为指定场景元素生成独立立绘图片。',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'number', description: '场景元素 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['elementId']
    },
    workflowType: 'scene_element_generation',
    buildJobParams: (args, ctx) => ({
      elementId: args.elementId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_environment_image',
    description: '为指定环境生成氛围图。适用于需要为影棚环境生成视觉表现的场景。',
    parameters: {
      type: 'object',
      properties: {
        environmentId: { type: 'number', description: '环境 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['environmentId']
    },
    workflowType: 'environment_image_generation',
    buildJobParams: (args, ctx) => ({
      environmentId: args.environmentId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_building_image',
    description: '为指定建筑生成结构图。适用于需要为影棚建筑生成视觉表现的场景。',
    parameters: {
      type: 'object',
      properties: {
        buildingId: { type: 'number', description: '建筑 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['buildingId']
    },
    workflowType: 'building_image_generation',
    buildJobParams: (args, ctx) => ({
      buildingId: args.buildingId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_studio_nine_grid',
    description: '为指定影棚生成九宫组装图（3×3九机位视角图）。',
    parameters: {
      type: 'object',
      properties: {
        studioId: { type: 'number', description: '影棚 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['studioId']
    },
    workflowType: 'studio_nine_grid_generation',
    buildJobParams: (args, ctx) => ({
      studioId: args.studioId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_variant_faces',
    description: '为环境变体生成8方位场景图。',
    parameters: {
      type: 'object',
      properties: {
        environmentId: { type: 'number', description: '环境 ID（必填）' },
        variantId: { type: 'number', description: '变体 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['environmentId', 'variantId']
    },
    workflowType: 'variant_faces_generation',
    buildJobParams: (args, ctx) => ({
      environmentId: args.environmentId,
      variantId: args.variantId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'extract_studio_components',
    description: '从剧本中拆分环境与建筑元素。适用于剧本导入后需要自动创建影棚组件的场景。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: '项目 ID（必填）' },
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['projectId', 'scriptId']
    },
    workflowType: 'studio_components_extraction',
    buildJobParams: (args, ctx) => ({
      projectId: args.projectId,
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId
    })
  },
  {
    name: 'compose_studio_from_script',
    description: '从剧本组装影棚（环境+建筑组合）。适用于已完成环境与建筑拆分后需要组装影棚的场景。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: '项目 ID（必填）' },
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['projectId', 'scriptId']
    },
    workflowType: 'studio_compose_from_script',
    buildJobParams: (args, ctx) => ({
      projectId: args.projectId,
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId
    })
  },

  // ================================================================
  //  分镜相关
  // ================================================================
  {
    name: 'generate_storyboards',
    description: '为指定剧本智能拆分生成分镜（单步骤模式）。适用于需要从剧本生成分镜文本的场景。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'storyboard_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_storyboards_batch',
    description: '为指定剧本批量生成分镜（按场景拆分并行处理）。输入剧本 ID，系统会把剧本按场景拆分并为每个场景生成分镜。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_storyboard_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_frames_batch',
    description: '为指定剧本的所有分镜批量生成首尾帧图片。前置：已完成分镜生成。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_frame_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_frames_parallel',
    description: '为指定剧本的所有分镜并发生成首尾帧图片（独立模式，不保持连贯性）。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['scriptId']
    },
    workflowType: 'parallel_frame_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_frame',
    description: '为单个分镜生成首尾帧图片（有动作的分镜）。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        prompt: { type: 'string', description: '生成提示词（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['storyboardId', 'prompt']
    },
    workflowType: 'frame_generation',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      prompt: args.prompt,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_single_frame',
    description: '为单个分镜生成单帧图片（无动作的分镜）。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        description: { type: 'string', description: '分镜描述（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['storyboardId', 'description']
    },
    workflowType: 'single_frame_generation',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      description: args.description,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_scene_video',
    description: '为单个分镜生成视频。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        videoModel: { type: 'string', description: '视频模型名称（必填）' }
      },
      required: ['storyboardId', 'videoModel']
    },
    workflowType: 'scene_video',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      videoModel: args.videoModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_videos_batch',
    description: '为指定剧本的所有分镜批量生成视频。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        videoModel: { type: 'string', description: '视频模型名称（必填）' }
      },
      required: ['scriptId', 'videoModel']
    },
    workflowType: 'batch_scene_video_generation',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      videoModel: args.videoModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  // ================================================================
  //  提示词优化
  // ================================================================
  {
    name: 'optimize_storyboard_prompts',
    description: '批量优化指定剧本下所有分镜的提示词（通用）。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_prompt_optimization',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'optimize_image_prompts',
    description: '批量优化指定剧本下所有分镜的图片提示词。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_image_prompt_optimization',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'optimize_video_prompts',
    description: '批量优化指定剧本下所有分镜的视频提示词。',
    parameters: {
      type: 'object',
      properties: {
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型' }
      },
      required: ['scriptId']
    },
    workflowType: 'batch_video_prompt_optimization',
    buildJobParams: (args, ctx) => ({
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  // ================================================================
  //  道具相关
  // ================================================================
  {
    name: 'generate_prop_views',
    description: '为指定道具生成设定图。',
    parameters: {
      type: 'object',
      properties: {
        propId: { type: 'number', description: '道具 ID（必填）' },
        imageModel: { type: 'string', description: '图片生成模型名称' }
      },
      required: ['propId']
    },
    workflowType: 'prop_views_generation',
    buildJobParams: (args, ctx) => ({
      propId: args.propId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'extract_script_props',
    description: '从剧本中提取道具清单。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: '项目 ID（必填）' },
        scriptId: { type: 'number', description: '剧本 ID（必填）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['projectId', 'scriptId']
    },
    workflowType: 'script_props_extraction',
    buildJobParams: (args, ctx) => ({
      projectId: args.projectId,
      scriptId: args.scriptId,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId
    })
  },

  // ================================================================
  //  魔术空间
  // ================================================================
  {
    name: 'generate_camera_frame',
    description: '魔术空间-视角帧生成。基于合成图和视角参数生成新帧。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        compositeImageUrl: { type: 'string', description: '画布合成图URL（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' },
        rotationX: { type: 'number', description: 'X轴旋转角度' },
        rotationY: { type: 'number', description: 'Y轴旋转角度' },
        rotationZ: { type: 'number', description: 'Z轴旋转角度' },
        zoomLevel: { type: 'number', description: '缩放级别' },
        mode: { type: 'string', enum: ['expand', 'focus'], description: 'expand=扩图，focus=聚焦' }
      },
      required: ['storyboardId', 'compositeImageUrl']
    },
    workflowType: 'camera_frame_generation',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      compositeImageUrl: args.compositeImageUrl,
      imageModel: args.imageModel || ctx.defaultImageModel,
      rotationX: args.rotationX || 0,
      rotationY: args.rotationY || 0,
      rotationZ: args.rotationZ || 0,
      zoomLevel: args.zoomLevel || 1,
      mode: args.mode || 'expand',
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_magic_paint',
    description: '魔术空间-涂改帧生成。基于颜色涂抹和文字指令修改帧图。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        compositeImageUrl: { type: 'string', description: '画布合成图URL（必填）' },
        maskImageUrl: { type: 'string', description: '黑白掩膜图URL（必填）' },
        colorInstructions: { type: 'array', description: '颜色指令数组' },
        imageModel: { type: 'string', description: '图片模型名称' }
      },
      required: ['storyboardId', 'compositeImageUrl', 'maskImageUrl']
    },
    workflowType: 'magic_paint_generation',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      compositeImageUrl: args.compositeImageUrl,
      maskImageUrl: args.maskImageUrl,
      colorInstructions: args.colorInstructions || [],
      imageModel: args.imageModel || ctx.defaultImageModel,
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },
  {
    name: 'generate_hd_repair',
    description: '高清修复帧生成。以现有帧为参考，高分辨率重新生成。',
    parameters: {
      type: 'object',
      properties: {
        storyboardId: { type: 'number', description: '分镜 ID（必填）' },
        imageModel: { type: 'string', description: '图片模型名称' },
        targetFrame: { type: 'string', enum: ['first', 'last'], description: '修复目标帧' }
      },
      required: ['storyboardId']
    },
    workflowType: 'hd_repair_generation',
    buildJobParams: (args, ctx) => ({
      storyboardId: args.storyboardId,
      imageModel: args.imageModel || ctx.defaultImageModel,
      targetFrame: args.targetFrame || 'first',
      userId: ctx.userId,
      projectId: ctx.projectId
    })
  },

  // ================================================================
  //  剧本相关
  // ================================================================
  {
    name: 'generate_script',
    description: '生成剧本。适用于需要为项目创建新剧本的场景。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: '项目 ID（必填）' },
        title: { type: 'string', description: '剧本标题' },
        description: { type: 'string', description: '剧本描述' },
        style: { type: 'string', description: '风格（如电影感、动漫）' },
        length: { type: 'string', description: '篇幅（短篇/中篇/长篇）' },
        episodeNumber: { type: 'number', description: '集数编号' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['projectId', 'episodeNumber']
    },
    workflowType: 'script_only',
    buildJobParams: (args, ctx) => ({
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      style: args.style,
      length: args.length,
      episodeNumber: args.episodeNumber,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId
    })
  },
  {
    name: 'split_script',
    description: '将长剧本按高潮点拆分为多集。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: '项目 ID（必填）' },
        rawText: { type: 'string', description: '原始长文本（必填）' },
        minutesPerEpisode: { type: 'number', description: '每集目标分钟数（1/3/5/10）' },
        textModel: { type: 'string', description: '文本模型名称' }
      },
      required: ['projectId', 'rawText']
    },
    workflowType: 'script_split',
    buildJobParams: (args, ctx) => ({
      projectId: args.projectId,
      rawText: args.rawText,
      minutesPerEpisode: args.minutesPerEpisode || 3,
      textModel: args.textModel || ctx.defaultTextModel,
      userId: ctx.userId
    })
  }
];

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]));

/**
 * 生成 OpenAI/DeepSeek function calling 兼容的 tools schema
 * @param {object} scope - 作用域过滤（预留）
 */
function getToolsSchema(scope = {}) {
  return TOOLS.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

/**
 * 列出所有工具的元数据（供前端展示）
 */
function listTools() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    workflowType: tool.workflowType
  }));
}

/**
 * 校验 LLM 返回的工具调用参数
 * @returns { valid: boolean, tool, args, error }
 */
function validateToolCall(toolName, rawArgs) {
  const tool = TOOL_MAP.get(toolName);
  if (!tool) {
    return { valid: false, error: `未知工具: ${toolName}` };
  }

  let args;
  if (typeof rawArgs === 'string') {
    try { args = JSON.parse(rawArgs); } catch (e) {
      return { valid: false, tool, error: `参数不是合法 JSON: ${e.message}` };
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    args = rawArgs;
  } else {
    return { valid: false, tool, error: '参数必须是对象或 JSON 字符串' };
  }

  // 简单必填校验（不做完整 JSON Schema 校验，留给子 workflow 的 contract 做）
  const required = tool.parameters.required || [];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return { valid: false, tool, args, error: `缺少必填字段: ${field}` };
    }
  }

  return { valid: true, tool, args };
}

/**
 * 启动子 workflow
 *
 * @param {object} params
 * @param {string} params.toolName
 * @param {object} params.args - 已通过 validateToolCall 校验的参数
 * @param {object} params.actor - { userId, projectId }
 * @param {object} params.defaults - { defaultTextModel, defaultImageModel } 供 buildJobParams 使用
 * @param {number} params.parentJobId - 父 workflow id
 * @returns {Promise<{ jobId, workflowType, toolName }>}
 */
async function invokeTool({ toolName, args, actor, defaults = {}, parentJobId }) {
  const tool = TOOL_MAP.get(toolName);
  if (!tool) throw new Error(`未知工具: ${toolName}`);

  const ctx = {
    userId: actor.userId,
    projectId: actor.projectId,
    ...defaults
  };

  const jobParams = tool.buildJobParams(args, ctx);
  const projectId = jobParams.projectId ?? actor.projectId ?? null;

  const result = await workflowEngine.startWorkflow(tool.workflowType, {
    userId: actor.userId,
    projectId,
    jobParams,
    parentJobId,
    metadata: {
      source: 'ai_assistant',
      toolName,
      toolArgs: args
    }
  });

  return {
    jobId: result.jobId,
    workflowType: tool.workflowType,
    toolName,
    tasks: result.tasks
  };
}

module.exports = {
  getToolsSchema,
  listTools,
  validateToolCall,
  invokeTool
};
