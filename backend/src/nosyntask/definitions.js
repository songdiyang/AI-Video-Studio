/**
 * 工作流定义系统
 * 
 * 设计原则：
 * 1. 任务只负责调用 AI，返回 result_data（纯数据）
 * 2. 工作流引擎负责串联步骤、传递数据
 * 3. 副作用操作（保存数据库、扣费等）由各步骤的 onComplete 回调处理
 * 4. 每个步骤的 buildInput 由 createBuildInput 工厂生成，字段名从统一字段表中选取
 * 
 * 字段表：  config/workflow_fieldtable.js
 * 工厂函数：buildInputFactory.js
 * 任务处理器：./tasks/ 目录
 */

const {
  handleScriptGeneration,
  handleScriptSplit,
  handleCharacterExtraction,
  handleImageGeneration,
  handleVideoGeneration,
  handleSmartParse,
  handleFrameGeneration,
  handleSingleFrameGeneration,
  handleSceneVideoGeneration,
  handleStoryboardGeneration,
  handleCharacterViewsGeneration,
  handleCostumeViewsGeneration,
  handleSceneImageGeneration,
  handleScenePanoramaGeneration,
  handleSceneElementsExtraction,
  handleSceneElementGeneration,
  handleBatchFrameGeneration,
  handleBatchSceneVideoGeneration,
  handleSceneStyleAnalysis,
  handleCameraRunGeneration,
  handleSceneStateAnalysis,
  handleSaveStoryboards,
  handleSceneStoryboardGeneration,
  handleBatchStoryboardGeneration,
  handleBatchSceneStep,
  handleBatchSaveStoryboards,
  handleSketchPreprocess,
  handleSketchToImage,
  handleBatchSketchFrameGeneration,
  handlePropPromptGeneration,
  handlePropImageGeneration,
  handleConceptBreakdownGeneration,
  handleCameraFrameGeneration,
  handleMagicPaintGeneration,
  handleHdRepairGeneration
} = require('./tasks');

const handleBatchPromptOptimization = require('./tasks/StoryBoard/batchPromptOptimization');
const handleSinglePromptOptimization = require('./tasks/StoryBoard/singlePromptOptimization');
const handleBatchImagePromptOptimization = require('./tasks/StoryBoard/batchImagePromptOptimization');
const handleSingleImagePromptOptimization = require('./tasks/StoryBoard/singleImagePromptOptimization');
const handleBatchVideoPromptOptimization = require('./tasks/StoryBoard/batchVideoPromptOptimization');
const handleSingleVideoPromptOptimization = require('./tasks/StoryBoard/singleVideoPromptOptimization');

// 影棚组装工作流 handlers
const handleStudioComponentsExtract = require('./tasks/Studio/studioComponentsExtract');
const handleStudioComposeFromScript = require('./tasks/Studio/studioComposeFromScript');
const handleStudioComponentsCompose = require('./tasks/Studio/studioComponentsCompose');
const handleEnvironmentImageGeneration = require('./tasks/Studio/environmentImageGeneration');
const handleBuildingImageGeneration = require('./tasks/Studio/buildingImageGeneration');

// AI 助手长任务 handlers
const handleAIAssistantPlanner = require('./tasks/AIAssistant/planner');
const handleAIAssistantExecutor = require('./tasks/AIAssistant/executor');
const handleAIAssistantObserver = require('./tasks/AIAssistant/observer');

// 独立帧生成模块（支持并发）
const { handleParallelFrameGeneration } = require('./tasks/StoryBoard/independentFrameGeneration');

const { createBuildInput } = require('./buildInputFactory');

// ============================================================
// 工作流定义（Workflow Definitions）
// 
// 每个步骤包含：
//   - type:       任务类型（对应 generation_tasks.task_type）
//   - targetType: 产物关联的业务表（对应 generation_tasks.target_type）
//   - handler:    执行函数（纯 AI 调用）
//   - buildInput: 由 createBuildInput 生成，字段名必须在字段表中注册
//                 context = { jobParams, previousResults: { [stepIndex]: result_data } }
// ============================================================

