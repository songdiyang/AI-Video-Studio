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
  handleCharacterExtraction,
  handleSceneExtraction,
  handleImageGeneration,
  handleVideoGeneration,
  handleSmartParse,
  handleFrameGeneration,
  handleSingleFrameGeneration,
  handleSceneVideoGeneration,
  handleStoryboardGeneration,
  handleCharacterViewsGeneration,
  handleSceneImageGeneration,
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
  handleCameraFrameGeneration
} = require('./tasks');

const handleBatchPromptOptimization = require('./tasks/StoryBoard/batchPromptOptimization');

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
   * 智能分镜（优化后）- 4 步骤，3 次 AI 调用
   * 
   * 流程（支持并行）：
   *   1. storyboard_generation  - AI 生成分镜内容
   *   2. save_storyboards       - 保存分镜 + 从 location 字段提取场景（无 AI）
   *   3. character_extraction   - AI 提取角色详情 ← 与步骤4并行执行
   *   4. scene_state_analysis   - AI 分析环境状态 ← 与步骤3并行执行
   * 
   * dependencies 字段说明：
   *   - 步骤的 dependencies 数组指定它依赖的步骤索引（从0开始）
   *   - 当一个步骤的所有依赖都完成后，它可以开始执行
   *   - 多个步骤如果依赖相同的步骤，可以并行执行
   */
  storyboard_generation: {
    name: '智能分镜',
    steps: [
      {
        type: 'storyboard_generation',
        targetType: 'storyboard',
        handler: handleStoryboardGeneration,
        // dependencies: [] - 无依赖，立即执行
        buildInput: createBuildInput([
          'scriptContent', 'scriptTitle', 'textModel', 'projectId',
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
          'scriptId', 'projectId', 'userId'
        ])
      },
      {
        type: 'character_extraction',
        targetType: 'characters',
        handler: handleCharacterExtraction,
        dependencies: [1], // 依赖步骤1（save_storyboards）
        buildInput: createBuildInput([
          { key: 'scenes', from: ctx => ctx.previousResults[0]?.scenes || [] },
          'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel'
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
              'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel'
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
          'scriptId', 'projectId', 'userId',
          { key: 'clearExisting', defaultValue: true },
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
          'scriptContent', 'projectId', 'scriptId', 'userId', 'textModel'
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
   * 视角调整帧生成（旋转/缩放/扩图）
   */
  camera_frame_generation: {
    name: '视角调整帧生成',
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
          { key: 'styleDescription', from: ctx => ctx.previousResults[0]?.styleDescription || null }
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
          { key: 'width', defaultValue: 1920 },
          { key: 'height', defaultValue: 2880 }
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
          'stateId', 'outfit', 'hairstyle', 'accessories', 'ageStage', 'bodyElements',
          'isBaseModel', 'gender',
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
