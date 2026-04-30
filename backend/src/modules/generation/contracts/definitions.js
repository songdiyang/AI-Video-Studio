const { getSceneCount, parseScriptScenes } = require('../../../utils/parseScriptScenes');
const { HttpError } = require('../utils/httpErrors');
const { queryOne, queryAll } = require('../../../dbHelper');
const { encodeId } = require('../../../utils/workflowId');
const {
  requireProjectForUser,
  requireScriptForUser,
  requireCharacterForUser,
  requireCostumeForUser,
  requireSceneForUser,
  listScenesForProject,
  requireStoryboardForUser,
  requireSceneElementForUser,
  listEnabledSceneElementLinks,
  requireStudioForUser,
  requireEnvironmentForUser,
  requireBuildingForUser,
  listStudioBuildings,
  getStudioEnvironment,
  listStudioElementLinks
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
      jobId: encodeId(result.jobId),
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
        regenerateOnly: { type: 'array', items: { type: 'string', enum: ['front', 'side', 'back'] } },
        customPromptFront: { type: 'string' },
        customPromptSide: { type: 'string' },
        customPromptBack: { type: 'string' }
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
        // 白膜角色设定图：优先用纯净 base_appearance，避免服装等状态量污染白膜 prompt
        appearance: resources.character.base_appearance || resources.character.appearance,
        personality: resources.character.personality,
        description: resources.character.description,
        style: input.style || null,
        regenerateOnly: input.regenerateOnly || null,
        customPromptFront: input.customPromptFront || null,
        customPromptSide: input.customPromptSide || null,
        customPromptBack: input.customPromptBack || null
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
      jobId: encodeId(result.jobId),
      characterId: command.scope.characterId,
      status: 'generating'
    })
  },
  {
    operationKey: 'character_state_views_generate',
    workflowType: 'character_state_views_generation',
    requestSchema: {
      type: 'object',
      required: ['characterId', 'stateId', 'imageModel'],
      properties: {
        characterId: { type: 'integer', minimum: 1 },
        stateId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        regenerateOnly: { type: 'array', items: { type: 'string', enum: ['front', 'side', 'back'] } },
        customPromptFront: { type: 'string' },
        customPromptSide: { type: 'string' },
        customPromptBack: { type: 'string' },
        generateMode: { type: 'string', enum: ['design_sheet', 'three_views'] }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const character = await requireCharacterForUser(input.characterId, actor.userId);
      return {
        scope: {
          projectId: character.project_id,
          characterId: character.id,
          stateId: input.stateId
        },
        resources: { character }
      };
    },
    defaultsResolver: async ({ input, resources, scope }) => {
      // 查询状态数据以获取外貌属性和白膜标记
      const state = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [input.stateId, input.characterId]
      );
      if (!state) {
        throw new HttpError(404, '角色状态不存在');
      }

      // 白膜生成不再强制要求参考图，有则用、无则纯描述生成

      return {
        models: {
          imageModel: input.imageModel,
          textModel: input.textModel || null
        },
        inputs: {
          characterId: input.characterId,
          characterName: resources.character.name,
          // 状态级三视图：使用纯净 base_appearance 作为基线，服装/配饰/发型由下面独立字段叠加，避免重复/冲突
          appearance: resources.character.base_appearance || resources.character.appearance,
          personality: resources.character.personality,
          description: resources.character.description,
          style: null,
          stateId: input.stateId,
          outfit: state.outfit || null,
          hairstyle: state.hairstyle || null,
          accessories: state.accessories || null,
          ageStage: state.age_stage || null,
          bodyElements: state.body_elements || null,
          heldProps: state.held_props || null,
          isBaseModel: !!state.is_base_model,
          gender: resources.character.gender || 'unknown',
          regenerateOnly: input.regenerateOnly || null,
          customPromptFront: input.customPromptFront || null,
          customPromptSide: input.customPromptSide || null,
          customPromptBack: input.customPromptBack || null,
          generateMode: input.generateMode || null
        },
        options: {}
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'stateId',
      value: scope.stateId
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
      message: '状态三视图生成已启动',
      jobId: encodeId(result.jobId),
      characterId: command.scope.characterId,
      stateId: command.scope.stateId,
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
      jobId: encodeId(result.jobId),
      characterId: command.scope.characterId,
      status: 'generating'
    })
  },
  {
    operationKey: 'costume_views_generate',
    workflowType: 'costume_views_generation',
    requestSchema: {
      type: 'object',
      required: ['costumeId', 'imageModel'],
      properties: {
        costumeId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        aspectRatio: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const costume = await requireCostumeForUser(input.costumeId, actor.userId);
      return {
        scope: {
          projectId: costume.project_id,
          costumeId: costume.id
        },
        resources: { costume }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        imageModel: input.imageModel,
        textModel: input.textModel || null
      },
      inputs: {
        costumeId: resources.costume.id
      },
      options: {
        aspectRatio: input.aspectRatio || null
      }
    }),
    conflictKeyResolver: ({ scope }) => ({
      key: 'costumeId',
      value: scope.costumeId
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
      message: '服装三视图生成已启动',
      jobId: encodeId(result.jobId),
      costumeId: command.scope.costumeId,
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
        style: { type: 'string' },
        // 前端用户可编辑后提交的自定义提示词（A面/B面）
        customPromptA: { type: 'string' },
        customPromptB: { type: 'string' }
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
          allScenes: buildSceneSummaries(resources.allScenes),
          // 透传用户编辑后的自定义提示词
          customPromptA: typeof input.customPromptA === 'string' ? input.customPromptA : null,
          customPromptB: typeof input.customPromptB === 'string' ? input.customPromptB : null
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
      jobId: encodeId(result.jobId),
      sceneId: command.scope.sceneId,
      status: 'generating'
    })
  },
  {
    // 软弃用提示：scene_panorama_generate 已改为基于 studioId；旧 sceneId 版本仍生效但只聚合场景自身的元素（无环境/建筑）
    operationKey: 'scene_panorama_generate',
    workflowType: 'scene_panorama_generation',
    requestSchema: {
      type: 'object',
      required: ['imageModel'],
      properties: {
        studioId: { type: 'integer', minimum: 1 },
        sceneId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        style: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      // 优先 studioId，兼容旧 sceneId
      if (input.studioId) {
        const studio = await requireStudioForUser(input.studioId, actor.userId);
        return {
          scope: {
            projectId: studio.project_id,
            studioId: studio.id,
            sceneId: null
          },
          resources: { studio }
        };
      }
      const scene = await requireSceneForUser(input.sceneId, actor.userId);
      return {
        scope: {
          projectId: scene.project_id,
          sceneId: scene.id,
          studioId: null
        },
        resources: { scene }
      };
    },
    defaultsResolver: async ({ input, resources, scope }) => {
      // 新路径：基于 studio（环境+建筑+元素）
      if (scope.studioId) {
        const studio = resources.studio;
        const environment = await getStudioEnvironment(scope.studioId);
        const buildings = await listStudioBuildings(scope.studioId);
        const elementLinks = await listStudioElementLinks(scope.studioId);
        const completedElements = elementLinks.filter(l => l.generation_status === 'completed' && l.image_url);

        return {
          models: {
            imageModel: input.imageModel,
            textModel: input.textModel || null
          },
          inputs: {
            studioName: studio.name,
            description: studio.description || '',
            environment: environment ? {
              name: environment.name,
              description: environment.description || '',
              timeOfDay: environment.time_of_day || '',
              weather: environment.weather || '',
              lighting: environment.lighting || '',
              mood: environment.mood || ''
            } : null,
            buildings: buildings.filter(b => b.generation_status === 'completed' && b.image_url).map(b => ({
              name: b.name,
              description: b.description || '',
              interiorExterior: b.interior_exterior || 'exterior',
              structureType: b.structure_type || '',
              imageUrl: b.image_url
            })),
            elementImageUrls: completedElements.map(l => l.image_url),
            elementPositions: completedElements.map(l => ({
              name: l.name,
              category: l.category,
              description: l.description || '',
              sortOrder: l.sort_order || 0
            })),
            style: input.style || null
          },
          options: {}
        };
      }

      // 旧路径兼容：基于 scene
      const scene = resources.scene;
      if (!scene.name && !scene.description && !scene.environment) {
        throw new HttpError(400, '场景信息不足，至少需要提供场景名称、描述或环境描述之一');
      }

      let links = await listEnabledSceneElementLinks(scene.id);
      if ((!links || links.length === 0) && scene.studio_id) {
        const studioLinks = await listStudioElementLinks(scene.studio_id);
        links = studioLinks.map(l => ({
          ...l,
          position_hint: ''
        }));
      }
      const completedLinks = links.filter(l => l.generation_status === 'completed' && l.image_url);
      const elementImageUrls = completedLinks.map(l => l.image_url);
      const elementPositions = completedLinks.map(l => ({
        name: l.name,
        category: l.category,
        description: l.description || '',
        positionHint: l.position_hint || ''
      }));

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
          elementImageUrls,
          elementPositions
        },
        options: {}
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: scope.studioId ? 'studioId' : 'sceneId',
      value: scope.studioId || scope.sceneId
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
      message: command.scope.studioId ? '场景全景图生成已启动（基于场景）' : '场景全景图生成已启动',
      jobId: encodeId(result.jobId),
      studioId: command.scope.studioId || null,
      sceneId: command.scope.sceneId || null,
      status: 'generating'
    })
  },
  {
    operationKey: 'scene_elements_extract',
    workflowType: 'scene_elements_extraction',
    requestSchema: {
      type: 'object',
      required: ['sceneId', 'textModel'],
      properties: {
        sceneId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const scene = await requireSceneForUser(input.sceneId, actor.userId);
      return {
        scope: {
          projectId: scene.project_id,
          sceneId: scene.id
        },
        resources: { scene }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const scene = resources.scene;
      if (!scene.name && !scene.description && !scene.environment) {
        throw new HttpError(400, '场景信息不足，至少需要提供场景名称、描述或环境描述之一');
      }
      return {
        models: {
          textModel: input.textModel
        },
        inputs: {
          sceneName: scene.name,
          description: scene.description,
          environment: scene.environment,
          lighting: scene.lighting,
          mood: scene.mood
        },
        options: {}
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
      message: '场景元素抽取已启动',
      jobId: encodeId(result.jobId),
      sceneId: command.scope.sceneId,
      status: 'generating'
    })
  },
  {
    operationKey: 'scene_element_generate',
    workflowType: 'scene_element_generation',
    requestSchema: {
      type: 'object',
      required: ['elementId', 'imageModel'],
      properties: {
        elementId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const element = await requireSceneElementForUser(input.elementId, actor.userId);
      return {
        scope: {
          projectId: element.project_id,
          elementId: element.id
        },
        resources: { element }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const element = resources.element;
      return {
        models: {
          imageModel: input.imageModel,
          textModel: input.textModel || null
        },
        inputs: {
          elementId: element.id,
          elementName: element.name,
          elementDescription: element.description || '',
          elementCategory: element.category || 'scenery'
        },
        options: {}
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'elementId',
      value: scope.elementId
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
      message: '元素图片生成已启动',
      jobId: encodeId(result.jobId),
      elementId: command.scope.elementId,
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
        textModel: { type: 'string', minLength: 1 },
        appendMode: { type: 'boolean', default: false },
        referenceScriptContent: { type: 'string' },
        referenceScriptTitle: { type: 'string' },
        conflictStrategy: { type: 'string', enum: ['skip', 'smart', 'overwrite'] }
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
        scriptTitle: resources.script.title || `第${resources.script.episode_number}集`,
        appendMode: !!input.appendMode,
        ...(input.referenceScriptContent ? { referenceScriptContent: input.referenceScriptContent } : {}),
        ...(input.referenceScriptTitle ? { referenceScriptTitle: input.referenceScriptTitle } : {}),
        ...(input.conflictStrategy ? { conflictStrategy: input.conflictStrategy } : {})
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
      jobId: encodeId(result.jobId),
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
        clearExisting: { type: 'boolean', default: true },
        appendMode: { type: 'boolean', default: false },
        referenceScriptContent: { type: 'string' },
        referenceScriptTitle: { type: 'string' },
        conflictStrategy: { type: 'string', enum: ['skip', 'smart', 'overwrite'] }
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
          scriptTitle: resources.script.title || `第${resources.script.episode_number}集`,
          episodeNumber: resources.script.episode_number,
          totalScenes,
          parsedScenes: parsedScenes.map((s, i) => ({
            sceneNumber: s.sceneNumber || (i + 1),
            sceneName: s.sceneName || `场景${s.sceneNumber || (i + 1)}`,
            content: s.content
          })),
          appendMode: !!input.appendMode,
          ...(input.referenceScriptContent ? { referenceScriptContent: input.referenceScriptContent } : {}),
          ...(input.referenceScriptTitle ? { referenceScriptTitle: input.referenceScriptTitle } : {}),
          ...(input.conflictStrategy ? { conflictStrategy: input.conflictStrategy } : {})
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
      jobId: encodeId(result.jobId)
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      workflowType: command.workflowType,
      operationKey: command.operationKey,
      status: 'pending'
    })
  },
  {
    operationKey: 'camera_frame_generate',
    workflowType: 'camera_frame_generation',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'compositeImageUrl', 'imageModel'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        compositeImageUrl: { type: 'string', minLength: 1 },
        sourceImageUrl: { type: 'string' },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' },
        rotationX: { type: 'number', default: 0 },
        rotationY: { type: 'number', default: 0 },
        rotationZ: { type: 'number', default: 0 },
        zoomLevel: { type: 'number', default: 1 },
        mode: { type: 'string', enum: ['expand', 'focus'], default: 'expand' },
        aspectRatio: { type: 'string' },
        episodeNumber: { type: 'integer', minimum: 1 },
        storyboardIndex: { type: 'integer', minimum: 1 }
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
        compositeImageUrl: input.compositeImageUrl,
        sourceImageUrl: input.sourceImageUrl || null,
        rotationX: input.rotationX || 0,
        rotationY: input.rotationY || 0,
        rotationZ: input.rotationZ || 0,
        zoomLevel: input.zoomLevel || 1,
        mode: input.mode || 'expand',
        episodeNumber: input.episodeNumber ?? null,
        storyboardIndex: input.storyboardIndex ?? null
      },
      options: {
        aspectRatio: input.aspectRatio || null
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
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
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: '批量提示词优化任务已启动'
    })
  },
  {
    operationKey: 'single_prompt_optimize',
    workflowType: 'single_prompt_optimization',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'prompt'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        prompt: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
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
        textModel: input.textModel || null
      },
      inputs: {
        prompt: input.prompt
      },
      options: {}
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
    responseMapper: ({ result }) => ({
      success: true,
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: 'AI 优化任务已启动'
    })
  },
  {
    operationKey: 'single_image_prompt_optimize',
    workflowType: 'single_image_prompt_optimization',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'prompt'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        prompt: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
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
        textModel: input.textModel || null
      },
      inputs: {
        prompt: input.prompt
      },
      options: {}
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
    responseMapper: ({ result }) => ({
      success: true,
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: 'AI图片优化任务已启动'
    })
  },
  {
    operationKey: 'single_video_prompt_optimize',
    workflowType: 'single_video_prompt_optimization',
    requestSchema: {
      type: 'object',
      required: ['storyboardId', 'prompt'],
      properties: {
        storyboardId: { type: 'integer', minimum: 1 },
        prompt: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
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
        textModel: input.textModel || null
      },
      inputs: {
        prompt: input.prompt
      },
      options: {}
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
    responseMapper: ({ result }) => ({
      success: true,
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: 'AI视频优化任务已启动'
    })
  },
  {
    operationKey: 'batch_image_prompt_optimize',
    workflowType: 'batch_image_prompt_optimization',
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
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: '批量图片提示词优化任务已启动'
    })
  },
  {
    operationKey: 'batch_video_prompt_optimize',
    workflowType: 'batch_video_prompt_optimization',
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
      jobId: encodeId(result.jobId),
      tasks: result.tasks,
      message: '批量视频提示词优化任务已启动'
    })
  },
  {
    // 阶段1: 从剧本拆分环境与建筑
    operationKey: 'studio_components_extract',
    workflowType: 'studio_components_extraction',
    requestSchema: {
      type: 'object',
      required: ['projectId', 'scriptId', 'textModel'],
      properties: {
        projectId: { type: 'integer', minimum: 1 },
        scriptId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const project = await requireProjectForUser(input.projectId, actor.userId);
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      ensureScriptHasContent(script);
      return {
        scope: {
          projectId: project.id,
          scriptId: script.id
        },
        resources: { project, script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        textModel: input.textModel
      },
      inputs: {
        episodeNumber: resources.script.episode_number,
        scriptTitle: resources.script.title || `第${resources.script.episode_number}集`,
        scriptContent: resources.script.content
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
      message: '已从剧本拆分环境与建筑',
      jobId: encodeId(result.jobId),
      scriptId: command.scope.scriptId,
      status: 'pending'
    })
  },
  {
    // 阶段2: 拼接场景（环境+建筑+元素 → studio）
    operationKey: 'studio_compose_from_script',
    workflowType: 'studio_compose_from_script',
    requestSchema: {
      type: 'object',
      required: ['projectId', 'scriptId', 'textModel'],
      properties: {
        projectId: { type: 'integer', minimum: 1 },
        scriptId: { type: 'integer', minimum: 1 },
        textModel: { type: 'string', minLength: 1 }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const project = await requireProjectForUser(input.projectId, actor.userId);
      const script = await requireScriptForUser(input.scriptId, actor.userId);
      ensureScriptHasContent(script);
      return {
        scope: {
          projectId: project.id,
          scriptId: script.id
        },
        resources: { project, script }
      };
    },
    defaultsResolver: async ({ input, resources }) => ({
      models: {
        textModel: input.textModel
      },
      inputs: {
        episodeNumber: resources.script.episode_number,
        scriptTitle: resources.script.title || `第${resources.script.episode_number}集`,
        scriptContent: resources.script.content
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
      message: '已从剧本拼接生成场景',
      jobId: encodeId(result.jobId),
      scriptId: command.scope.scriptId,
      status: 'pending'
    })
  },
  {
    // 环境氛围图生成
    operationKey: 'environment_image_generate',
    workflowType: 'environment_image_generation',
    requestSchema: {
      type: 'object',
      required: ['environmentId', 'imageModel'],
      properties: {
        environmentId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const env = await requireEnvironmentForUser(input.environmentId, actor.userId);
      return {
        scope: {
          projectId: env.project_id,
          environmentId: env.id
        },
        resources: { env }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const env = resources.env;
      return {
        models: {
          imageModel: input.imageModel,
          textModel: input.textModel || null
        },
        inputs: {
          environmentId: env.id,
          environmentName: env.name,
          description: env.description || '',
          timeOfDay: env.time_of_day || '',
          weather: env.weather || '',
          lighting: env.lighting || '',
          mood: env.mood || '',
          generationPrompt: env.generation_prompt || null
        },
        options: {}
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'environmentId',
      value: scope.environmentId
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
      message: '环境氛围图生成已启动',
      jobId: encodeId(result.jobId),
      environmentId: command.scope.environmentId,
      status: 'generating'
    })
  },
  {
    // 建筑结构图生成
    operationKey: 'building_image_generate',
    workflowType: 'building_image_generation',
    requestSchema: {
      type: 'object',
      required: ['buildingId', 'imageModel'],
      properties: {
        buildingId: { type: 'integer', minimum: 1 },
        imageModel: { type: 'string', minLength: 1 },
        textModel: { type: 'string' }
      }
    },
    scopeResolver: async ({ actor, input }) => {
      const building = await requireBuildingForUser(input.buildingId, actor.userId);
      return {
        scope: {
          projectId: building.project_id,
          buildingId: building.id
        },
        resources: { building }
      };
    },
    defaultsResolver: async ({ input, resources }) => {
      const building = resources.building;
      return {
        models: {
          imageModel: input.imageModel,
          textModel: input.textModel || null
        },
        inputs: {
          buildingId: building.id,
          buildingName: building.name,
          description: building.description || '',
          interiorExterior: building.interior_exterior || 'exterior',
          structureType: building.structure_type || '',
          generationPrompt: building.generation_prompt || null
        },
        options: {}
      };
    },
    conflictKeyResolver: ({ scope }) => ({
      key: 'buildingId',
      value: scope.buildingId
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
      message: '建筑结构图生成已启动',
      jobId: encodeId(result.jobId),
      buildingId: command.scope.buildingId,
      status: 'generating'
    })
  }
];

module.exports = {
  operationContracts
};
