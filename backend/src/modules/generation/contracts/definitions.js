const { getSceneCount, parseScriptScenes } = require('../../../utils/parseScriptScenes');
const { HttpError } = require('../utils/httpErrors');
const {
  requireProjectForUser,
  requireScriptForUser,
  requireCharacterForUser,
  requireSceneForUser,
  listScenesForProject,
  requireStoryboardForUser
} = require('./repositories');

function createCommand({ operationKey, workflowType, actor, scope, models, inputs, options }) {
  return {
    contractVersion: 1,
    operationKey,
    workflowType,
    actor,
    scope,
    models,
    inputs,
    options
  };
}

function ensureScriptHasContent(script) {
  if (!script.content || script.content.trim() === '') {
    throw new HttpError(400, '剧本内容为空，无法启动生成');
  }
}

function buildSceneSummaries(allScenes) {
  return allScenes.map(scene => ({
    id: scene.id,
    name: scene.name,
    description: scene.description || '',
    environment: scene.environment || '',
    hasImage: Boolean(scene.image_url),
    imageUrl: scene.image_url || null,
    generationPrompt: scene.generation_prompt || null
  }));
}

const operationContracts = [
  {
    operationKey: 'script_generate',
    workflowType: 'script_only',
    requestSchema: {
      type: 'object',
      required: ['projectId', 'textModel', 'episodeNumber'],
      properties: {
        projectId: { type: 'integer', minimum: 1 },
        title: { type: 'string' },
        description: { type: 'string', default: '' },
        style: { type: 'string', default: '电影感' },
        length: { type: 'string', default: '短篇' },
        episodeNumber: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const project = await requireProjectForUser(input.projectId, actor.userId);
      return {
        scope: {
          projectId: project.id
        },
        resources: { project }
      };
    },
    defaultsResolver: async ({ input }) => ({
      models: {
        textModel: input.textModel
      },
      inputs: {
        title: input.title || `第${input.episodeNumber}集`,
        description: input.description,
        style: input.style,
        length: input.length,
        episodeNumber: input.episodeNumber
      },
      options: {}
    }),
    conflictKeyResolver: () => null,
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      jobId: result.jobId,
      tasks: result.tasks,
      workflowType: command.workflowType,
      operationKey: command.operationKey,
      status: 'pending'
    })
  },
  {
    operationKey: 'character_views_generate',
    workflowType: 'character_views_generation',
    requestSchema: {
      type: 'object',
      required: ['characterId', 'imageModel'],
      properties: {
        characterId: { type: 'integer', minimum: 1 },
        style: { type: 'string' },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        aspectRatio: { type: 'string' },
        regenerateOnly: { type: 'array', items: { type: 'string', enum: ['front', 'side', 'back'] } }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const character = await requireCharacterForUser(input.characterId, actor.userId);
      return {
        scope: {
          projectId: character.project_id,
          characterId: character.id
        },
        resources: { character }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        characterName: resources.character.name,
        appearance: resources.character.appearance,
        personality: resources.character.personality,
        description: resources.character.description,
        style: input.style || null,
        regenerateOnly: input.regenerateOnly || null
      },
      options: {
        aspectRatio: input.aspectRatio || null
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'characterId',
      value: scope.characterId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      message: '三视图生成已启动',
      jobId: result.jobId,
      characterId: command.scope.characterId,
      status: 'generating'
    })
  },
  {
    operationKey: 'character_concept_breakdown',
    workflowType: 'character_concept_breakdown',
    requestSchema: {
      type: 'object',
      required: ['characterId', 'imageModel'],
      properties: {
        characterId: { type: 'integer', minimum: 1 },
        style: { type: 'string' },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        frontViewUrl: { type: 'string' },
        sideViewUrl: { type: 'string' },
        backViewUrl: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const character = await requireCharacterForUser(input.characterId, actor.userId);
      return {
        scope: {
          projectId: character.project_id,
          characterId: character.id
        },
        resources: { character }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        characterName: resources.character.name,
        appearance: resources.character.appearance,
        personality: resources.character.personality,
        description: resources.character.description,
        style: input.style || null,
        frontViewUrl: input.frontViewUrl || resources.character.front_view_url || null,
        sideViewUrl: input.sideViewUrl || resources.character.side_view_url || null,
        backViewUrl: input.backViewUrl || resources.character.back_view_url || null
      },
      options: {}
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'characterId',
      value: scope.characterId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      message: '概念分解图生成已启动',
      jobId: result.jobId,
      characterId: command.scope.characterId,
      status: 'generating'
    })
  },
  {
    operationKey: 'scene_image_generate',
    workflowType: 'scene_image_generation',
    requestSchema: {
      type: 'object',
      required: ['sceneId', 'imageModel'],
      properties: {
        sceneId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 },
        aspectRatio: { type: 'string' },
        style: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const scene = await requireSceneForUser(input.sceneId, actor.userId);
      const allScenes = await listScenesForProject(scene.project_id, actor.userId);
      return {
        scope: {
          projectId: scene.project_id,
          sceneId: scene.id
        },
        resources: { scene, allScenes }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const scene = resources.scene;
      if (!scene.name && !scene.description && !scene.environment) {
        throw new HttpError(400, '场景信息不足，至少需要提供场景名称、描述或环境描述之一');
      }

      return {
        models: {
          imageModel: input.imageModel,
          textModel: input.textModel || null
        },
        inputs: {
          sceneName: scene.name,
          description: scene.description,
          environment: scene.environment,
          lighting: scene.lighting,
          mood: scene.mood,
          style: input.style || null,
          allScenes: buildSceneSummaries(resources.allScenes)
        },
        options: {
          width: input.width ?? null,
          height: input.height ?? null,
          aspectRatio: input.aspectRatio || null
        }
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'sceneId',
      value: scope.sceneId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      message: '场景图片生成已启动',
      jobId: result.jobId,
      sceneId: command.scope.sceneId,
      status: 'generating'
    })
  },
  {
    operationKey: 'storyboard_generate',
    workflowType: 'storyboard_generation',
    requestSchema: {
      type: 'object',
      required: ['scriptId', 'textModel'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      ensureScriptHasContent(script);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        textModel: input.textModel
      },
      inputs: {
        episodeNumber: resources.script.episode_number,
        scriptContent: resources.script.content,
        scriptTitle: resources.script.title || `第${resources.script.episode_number}集`
      },
      options: {}
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      message: '分镜生成已启动',
      jobId: result.jobId,
      scriptId: command.scope.scriptId
    })
  },
  {
    operationKey: 'batch_storyboard_generate',
    workflowType: 'batch_storyboard_generation',
    requestSchema: {
      type: 'object',
      required: ['scriptId', 'textModel'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 },
        clearExisting: { type: 'boolean', default: true }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      ensureScriptHasContent(script);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const parsedScenes = parseScriptScenes(resources.script.content);
      const totalScenes = parsedScenes.length;
      if (totalScenes === 0) {
        throw new HttpError(400, '未能从剧本中识别出场景');
      }

      return {
        models: {
          textModel: input.textModel
        },
        inputs: {
          scriptContent: resources.script.content,
          episodeNumber: resources.script.episode_number,
          totalScenes,
          parsedScenes: parsedScenes.map((s, i) => ({
            sceneNumber: s.sceneNumber || (i + 1),
            sceneName: s.sceneName || `场景${s.sceneNumber || (i + 1)}`,
            content: s.content
          }))
        },
        options: {
          clearExisting: input.clearExisting
        }
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      message: `已启动分镜生成（共 ${command.inputs.totalScenes} 个场景）`,
      scriptId: command.scope.scriptId,
      totalScenes: command.inputs.totalScenes,
      jobId: result.jobId
    })
  },
  {
    operationKey: 'batch_frame_generate',
    workflowType: 'batch_frame_generation',
    requestSchema: {
      type: 'object',
      required: ['scriptId', 'imageModel'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        overwriteFrames: { type: 'boolean', default: false },
        aspectRatio: { type: 'string' },
        resolution: { type: 'string' },
        maxConcurrency: { type: 'integer', minimum: 1, default: 20 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        episodeNumber: resources.script.episode_number
      },
      options: {
        overwriteFrames: input.overwriteFrames,
        aspectRatio: input.aspectRatio || null,
        resolution: input.resolution || null,
        maxConcurrency: input.maxConcurrency ?? 20
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result }) => ({
      success: true,
      jobId: result.jobId,
      tasks: result.tasks,
      message: '批量帧生成任务已启动'
    })
  },
  {
    operationKey: 'parallel_frame_generate',
    workflowType: 'parallel_frame_generation',
    requestSchema: {
      type: 'object',
      required: ['scriptId', 'imageModel'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        overwriteFrames: { type: 'boolean', default: false },
        aspectRatio: { type: 'string' },
        maxConcurrency: { type: 'integer', minimum: 1, default: 5 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        episodeNumber: resources.script.episode_number
      },
      options: {
        overwriteFrames: input.overwriteFrames,
        aspectRatio: input.aspectRatio || null,
        maxConcurrency: input.maxConcurrency ?? 5
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result }) => ({
      success: true,
      jobId: result.jobId,
      tasks: result.tasks,
      message: '并发帧生成任务已启动（独立模式）'
    })
  },
  {
    operationKey: 'batch_scene_video_generate',
    workflowType: 'batch_scene_video_generation',
    requestSchema: {
      type: 'object',
      required: ['scriptId', 'videoModel'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        videoModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        duration: { type: 'number', minimum: 0 },
        aspectRatio: { type: 'string' },
        overwriteVideos: { type: 'boolean', default: false },
        maxConcurrency: { type: 'integer', minimum: 1, default: 3 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        videoModel: input.videoModel,
        textModel: input.textModel || null
      },
      inputs: {
        episodeNumber: resources.script.episode_number
      },
      options: {
        duration: input.duration ?? null,
        aspectRatio: input.aspectRatio || null,
        overwriteVideos: input.overwriteVideos,
        maxConcurrency: input.maxConcurrency ?? 3
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result }) => ({
      success: true,
      jobId: result.jobId,
      tasks: result.tasks,
      message: '批量视频生成任务已启动'
    })
  },
  {
    operationKey: 'frame_generate',
    workflowType: 'frame_generation',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'prompt', 'imageModel'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        prompt: { type: 'string', minLength: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        aspectRatio: { type: 'string' },
        episodeNumber: { type: 'integer', minimum: 1 },
        storyboardIndex: { type: 'integer', minimum: 1 },
        isRegenerate: { type: 'boolean', default: false }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const storyboard = await requireStoryboardForUser(input.storyboardId, actor.userId);
      return {
        scope: {
          projectId: storyboard.project_id,
          scriptId: storyboard.script_id,
          storyboardId: storyboard.id
        },
        resources: { storyboard }
      };
    },
    defaultsResolver: async ({ input }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        prompt: input.prompt,
        episodeNumber: input.episodeNumber ?? null,
        storyboardIndex: input.storyboardIndex ?? null
      },
      options: {
        aspectRatio: input.aspectRatio || null,
        isRegenerate: Boolean(input.isRegenerate)
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'storyboardId',
      value: scope.storyboardId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      jobId: result.jobId,
      tasks: result.tasks,
      workflowType: command.workflowType,
      operationKey: command.operationKey,
      status: 'pending'
    })
  },
  {
    operationKey: 'single_frame_generate',
    workflowType: 'single_frame_generation',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'description', 'imageModel'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        description: { type: 'string', minLength: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        aspectRatio: { type: 'string' },
        episodeNumber: { type: 'integer', minimum: 1 },
        storyboardIndex: { type: 'integer', minimum: 1 },
        isRegenerate: { type: 'boolean', default: false }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const storyboard = await requireStoryboardForUser(input.storyboardId, actor.userId);
      return {
        scope: {
          projectId: storyboard.project_id,
          scriptId: storyboard.script_id,
          storyboardId: storyboard.id
        },
        resources: { storyboard }
      };
    },
    defaultsResolver: async ({ input }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        description: input.description,
        episodeNumber: input.episodeNumber ?? null,
        storyboardIndex: input.storyboardIndex ?? null
      },
      options: {
        aspectRatio: input.aspectRatio || null,
        isRegenerate: Boolean(input.isRegenerate)
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'storyboardId',
      value: scope.storyboardId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      jobId: result.jobId,
      tasks: result.tasks,
      workflowType: command.workflowType,
      operationKey: command.operationKey,
      status: 'pending'
    })
  },
  {
    operationKey: 'scene_video_generate',
    workflowType: 'scene_video',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'videoModel'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        videoModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        duration: { type: 'number', minimum: 0 },
        aspectRatio: { type: 'string' },
        episodeNumber: { type: 'integer', minimum: 1 },
        storyboardIndex: { type: 'integer', minimum: 1 },
        isRegenerate: { type: 'boolean', default: false }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const storyboard = await requireStoryboardForUser(input.storyboardId, actor.userId);
      return {
        scope: {
          projectId: storyboard.project_id,
          scriptId: storyboard.script_id,
          storyboardId: storyboard.id
        },
        resources: { storyboard }
      };
    },
    defaultsResolver: async ({ input }) => ({
      models: {
        videoModel: input.videoModel,
        textModel: input.textModel || null
      },
      inputs: {
        episodeNumber: input.episodeNumber ?? null,
        storyboardIndex: input.storyboardIndex ?? null
      },
      options: {
        duration: input.duration ?? null,
        aspectRatio: input.aspectRatio || null,
        isRegenerate: Boolean(input.isRegenerate)
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'storyboardId',
      value: scope.storyboardId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result, command }) => ({
      jobId: result.jobId,
      tasks: result.tasks,
      workflowType: command.workflowType,
      operationKey: command.operationKey,
      status: 'pending'
    })
  },
  {
    operationKey: 'smart_parse_generate',
    workflowType: 'smart_parse',
    requestSchema: {
      type: 'object',
      required: ['apiDoc', 'textModel'],
      properties: {
        apiDoc: { type: 'string', minLength: 1 },
        textModel: { type: 'string', minLength: 1 },
        customPrompt: { type: 'string' }
      }
    },
    scopeResolver: async () => ({
      scope: {
        projectId: null
      },
      resources: {}
    }),
    defaultsResolver: async ({ input }) => ({
      models: {
        textModel: input.textModel
      },
      inputs: {
        apiDoc: input.apiDoc,
        customPrompt: input.customPrompt || null
      },
      options: {}
    }),
    conflictKeyResolver: () => null,
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result }) => ({
      jobId: result.jobId,
      tasks: result.tasks,
      message: '解析任务已启动'
    })
  },
  {
    operationKey: 'batch_prompt_optimize',
    workflowType: 'batch_prompt_optimization',
    requestSchema: {
      type: 'object',
      required: ['scriptId'],
      properties: {
        scriptId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string' },
        maxConcurrency: { type: 'integer', minimum: 1, default: 3 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      return {
        scope: {
          projectId: script.project_id,
          scriptId: script.id
        },
        resources: { script }
      };
    },
    defaultsResolver: async ({ input }) => ({
      models: {
        textModel: input.textModel || null
      },
      inputs: {},
      options: {
        maxConcurrency: input.maxConcurrency ?? 3
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'scriptId',
      value: scope.scriptId
    }),
    toJobParams: ({ contract, actor, scope, resolved }) =>
      createCommand({
        operationKey: contract.operationKey,
        workflowType: contract.workflowType,
        actor,
        scope,
        models: resolved.models,
        inputs: resolved.inputs,
        options: resolved.options
      }),
    responseMapper: ({ result }) => ({
      success: true,
      jobId: result.jobId,
      tasks: result.tasks,
      message: '批量提示词优化任务已启动'
    })
  }
];

module.exports = {
  operationContracts
};