const WORKFLOW_DEFINITIONS = {

  /**
   * 仅生成剧本
   */
  script_only: {
    name: '剧本生成',
    steps: [
      {
        type: 'script_generation',
        targetType: 'script',
        handler: handleScriptGeneration,
        buildInput: createBuildInput([
          'title', 'description', 'style', 'length',
          'textModel', 'projectId', 'episodeNumber'
        ])
      }
    ]
  },

  /**
   * 剧本拆集（将长文本按高潮点拆分为多集，不增删改原文）
   */
  script_split: {
    name: '剧本拆集',
    steps: [
      {
        type: 'script_split',
        targetType: 'script',
        handler: handleScriptSplit,
        buildInput: createBuildInput([
          'rawText', 'minutesPerEpisode', 'textModel', 'projectId'
        ])
      }
    ]
  },

  /**
   * 智能拆分（T8 聚合版）- 5 步骤
   * 
   * 流程：
   *   0. storyboard_generation  - AI 生成分镜内容（含 environment/buildings/timeOfDay/weather）
   *   1. save_storyboards       - 保存分镜 + 从分镜 variables 聚合：
   *                                scenes（旧）/ studios / studio_states
   *                                / props / storyboard_props / studio_prop_links
   *                                / storyboard_scenes.studio_state_id 回写
   *   2. character_extraction   - AI 提取角色详情（写 characters + costumes）
   *   3. scene_state_analysis   - AI 分析环境连续性（写分镜 variables_json）
   *   4. studio_components_compose - 从分镜提取环境与建筑并组装影棚
   * 
   * 注：
   *   - 步骤 2 和 3 依赖步骤 1，可并行执行
   *   - 步骤 4 依赖步骤 1（需要 studios 已创建）
   */
  storyboard_generation: {
    name: '智能拆分',
    steps: [
      {
        type: 'storyboard_generation',
        targetType: 'storyboard',
        handler: handleStoryboardGeneration,
        // dependencies: [] - 无依赖，立即执行
        buildInput: createBuildInput([
          'scriptContent', 'scriptTitle', 'textModel', 'projectId',
          'referenceScriptContent', 'referenceScriptTitle',
          { key: 'think', defaultValue: false }
        ])
      },
      {
        type: 'save_storyboards',
        targetType: 'storyboard',
        handler: handleSaveStoryboards,
        dependencies: [0], // 依赖步骤0（storyboard_generation）
        buildInput: createBuildInput([
          { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
          'scriptId', 'projectId', 'userId', 'appendMode'
        ])
      },
      {
        type: 'character_extraction',
        targetType: 'characters',
        handler: handleCharacterExtraction,
        dependencies: [1], // 依赖步骤1（save_storyboards）
        buildInput: createBuildInput([
          { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
          'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel', 'appendMode',
          'referenceScriptContent', 'conflictStrategy'
        ])
      },
      {
        type: 'scene_state_analysis',
        targetType: 'storyboard',
        handler: handleSceneStateAnalysis,
        dependencies: [1], // 也依赖步骤1，与步骤2并行执行
        buildInput: createBuildInput([
          'scriptId', 'textModel', { key: 'think', defaultValue: false }
        ])
      },
      {
        type: 'studio_components_compose',
        targetType: 'studio',
        handler: handleStudioComponentsCompose,
        displayName: '组装影棚（环境+建筑）',
        dependencies: [1], // 依赖步骤1（save_storyboards，需要studios已创建）
        buildInput: createBuildInput([
          { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
          'projectId', 'scriptId', 'userId', 'textModel'
        ])
      }
    ]
  },

  /**
   * 单场景分镜生成
   * 用于按场景分割的分镜生成模式
   * 
   * 流程：
   *   1. scene_storyboard_generation - AI 将单个场景转化为分镜
   *   2. save_storyboards - 保存分镜到数据库
   */
  scene_storyboard_generation: {
    name: '场景分镜',
    steps: [
      {
        type: 'scene_storyboard_generation',
        targetType: 'storyboard',
        handler: handleSceneStoryboardGeneration,
        buildInput: createBuildInput([
          'sceneContent', 'sceneName', 'sceneNumber', 'totalScenes',
          'previousSceneContext', 'scriptTitle', 'textModel', 'projectId',
          'referenceScriptContent', 'referenceScriptTitle',
          { key: 'think', defaultValue: false }
        ])
      },
      {
        type: 'save_storyboards',
        targetType: 'storyboard',
        handler: handleSaveStoryboards,
        dependencies: [0],
        buildInput: createBuildInput([
          { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
          'scriptId', 'projectId', 'userId', 'sceneNumber', 'appendMode'
        ])
      }
    ]
  },

  /**
   * 批量分镜生成（动态步骤版）
   * 根据场景数量动态生成工作流步骤，每个场景是一个独立任务
   * 
   * 动态步骤结构（以 3 个场景为例）：
   *   0. batch_scene_0   - 场景1 AI 生成分镜（无依赖，可并行）
   *   1. batch_scene_1   - 场景2 AI 生成分镜（无依赖，可并行）
   *   2. batch_scene_2   - 场景3 AI 生成分镜（无依赖，可并行）
   *   3. batch_save      - 合并保存所有分镜（依赖 0,1,2）
   *   4. character_extraction - 角色提取（依赖 3）
   */
  batch_storyboard_generation: {
    name: '分镜生成',
    failPolicy: 'continue_independent',
    steps: (jobParams) => {
      const { getNormalizedParamValue } = require('../modules/generation/utils/workflowParams');
      const parsedScenes = getNormalizedParamValue(jobParams, 'parsedScenes') || [];
      const totalScenes = parsedScenes.length;

      if (totalScenes === 0) {
        // 回退到原始单步骤模式
        return [
          {
            type: 'batch_storyboard_generation',
            targetType: 'storyboard',
            handler: handleBatchStoryboardGeneration,
            buildInput: createBuildInput([
              'scriptId', 'projectId', 'userId', 'textModel',
              { key: 'clearExisting', defaultValue: true },
              { key: 'think', defaultValue: false }
            ])
          },
          {
            type: 'character_extraction',
            targetType: 'characters',
            handler: handleCharacterExtraction,
            dependencies: [0],
            buildInput: createBuildInput([
              { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
              'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel',
              'referenceScriptContent', 'conflictStrategy'
            ])
          }
        ];
      }

      const steps = [];

      // 场景步骤：每个场景是一个独立步骤（无 inter-dependencies，可并行）
      for (let i = 0; i < totalScenes; i++) {
        const scene = parsedScenes[i];
        steps.push({
          type: `batch_scene_${i}`,
          targetType: 'storyboard',
          displayName: `场景${scene.sceneNumber}: ${scene.sceneName}`,
          handler: handleBatchSceneStep,
          // 无 dependencies → 可立即执行（受 MAX_CONCURRENT_TASKS 并发限制）
          buildInput: createBuildInput([
            { key: 'sceneContent', from: () => scene.content },
            { key: 'sceneName', from: () => scene.sceneName },
            { key: 'sceneNumber', from: () => scene.sceneNumber },
            { key: 'totalScenes', from: () => totalScenes },
            'scriptTitle', 'textModel', 'projectId',
            'referenceScriptContent', 'referenceScriptTitle',
            { key: 'think', defaultValue: false }
          ])
        });
      }

      // 保存步骤：依赖所有场景步骤
      const saveStepIndex = totalScenes;
      const sceneDeps = Array.from({ length: totalScenes }, (_, i) => i);
      steps.push({
        type: 'batch_save',
        targetType: 'storyboard',
        displayName: '保存分镜',
        handler: handleBatchSaveStoryboards,
        dependencies: sceneDeps,
        buildInput: createBuildInput([
          'scriptId', 'projectId', 'userId', 'appendMode',
          { key: 'clearExisting', from: ctx => ctx.jobParams.appendMode ? false : (ctx.jobParams.clearExisting !== false) },
          {
            key: 'sceneResults',
            from: ctx => {
              // 从所有场景步骤的 previousResults 中收集结果
              const results = [];
              for (let j = 0; j < totalScenes; j++) {
                if (ctx.previousResults[j]) {
                  results.push(ctx.previousResults[j]);
                }
              }
              return results;
            }
          }
        ])
      });

      // 角色提取步骤：依赖保存步骤
      steps.push({
        type: 'character_extraction',
        targetType: 'characters',
        displayName: '角色提取',
        handler: handleCharacterExtraction,
        dependencies: [saveStepIndex],
        buildInput: createBuildInput([
          {
            key: 'scenes',
            from: ctx => {
              // 从所有场景步骤的 previousResults 中汇总 scenes
              const allScenes = [];
              for (let j = 0; j < totalScenes; j++) {
                if (ctx.previousResults[j]?.scenes) {
                  allScenes.push(...ctx.previousResults[j].scenes);
                }
              }
              return allScenes;
            }
          },
          'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel', 'appendMode',
          'referenceScriptContent', 'conflictStrategy'
        ])
      });

      // 影棚组装步骤：依赖保存步骤
      steps.push({
        type: 'studio_components_compose',
        targetType: 'studio',
        displayName: '组装影棚（环境+建筑）',
        handler: handleStudioComponentsCompose,
        dependencies: [saveStepIndex],
        buildInput: createBuildInput([
          {
            key: 'scenes',
            from: ctx => {
              // 从所有场景步骤的 previousResults 中汇总 scenes
              const allScenes = [];
              for (let j = 0; j < totalScenes; j++) {
                if (ctx.previousResults[j]?.scenes) {
                  allScenes.push(...ctx.previousResults[j].scenes);
                }
              }
              return allScenes;
            }
          },
          'projectId', 'scriptId', 'userId', 'textModel'
        ])
      });

      return steps;
    }
  },


  /**
   * 智能解析 API 文档（管理后台用）
   */
  smart_parse: {
    name: 'AI 智能解析',
    steps: [
      {
        type: 'smart_parse',
        targetType: 'ai_model_config',
        handler: handleSmartParse,
        buildInput: createBuildInput([
          'apiDoc', 'textModel', 'customPrompt'
        ])
      }
    ]
  },

  /**
   * 分镜首尾帧生成（有动作的分镜）
   */
  frame_generation: {
    name: '分镜首尾帧生成',
    steps: [
      {
        type: 'frame_image',
        targetType: 'storyboard',
        handler: handleFrameGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'prompt', 'imageModel', 'textModel',
          'aspectRatio'
        ])
      }
    ]
  },

  /**
   * 分镜单帧生成（无动作的分镜）
   */
  single_frame_generation: {
    name: '分镜单帧生成',
    steps: [
      {
        type: 'single_frame',
        targetType: 'storyboard',
        handler: handleSingleFrameGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'description', 'imageModel', 'textModel',
          'aspectRatio'
        ])
      }
    ]
  },

  /**
   * 魔术空间-视角帧生成（旋转/缩放/扩图）
   */
  camera_frame_generation: {
    name: '魔术空间-视角帧生成',
    steps: [
      {
        type: 'camera_frame',
        targetType: 'storyboard',
        handler: handleCameraFrameGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'compositeImageUrl', 'sourceImageUrl',
          'imageModel', 'textModel', 'aspectRatio',
          'rotationX', 'rotationY', 'rotationZ',
          'zoomLevel', 'mode'
        ])
      }
    ]
  },

  /**
   * 魔术空间涂改帧生成（颜色涂抹 + 文字指令）
   */
  magic_paint_generation: {
    name: '魔术涂改帧生成',
    steps: [
      {
        type: 'magic_paint',
        targetType: 'storyboard',
        handler: handleMagicPaintGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'compositeImageUrl', 'maskImageUrl',
          'sourceImageUrl', 'colorInstructions',
          'imageModel', 'textModel', 'aspectRatio'
        ])
      }
    ]
  },

  /**
   * 高清修复帧生成（以现有帧为参考，高分辨率重新生成）
   */
  hd_repair_generation: {
    name: '高清修复帧生成',
    steps: [
      {
        type: 'hd_repair',
        targetType: 'storyboard',
        handler: handleHdRepairGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'imageModel', 'textModel', 'aspectRatio', 'targetFrame'
        ])
      }
    ]
  },

  /**
   * 分镜视频生成（单个分镜的视频）
   */
  scene_video: {
    name: '分镜视频生成',
    steps: [
      {
        type: 'scene_video',
        targetType: 'storyboard',
        handler: handleSceneVideoGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'videoModel', 'textModel', 'duration', 'aspectRatio', 'resolution'
        ])
      }
    ]
  },


  /**
   * 场景图片生成
   */
  scene_image_generation: {
    name: '场景图片生成',
    steps: [
      {
        type: 'scene_style_analysis',
        targetType: 'scene',
        handler: handleSceneStyleAnalysis,
        buildInput: createBuildInput([
          'sceneName', 'description', 'environment', 'allScenes', 'textModel'
        ])
      },
      {
        type: 'scene_image_generation',
        targetType: 'scene',
        handler: handleSceneImageGeneration,
        buildInput: createBuildInput([
          'sceneId', 'sceneName', 'description', 'environment',
          'lighting', 'mood', 'style',
          'imageModel', 'textModel', 'aspectRatio',
          { key: 'width', defaultValue: null },
          { key: 'height', defaultValue: null },
          { key: 'referenceImageUrl', from: ctx => ctx.previousResults[0]?.referenceImageUrl || null },
          { key: 'styleDescription', from: ctx => ctx.previousResults[0]?.styleDescription || null },
          { key: 'customPromptA', defaultValue: null },
          { key: 'customPromptB', defaultValue: null }
        ])
      }
    ]
  },

  /**
   * 场景全景图生成（equirectangular 360°×180° 等距柱状投影）
   */
  scene_panorama_generation: {
    name: '场景全景图生成',
    steps: [
      {
        type: 'scene_panorama_generation',
        targetType: 'scene',
        handler: handleScenePanoramaGeneration,
        buildInput: createBuildInput([
          'sceneId', 'sceneName', 'description', 'environment',
          'lighting', 'mood', 'style',
          'imageModel', 'textModel',
          'elementImageUrls', 'elementPositions'
        ])
      }
    ]
  },

  /**
   * 场景元素抽取（从场景描述抽出建筑/场景元素清单）
   */
  scene_elements_extraction: {
    name: '场景元素抽取',
    steps: [
      {
        type: 'scene_elements_extraction',
        targetType: 'scene',
        handler: handleSceneElementsExtraction,
        buildInput: createBuildInput([
          'sceneId', 'sceneName', 'description', 'environment',
          'lighting', 'mood', 'textModel'
        ])
      }
    ]
  },

  /**
   * 场景元素图片生成（单个元素独立立绘）
   */
  scene_element_generation: {
    name: '场景元素图片生成',
    steps: [
      {
        type: 'scene_element_generation',
        targetType: 'scene_element',
        handler: handleSceneElementGeneration,
        buildInput: createBuildInput([
          'elementId', 'elementName', 'elementDescription', 'elementCategory',
          'imageModel', 'textModel'
        ])
      }
    ]
  },

  /**
   * 批量分镜帧生成（一键生成一集所有分镜图片）
   * 
   * 动态步骤模式：每个分镜作为独立的任务显示在任务栏中
   * - 如果传入 storyboardItems，则为每个分镜创建独立步骤
   * - 否则退回到单步骤模式（兼容旧调用方式）
   */
  batch_frame_generation: {
    name: '批量分镜帧生成',
    steps: (jobParams) => {
      const { storyboardItems, scriptId } = jobParams || {};
      
      // 如果传入了分镜列表，为每个分镜创建独立步骤
      if (Array.isArray(storyboardItems) && storyboardItems.length > 0) {
        return storyboardItems.map((item, index) => {
          const hasAction = item.hasAction || false;
          return {
            type: hasAction ? 'frame_generation' : 'single_frame_generation',
            targetType: 'storyboard',
            targetId: item.id,
            displayName: `第${item.idx || index + 1}个分镜${hasAction ? '（首尾帧）' : ''}`,
            handler: hasAction ? handleFrameGeneration : handleSingleFrameGeneration,
            dependencies: index > 0 ? [index - 1] : [], // 依赖前一个分镜，保持串行
            buildInput: (context) => {
              const jp = context.jobParams || {};
              const prevResult = index > 0 ? context.previousResults?.[index - 1] : null;
              return {
                storyboardId: item.id,
                prompt: item.description || '',
                description: item.description || '',
                imageModel: jp.imageModel,
                textModel: jp.textModel,
                aspectRatio: jp.aspectRatio,
                resolution: jp.resolution,
                visualStyle: jp.visualStyle,
                prevEndFrameUrl: prevResult?.lastFrameUrl || prevResult?.endFrame || null,
                prevDescription: prevResult?.description || item.description || null,
                prevEndState: prevResult?.endState || item.endState || null,
                isFirstScene: index === 0
              };
            }
          };
        });
      }
      
      // 兼容模式：单步骤处理所有分镜
      return [{
        type: 'batch_frame',
        targetType: 'storyboard',
        handler: handleBatchFrameGeneration,
        buildInput: createBuildInput([
          'scriptId', 'imageModel', 'textModel', 'overwriteFrames', 'aspectRatio', 'resolution',
          { key: 'maxConcurrency', defaultValue: 20 }
        ])
      }];
    }
  },

  /**
   * 并发分镜帧生成（独立模式 - 每个分镜独立生成，支持并发）
   * 与 batch_frame_generation 的区别：
   *   1. 不使用链式传递（prevEndFrameUrl），每个分镜独立
   *   2. 支持真正的并发处理，效率更高
   *   3. 适合对连贯性要求不高、需要快速生成的场景
   */
  parallel_frame_generation: {
    name: '并发分镜帧生成',
    steps: [
      {
        type: 'parallel_frame',
        targetType: 'storyboard',
        handler: handleParallelFrameGeneration,
        buildInput: createBuildInput([
          'scriptId', 'imageModel', 'textModel', 'overwriteFrames', 'aspectRatio', 'resolution',
          { key: 'maxConcurrency', defaultValue: 5 }  // 默认5个并发，避免API限流
        ])
      }
    ]
  },

  /**
   * 批量分镜视频生成（一键生成一集所有分镜视频）
   */
  batch_scene_video_generation: {
    name: '批量分镜视频生成',
    steps: [
      {
        type: 'batch_scene_video',
        targetType: 'storyboard',
        handler: handleBatchSceneVideoGeneration,
        buildInput: createBuildInput([
          'scriptId', 'videoModel', 'textModel', 'duration', 'aspectRatio', 'resolution',
          'overwriteVideos',
          { key: 'think', defaultValue: false },
          { key: 'maxConcurrency', defaultValue: 5 }
        ])
      }
    ]
  },

  /**
   * 角色三视图生成
   */
  character_views_generation: {
    name: '角色三视图生成',
    steps: [
      {
        type: 'character_views_generation',
        targetType: 'character',
        handler: handleCharacterViewsGeneration,
        buildInput: createBuildInput([
          'characterId', 'characterName', 'appearance', 'personality',
          'description', 'style', 'projectId', 'imageModel', 'textModel', 'aspectRatio',
          'regenerateOnly', 'isBaseModel', 'gender',
          'customPromptFront', 'customPromptSide', 'customPromptBack',
          { key: 'width', defaultValue: 1920 },
          { key: 'height', defaultValue: 2880 }
        ])
      }
    ]
  },

  /**
   * 服装三视图生成
   * 基于通用白色 mannequin + outfit 描述，生成服装三视图
   */
  costume_views_generation: {
    name: '服装三视图生成',
    steps: [
      {
        type: 'costume_views_generation',
        targetType: 'costume',
        handler: handleCostumeViewsGeneration,
        buildInput: createBuildInput([
          'costumeId', 'projectId', 'imageModel', 'textModel', 'aspectRatio'
        ])
      }
    ]
  },

  /**
   * 角色状态三视图生成
   * 支持状态级别的服装/发型/配饰/年龄阶段等外貌属性
   */
  character_state_views_generation: {
    name: '角色状态三视图生成',
    steps: [
      {
        type: 'character_state_views_generation',
        targetType: 'character_state',
        handler: handleCharacterViewsGeneration,
        buildInput: createBuildInput([
          'characterId', 'characterName', 'appearance', 'personality',
          'description', 'style', 'projectId', 'imageModel', 'textModel', 'aspectRatio',
          'regenerateOnly',
          'stateId', 'outfit', 'hairstyle', 'accessories', 'ageStage', 'bodyElements', 'heldProps',
          'isBaseModel', 'gender',
          'customPromptFront', 'customPromptSide', 'customPromptBack',
          { key: 'width', defaultValue: 1920 },
          { key: 'height', defaultValue: 2880 }
        ])
      }
    ]
  },

  /**
   * 角色概念分解图生成
   */
  character_concept_breakdown: {
    name: '角色概念分解图生成',
    steps: [
      {
        type: 'character_concept_breakdown',
        targetType: 'character',
        handler: handleConceptBreakdownGeneration,
        buildInput: createBuildInput([
          'characterId', 'characterName', 'appearance', 'personality',
          'description', 'style', 'projectId', 'imageModel', 'textModel',
          'frontViewUrl', 'sideViewUrl', 'backViewUrl'
        ])
      }
    ]
  },

  /**
   * 精细运镜提示词生成（单个分镜）
   */
  camera_run_generation: {
    name: '精细运镜生成',
    steps: [
      {
        type: 'camera_run_generation',
        targetType: 'storyboard',
        handler: handleCameraRunGeneration,
        buildInput: createBuildInput([
          'storyboardId', 'textModel',
          { key: 'think', defaultValue: false }
        ])
      }
    ]
  },

  /**
   * 草图帧生成（单个分镜）
   * 
   * 流程：
   *   1. sketch_preprocess - 预处理草图（验证、类型推测、尺寸标准化）
   *   2. sketch_to_image - 草图转图片（收集参考图、AI选择、调用模型生成）
   */
  sketch_frame_generation: {
    name: '草图帧生成',
    steps: [
      {
        type: 'sketch_preprocess',
        targetType: 'storyboard',
        handler: handleSketchPreprocess,
        buildInput: createBuildInput([
          'storyboardId', 'sketchUrl', 'sketchType'
        ])
      },
      {
        type: 'sketch_to_image',
        targetType: 'storyboard',
        handler: handleSketchToImage,
        dependencies: [0],
        buildInput: createBuildInput([
          'storyboardId', 'prompt', 'imageModel', 'textModel', 'aspectRatio',
          { key: 'controlStrength', defaultValue: 0.8 },
          { key: 'imageUrls', from: ctx => ctx.jobParams.imageUrls || null },
          { key: 'processedSketchUrl', from: ctx => ctx.previousResults[0]?.processedSketchUrl || ctx.jobParams.sketchUrl },
          { key: 'sketchType', from: ctx => ctx.previousResults[0]?.sketchType || ctx.jobParams.sketchType || 'storyboard_sketch' }
        ])
      }
    ]
  },

  /**
   * 批量草图帧生成（一键生成一集所有分镜的草图转图片）
   * 
   * 特点：
   *   - 与 batch_frame_generation 类似，但使用草图控制
   *   - 只处理已上传草图的分镜
   *   - 支持并发处理
   */
  batch_sketch_frame_generation: {
    name: '批量草图帧生成',
    steps: [
      {
        type: 'batch_sketch_frame',
        targetType: 'storyboard',
        handler: handleBatchSketchFrameGeneration,
        buildInput: createBuildInput([
          'scriptId', 'imageModel', 'textModel', 'aspectRatio',
          { key: 'controlStrength', defaultValue: 0.8 },
          { key: 'overwriteFrames', defaultValue: false },
          { key: 'maxConcurrency', defaultValue: 5 }
        ])
      }
    ]
  },

  /**
   * 道具图片生成
   * 
   * 流程：
   *   1. prop_prompt_generation - AI 生成道具描述提示词
   *   2. prop_image_generation  - 调用图像模型生成道具图片
   */
  prop_image_generation: {
    name: '道具图片生成',
    steps: [
      {
        type: 'prop_prompt_generation',
        targetType: 'prop',
        handler: handlePropPromptGeneration,
        buildInput: createBuildInput([
          'propId', 'propName', 'propDescription', 'propCategory',
          'propStyleConfig', 'textModel'
        ])
      },
      {
        type: 'prop_image_generation',
        targetType: 'prop',
        handler: handlePropImageGeneration,
        dependencies: [0],  // 依赖第一步的提示词
        buildInput: createBuildInput([
          'propId', 'imageModel', 'aspectRatio'
        ]),
        // 从上一步获取 prompt
        injectFromPrevious: {
          prompt: { stepIndex: 0, key: 'prompt' }
        }
      }
    ],
    onComplete: async (job, results, { queryOne, execute }) => {
      // 更新 props 表的 image_url 和 generation_status
      const propId = job.input_params.propId;
      const imageResult = results[1];  // 第二步的结果
      const promptResult = results[0]; // 第一步的结果
      
      if (imageResult && imageResult.imageUrl) {
        await execute(
          `UPDATE props SET 
            image_url = ?, 
            generation_status = 'completed',
            generation_prompt = ?
          WHERE id = ?`,
          [imageResult.imageUrl, promptResult?.prompt || '', propId]
        );
        console.log('[PropGen] 道具图片已保存, propId:', propId);
      }
    }
  },

  /**
   * 批量分镜提示词优化（一键优化全部分镜描述）
   * 单步骤模式：内部并发池处理所有分镜
   */
  batch_prompt_optimization: {
    name: '批量提示词优化',
    steps: [
      {
        type: 'batch_prompt_optimize',
        targetType: 'storyboard',
        handler: handleBatchPromptOptimization,
        buildInput: createBuildInput([
          'scriptId', 'textModel',
          { key: 'maxConcurrency', defaultValue: 3 }
        ])
      }
    ]
  },

  /**
   * 单条分镜提示词优化（AI 优化按钮触发）
   */
  single_prompt_optimization: {
    name: 'AI 优化提示词',
    steps: [
      {
        type: 'single_prompt_optimize',
        targetType: 'storyboard',
        handler: handleSinglePromptOptimization,
        buildInput: createBuildInput([
          'storyboardId', 'prompt', 'textModel'
        ])
      }
    ]
  },

  /**
   * 单条分镜图片提示词优化（针对静态图像生成）
   */
  single_image_prompt_optimization: {
    name: 'AI 优化提示词(图片)',
    steps: [
      {
        type: 'single_image_prompt_optimize',
        targetType: 'storyboard',
        handler: handleSingleImagePromptOptimization,
        buildInput: createBuildInput([
          'storyboardId', 'prompt', 'textModel'
        ])
      }
    ]
  },

  /**
   * 单条分镜视频提示词优化（针对动态视频生成）
   */
  single_video_prompt_optimization: {
    name: 'AI 优化提示词(视频)',
    steps: [
      {
        type: 'single_video_prompt_optimize',
        targetType: 'storyboard',
        handler: handleSingleVideoPromptOptimization,
        buildInput: createBuildInput([
          'storyboardId', 'prompt', 'textModel'
        ])
      }
    ]
  },

  /**
   * 批量分镜图片提示词优化（一键优化全部分镜描述为图片提示词）
   */
  batch_image_prompt_optimization: {
    name: '批量提示词优化(图片)',
    steps: [
      {
        type: 'batch_image_prompt_optimize',
        targetType: 'storyboard',
        handler: handleBatchImagePromptOptimization,
        buildInput: createBuildInput([
          'scriptId', 'textModel',
          { key: 'maxConcurrency', defaultValue: 3 }
        ])
      }
    ]
  },

  /**
   * 批量分镜视频提示词优化（一键优化全部分镜描述为视频提示词）
   */
  batch_video_prompt_optimization: {
    name: '批量提示词优化(视频)',
    steps: [
      {
        type: 'batch_video_prompt_optimize',
        targetType: 'storyboard',
        handler: handleBatchVideoPromptOptimization,
        buildInput: createBuildInput([
          'scriptId', 'textModel',
          { key: 'maxConcurrency', defaultValue: 3 }
        ])
      }
    ]
  },

  /**
   * AI 助手长任务（单轮规划-执行-观察，MVP）
   *
   * 流程：
   *   Step 0: ai_plan     —— 调 LLM（function calling），输出 tool_calls[] 或 final reply
   *   Step 1: ai_execute  —— 对每个 tool_call 启动子 workflow，并发等待全部完成
   *   Step 2: ai_observe  —— 汇总结果为最终回复
   */
  ai_assistant_session: {
    name: 'AI 助手会话',
    steps: [
      {
        type: 'ai_plan',
        targetType: 'ai_assistant',
        displayName: '规划',
        handler: handleAIAssistantPlanner,
        buildInput: createBuildInput([
          'message', 'conversation', 'textModel', 'projectId', 'userId'
        ])
      },
      {
        type: 'ai_execute',
        targetType: 'ai_assistant',
        displayName: '执行子任务',
        dependencies: [0],
        handler: handleAIAssistantExecutor,
        buildInput: createBuildInput([
          { key: 'tool_calls', from: ctx => ctx.previousResults[0]?.tool_calls || [] },
          { key: 'parentJobId', from: ctx => ctx.jobId },
          'userId', 'projectId', 'defaultTextModel', 'defaultImageModel'
        ])
      },
      {
        type: 'ai_observe',
        targetType: 'ai_assistant',
        displayName: '汇总回复',
        dependencies: [1],
        handler: handleAIAssistantObserver,
        buildInput: createBuildInput([
          { key: 'reply_text', from: ctx => ctx.previousResults[0]?.reply_text || null },
          { key: 'rejected_tools', from: ctx => ctx.previousResults[0]?.rejected_tools || [] },
          { key: 'tool_calls', from: ctx => ctx.previousResults[0]?.tool_calls || [] },
          { key: 'invocations', from: ctx => ctx.previousResults[1]?.invocations || [] },
          'textModel', 'message'
        ])
      }
    ]
  }
};

