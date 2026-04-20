/**
 * 工作流统一字段表
 * 
 * 所有工作流 handler 接收的字段名必须从此表中选取。
 * buildInputFactory.js 在编译期校验字段名是否合法。
 * 
 * 注意：
 *   这里现在只负责工作流 step 级输入字段，不再承担外部 HTTP 请求契约职责。
 *   外部请求的校验、归一化、默认值和作用域解析统一收口到 modules/generation。
 * 
 * 每个字段定义：
 *   from:         对应 jobParams 中的 key（运行时从 context.jobParams[from] 取值）
 *   defaultValue: 取不到时的默认值
 *   resolver:     自定义取值函数 (context) => value，优先级高于 from
 *   description:  字段说明（仅文档用途）
 *   category:     分类标签，方便查阅
 */

module.exports = {

  // ================================================================
  //  AI 模型（按类型严格区分，禁止使用 modelName）
  // ================================================================
  textModel: {
    from: 'textModel',
    defaultValue: null,
    description: '文本生成模型名称（剧本、分镜、提示词生成等）',
    category: 'model'
  },
  think: {
    from: 'think',
    defaultValue: false,
    description: '是否启用模型深度思考模式（bool）。由 customHandler 根据此标志拼接对应厂商的 thinking 参数到请求体中',
    category: 'model'
  },
  imageModel: {
    from: 'imageModel',
    defaultValue: null,
    description: '图片生成模型名称（角色图、场景图、帧图等）',
    category: 'model'
  },
  videoModel: {
    from: 'videoModel',
    defaultValue: null,
    description: '视频生成模型名称（分镜视频等）',
    category: 'model'
  },
  audioModel: {
    from: 'audioModel',
    defaultValue: null,
    description: '音频生成模型名称（配音、音效等，预留）',
    category: 'model'
  },

  // ================================================================
  // 模型标识
  // ================================================================
  

  // ================================================================
  //  通用标识
  // ================================================================
  projectId: {
    from: 'projectId',
    defaultValue: null,
    description: '项目 ID',
    category: 'id'
  },
  scriptId: {
    from: 'scriptId',
    defaultValue: null,
    description: '剧本 ID',
    category: 'id'
  },
  sceneId: {
    from: 'sceneId',
    defaultValue: null,
    description: '场景 ID',
    category: 'id'
  },
  characterId: {
    from: 'characterId',
    defaultValue: null,
    description: '角色 ID',
    category: 'id'
  },
  storyboardId: {
    from: 'storyboardId',
    defaultValue: null,
    description: '分镜 ID',
    category: 'id'
  },
  userId: {
    from: null,
    resolver: (ctx) => ctx.userId,
    defaultValue: null,
    description: '用户 ID（从 context.userId 取，非 jobParams）',
    category: 'id'
  },

  // ================================================================
  //  剧本相关
  // ================================================================
  title: {
    from: 'title',
    defaultValue: null,
    description: '剧本/项目标题',
    category: 'script'
  },
  description: {
    from: 'description',
    defaultValue: null,
    description: '描述文本（剧本描述、角色描述、场景描述等通用）',
    category: 'script'
  },
  style: {
    from: 'style',
    defaultValue: null,
    description: '风格（写实、动漫、赛博朋克等）',
    category: 'script'
  },
  length: {
    from: 'length',
    defaultValue: null,
    description: '剧本篇幅（短篇、中篇、长篇）',
    category: 'script'
  },
  episodeNumber: {
    from: 'episodeNumber',
    defaultValue: null,
    description: '集数编号',
    category: 'script'
  },
  scriptContent: {
    from: 'scriptContent',
    defaultValue: null,
    description: '剧本正文内容',
    category: 'script'
  },
  scriptTitle: {
    from: 'scriptTitle',
    defaultValue: null,
    description: '剧本标题（用于分镜生成等）',
    category: 'script'
  },

  // ================================================================
  //  场景相关
  // ================================================================
  sceneName: {
    from: 'sceneName',
    defaultValue: null,
    description: '场景名称',
    category: 'scene'
  },
  sceneContent: {
    from: 'sceneContent',
    defaultValue: null,
    description: '场景内容（用于按场景生成分镜）',
    category: 'scene'
  },
  sceneNumber: {
    from: 'sceneNumber',
    defaultValue: null,
    description: '场景序号（用于按场景生成分镜）',
    category: 'scene'
  },
  totalScenes: {
    from: 'totalScenes',
    defaultValue: null,
    description: '总场景数（用于按场景生成分镜）',
    category: 'scene'
  },
  previousSceneContext: {
    from: 'previousSceneContext',
    defaultValue: '',
    description: '上一场景的结束状态（用于保持连贯性）',
    category: 'scene'
  },
  appendMode: {
    from: 'appendMode',
    defaultValue: false,
    description: '追加模式（不删除旧分镜，直接追加）',
    category: 'scene'
  },
  clearExisting: {
    from: 'clearExisting',
    defaultValue: true,
    description: '是否清理现有分镜（批量分镜生成时使用）',
    category: 'scene'
  },
  environment: {
    from: 'environment',
    defaultValue: null,
    description: '环境描述',
    category: 'scene'
  },
  lighting: {
    from: 'lighting',
    defaultValue: null,
    description: '光照描述',
    category: 'scene'
  },
  mood: {
    from: 'mood',
    defaultValue: null,
    description: '氛围描述',
    category: 'scene'
  },
  scenes: {
    from: 'scenes',
    defaultValue: null,
    description: '场景列表（用于提取任务）',
    category: 'scene'
  },
  allScenes: {
    from: 'allScenes',
    defaultValue: [],
    description: '同项目所有场景摘要（用于风格一致性分析）',
    category: 'scene'
  },
  parsedScenes: {
    from: 'parsedScenes',
    defaultValue: [],
    description: '预解析的场景列表（批量分镜动态步骤用，包含 sceneNumber/sceneName/content）',
    category: 'scene'
  },
  referenceImageUrl: {
    from: 'referenceImageUrl',
    defaultValue: null,
    description: '风格参考图URL（由关联场景分析步骤输出）',
    category: 'scene'
  },
  styleDescription: {
    from: 'styleDescription',
    defaultValue: null,
    description: '风格一致性描述（由关联场景分析步骤输出）',
    category: 'scene'
  },

  // ================================================================
  //  角色相关
  // ================================================================
  characterName: {
    from: 'characterName',
    defaultValue: null,
    description: '角色名称',
    category: 'character'
  },
  appearance: {
    from: 'appearance',
    defaultValue: null,
    description: '外貌特征描述',
    category: 'character'
  },
  personality: {
    from: 'personality',
    defaultValue: null,
    description: '性格特点描述',
    category: 'character'
  },
  stateId: {
    from: 'stateId',
    defaultValue: null,
    description: '角色状态 ID',
    category: 'character'
  },
  isBaseModel: {
    from: 'isBaseModel',
    defaultValue: false,
    description: '是否生成白膜基础形态',
    category: 'character'
  },
  gender: {
    from: 'gender',
    defaultValue: 'unknown',
    description: '角色性别（male | female | unknown）',
    category: 'character'
  },
  outfit: {
    from: 'outfit',
    defaultValue: '',
    description: '角色状态服装描述',
    category: 'character'
  },
  hairstyle: {
    from: 'hairstyle',
    defaultValue: '',
    description: '角色状态发型描述',
    category: 'character'
  },
  accessories: {
    from: 'accessories',
    defaultValue: '',
    description: '角色状态配饰描述',
    category: 'character'
  },
  ageStage: {
    from: 'ageStage',
    defaultValue: '',
    description: '角色年龄阶段描述',
    category: 'character'
  },
  bodyElements: {
    from: 'bodyElements',
    defaultValue: '',
    description: '白膜身体元素描述（纹身、疤痕、胎记等永久性身体标记）',
    category: 'character'
  },
  frontViewUrl: {
    from: 'frontViewUrl',
    defaultValue: null,
    description: '角色正面视图URL（用于概念分解图参考）',
    category: 'character'
  },
  sideViewUrl: {
    from: 'sideViewUrl',
    defaultValue: null,
    description: '角色侧面视图URL（用于概念分解图参考）',
    category: 'character'
  },
  backViewUrl: {
    from: 'backViewUrl',
    defaultValue: null,
    description: '角色背面视图URL（用于概念分解图参考）',
    category: 'character'
  },

  // ================================================================
  //  批量控制
  // ================================================================
  overwriteFrames: {
    from: 'overwriteFrames',
    defaultValue: false,
    description: '是否覆盖已有首/首尾帧（批量生成时使用）',
    category: 'control'
  },
  overwriteVideos: {
    from: 'overwriteVideos',
    defaultValue: false,
    description: '是否覆盖已有视频（批量视频生成时使用）',
    category: 'control'
  },
  maxConcurrency: {
    from: 'maxConcurrency',
    defaultValue: 20,
    description: '最大并发数（批量任务使用，1~100）',
    category: 'control'
  },

  // ================================================================
  //  图片 / 视频生成
  // ================================================================
  prompt: {
    from: 'prompt',
    defaultValue: null,
    description: '生成提示词（图片/视频通用）',
    category: 'generation'
  },
  imageUrl: {
    from: 'imageUrl',
    defaultValue: null,
    description: '单张图片 URL（string，用于图生视频等）。模板占位符: {{imageUrl}}',
    category: 'generation'
  },
  imageUrls: {
    from: 'imageUrls',
    defaultValue: null,
    description: '图片 URL 数组（string[]，用于参考图/角色一致性等）。模板占位符: {{imageUrls}}',
    category: 'generation'
  },
  startFrame: {
    from: 'startFrame',
    defaultValue: null,
    description: '首帧图片 URL',
    category: 'generation'
  },
  endFrame: {
    from: 'endFrame',
    defaultValue: null,
    description: '尾帧图片 URL',
    category: 'generation'
  },
  width: {
    from: 'width',
    defaultValue: 1024,
    description: '输出宽度（像素）',
    category: 'generation'
  },
  height: {
    from: 'height',
    defaultValue: 1024,
    description: '输出高度（像素）',
    category: 'generation'
  },
  duration: {
    from: 'duration',
    defaultValue: null,
    description: '视频时长（秒）',
    category: 'generation'
  },
  aspectRatio: {
    from: 'aspectRatio',
    defaultValue: null,
    description: '画面比例（如 "16:9"、"9:16"、"1:1"）',
    category: 'generation'
  },
  resolution: {
    from: 'resolution',
    defaultValue: null,
    description: '清晰度（如 "1024"、"1536"、"2048"、"1080p"、"4K"）',
    category: 'generation'
  },

  // ================================================================
  //  管理后台
  // ================================================================
  apiDoc: {
    from: 'apiDoc',
    defaultValue: null,
    description: 'API 文档内容（智能解析用）',
    category: 'admin'
  },
  customPrompt: {
    from: 'customPrompt',
    defaultValue: null,
    description: '自定义提示词（智能解析用）',
    category: 'admin'
  },

  // ================================================================
  //  草图控制 (Sketch)
  // ================================================================
  sketchUrl: {
    from: 'sketchUrl',
    defaultValue: null,
    description: '草图文件 URL（用于草图转图片）',
    category: 'sketch'
  },
  sketchType: {
    from: 'sketchType',
    defaultValue: 'storyboard_sketch',
    description: '草图类型（storyboard_sketch | detailed_lineart）',
    category: 'sketch'
  },
  controlStrength: {
    from: 'controlStrength',
    defaultValue: 0.8,
    description: 'ControlNet 控制强度（0.0 ~ 1.0）',
    category: 'sketch'
  },
  processedSketchUrl: {
    from: 'processedSketchUrl',
    defaultValue: null,
    description: '预处理后的草图 URL（由预处理步骤输出）',
    category: 'sketch'
  },

  // ================================================================
  //  道具相关 (Prop)
  // ================================================================
  propId: {
    from: 'propId',
    defaultValue: null,
    description: '道具 ID',
    category: 'prop'
  },
  propName: {
    from: 'propName',
    defaultValue: null,
    description: '道具名称',
    category: 'prop'
  },
  propDescription: {
    from: 'propDescription',
    defaultValue: null,
    description: '道具描述',
    category: 'prop'
  },
  propCategory: {
    from: 'propCategory',
    defaultValue: null,
    description: '道具分类',
    category: 'prop'
  },
  propStyleConfig: {
    from: 'propStyleConfig',
    defaultValue: {},
    description: '道具样式配置（材质、颜色、尺寸等）',
    category: 'prop'
  },
  propImageUrl: {
    from: 'propImageUrl',
    defaultValue: null,
    description: '道具图片 URL',
    category: 'prop'
  },

  // ================================================================
  //  视角调整（Camera Control）
  // ================================================================
  compositeImageUrl: {
    from: 'compositeImageUrl',
    defaultValue: null,
    description: '画布合成图URL（由前端画布导出并上传）',
    category: 'camera'
  },
  sourceImageUrl: {
    from: 'sourceImageUrl',
    defaultValue: null,
    description: '原始帧图片URL（用于风格一致性参考）',
    category: 'camera'
  },
  rotationX: {
    from: 'rotationX',
    defaultValue: 0,
    description: 'X轴旋转角度（俯仰，-180~180）',
    category: 'camera'
  },
  rotationY: {
    from: 'rotationY',
    defaultValue: 0,
    description: 'Y轴旋转角度（偏航，-180~180）',
    category: 'camera'
  },
  rotationZ: {
    from: 'rotationZ',
    defaultValue: 0,
    description: 'Z轴旋转角度（翻滚，-180~180）',
    category: 'camera'
  },
  zoomLevel: {
    from: 'zoomLevel',
    defaultValue: 1,
    description: '缩放级别（0.2~3.0，<1扩图，>1聚焦）',
    category: 'camera'
  },
  mode: {
    from: 'mode',
    defaultValue: 'expand',
    description: '生成模式（expand=扩图，focus=聚焦）',
    category: 'camera'
  },

  // ================================================================
  //  重新生成控制
  // ================================================================
  regenerateOnly: {
    from: 'regenerateOnly',
    defaultValue: null,
    description: '仅重新生成指定视图（如 front/side/back），为 null 时生成全部',
    category: 'control'
  },

  // ================================================================
  //  小说工作台
  // ================================================================
  chapterId: {
    from: 'chapterId',
    defaultValue: null,
    description: '章节ID',
    category: 'novel'
  },
  chapterNumber: {
    from: 'chapterNumber',
    defaultValue: 1,
    description: '章节序号',
    category: 'novel'
  },
  chapterTitle: {
    from: 'chapterTitle',
    defaultValue: '',
    description: '章节标题',
    category: 'novel'
  },
  generationType: {
    from: 'generationType',
    defaultValue: 'full',
    description: '生成类型（full/continuation/revision）',
    category: 'novel'
  },
  worldView: {
    from: 'worldView',
    defaultValue: '',
    description: '小说世界观设定',
    category: 'novel'
  },
  plotSummary: {
    from: 'plotSummary',
    defaultValue: '',
    description: '剧情概要',
    category: 'novel'
  },
  prevSummaries: {
    from: 'prevSummaries',
    defaultValue: [],
    description: '前几章的剧情简述数组',
    category: 'novel'
  },
  existingContent: {
    from: 'existingContent',
    defaultValue: '',
    description: '已有章节内容（续写模式使用）',
    category: 'novel'
  }
};