/**
 * 获取工作流定义
 * @param {string} workflowType 
 * @returns {object|null}
 */
function getWorkflowDefinition(workflowType) {
  return WORKFLOW_DEFINITIONS[workflowType] || null;
}

/**
 * 获取所有可用的工作流类型
 */
function getAvailableWorkflows() {
  return Object.entries(WORKFLOW_DEFINITIONS).map(([key, def]) => {
    const steps = typeof def.steps === 'function' ? [] : def.steps;
    return {
      type: key,
      name: def.name,
      totalSteps: steps.length,
      isDynamic: typeof def.steps === 'function',
      steps: steps.map((s, i) => ({ index: i, type: s.type, targetType: s.targetType }))
    };
  });
}

module.exports = {
  getWorkflowDefinition,
  getAvailableWorkflows,
  WORKFLOW_DEFINITIONS,
  // 导出处理器，方便单独使用
  handlers: {
    handleScriptGeneration,
    handleCharacterExtraction,
    handleImageGeneration,
    handleVideoGeneration,
    handleSmartParse,
    handleFrameGeneration,
    handleSceneVideoGeneration,
    handleStoryboardGeneration,
    handleBatchFrameGeneration,
    handleBatchSceneVideoGeneration
  }
};

// ============================================================
// 影棚剧本拆分组装工作流
// ============================================================

WORKFLOW_DEFINITIONS['studio_components_extraction'] = {
  name: '剧本拆解：环境与建筑',
  steps: [
    {
      type: 'ai_execute',
      targetType: 'studio',
      displayName: '从剧本拆分环境与建筑',
      handler: handleStudioComponentsExtract,
      buildInput: createBuildInput([
        'projectId', 'scriptId', 'textModel'
      ])
    }
  ]
};

WORKFLOW_DEFINITIONS['studio_compose_from_script'] = {
  name: '影棚组装：环境+建筑=影棚',
  steps: [
    {
      type: 'ai_execute',
      targetType: 'studio',
      displayName: '从剧本组装影棚',
      handler: handleStudioComposeFromScript,
      buildInput: createBuildInput([
        'projectId', 'scriptId', 'textModel'
      ])
    }
  ]
};

/**
 * 环境氛围图生成
 */
WORKFLOW_DEFINITIONS['environment_image_generation'] = {
  name: '环境氛围图生成',
  steps: [
    {
      type: 'environment_image_generation',
      targetType: 'environment',
      displayName: '环境氛围图生成',
      handler: handleEnvironmentImageGeneration,
      buildInput: createBuildInput([
        'environmentId', 'environmentName', 'description',
        'timeOfDay', 'weather', 'lighting', 'mood',
        'imageModel', 'textModel',
        { key: 'generationPrompt', from: ctx => ctx.generationPrompt || null }
      ])
    }
  ]
};

/**
 * 建筑结构图生成
 */
WORKFLOW_DEFINITIONS['building_image_generation'] = {
  name: '建筑结构图生成',
  steps: [
    {
      type: 'building_image_generation',
      targetType: 'building',
      displayName: '建筑结构图生成',
      handler: handleBuildingImageGeneration,
      buildInput: createBuildInput([
        'buildingId', 'buildingName', 'description',
        'interiorExterior', 'structureType',
        'imageModel', 'textModel',
        { key: 'generationPrompt', from: ctx => ctx.generationPrompt || null }
      ])
    }
  ]
};
