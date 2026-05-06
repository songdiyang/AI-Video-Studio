/**
 * 共享候选参考图收集模块
 * 
 * 被 frameGeneration.js 和 singleFrameGeneration.js 共同使用。
 * 负责：查询角色三视图 + 场景图 + 更新版空镜 + 上一镜头尾帧，构建完整候选列表。
 * 注意：用户上传的参考图仅在三视图生成阶段使用（characterViewsGeneration.js），
 * 不直接参与分镜帧生成，以确保风格一致性。
 */

const { queryOne, queryAll } = require('../../../dbHelper');
const { isNonCharacterEntity } = require('../../../utils/characterFilter');
const { queryActiveSceneUrl } = require('./sceneRefUtils');
const { traced, trace } = require('../../engine/generationTrace');

function assertNonEmptyString(value, fieldName, entityLabel) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${entityLabel}字段不完整: ${fieldName} 不能为空`);
  }
}

/**
 * 收集基础候选参考图（角色三视图 + 场景图）
 * @returns {{ candidateImages, characterName, characterInfo, location, sceneInfo }}
 */
const collectCandidateImages = traced('收集候选参考图', async function _collectCandidateImages(storyboard, variables) {
  const storyboardId = storyboard.id;
  const characterNames = variables.characters || [];
  const location = variables.location || '';
  const candidateImages = [];

  if (!location || String(location).trim() === '') {
    throw new Error('该镜头未指定场景：帧生成要求必须提供场景 location');
  }

  // === 优化：并行查询角色数据和场景数据 ===
  let characterName = null;
  let characterInfo = null;
  const allCharacterInfos = [];

  // 过滤非角色群体词
  const validCharNames = characterNames.filter(charName => {
    if (isNonCharacterEntity(charName)) {
      console.log(`[CandidateImages] 跳过非角色群体词「${charName}」`);
      return false;
    }
    return true;
  });

  // 构建并行查询 Promise
  const queryPromises = [];
  
  // 1. 角色查询（如果有角色）- 含白膜/服装状态三视图
  let linkedCharsPromise = null;
  if (validCharNames.length > 0) {
    const placeholders = validCharNames.map(() => '?').join(',');
    linkedCharsPromise = queryAll(
      `SELECT c.id, c.name, c.description, c.appearance, c.base_appearance, c.outfit_appearance, c.personality,
              c.image_url, c.front_view_url, c.side_view_url, c.back_view_url,
              bs.id AS base_state_id, bs.front_view_url AS base_front_view_url,
              bs.side_view_url AS base_side_view_url, bs.back_view_url AS base_back_view_url,
              cs.id AS costume_state_id, cs.name AS costume_state_name,
              cs.front_view_url AS costume_front_view_url,
              cs.side_view_url AS costume_side_view_url, cs.back_view_url AS costume_back_view_url,
              cs.outfit AS costume_outfit, cs.accessories AS costume_accessories, cs.hairstyle AS costume_hairstyle, cs.age_stage AS costume_age_stage
       FROM storyboard_characters sc
       JOIN characters c ON sc.character_id = c.id
       LEFT JOIN character_states bs ON bs.character_id = c.id AND bs.is_base_model = 1
       LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
       WHERE sc.storyboard_id = ? AND c.name IN (${placeholders})`,
      [storyboardId, ...validCharNames]
    );
    queryPromises.push(linkedCharsPromise);
  }
  
  // 2. 影棚查询（始终需要 —— 从影棚获取九宫组装图作为场景参考）
  const linkedStudioPromise = queryOne(
    `SELECT st.id AS studio_id, st.name, st.description AS studio_description,
            st.nine_grid_image_url, st.environment_id, st.environment_view,
            e.name AS env_name, e.description AS env_description,
            ss_st.image_url AS state_image_url, ss_st.name AS state_name,
            ss_st.lighting AS state_lighting, ss_st.mood AS state_mood,
            ss_st.weather AS state_weather, ss_st.time_of_day AS state_time_of_day
     FROM storyboard_scenes ssc
     JOIN studios st ON ssc.studio_id = st.id
     LEFT JOIN environments e ON st.environment_id = e.id
     LEFT JOIN studio_states ss_st ON ssc.studio_state_id = ss_st.id
     WHERE ssc.storyboard_id = ? AND st.name = ?`,
    [storyboardId, location]
  );
  queryPromises.push(linkedStudioPromise);

  // === 并行执行所有查询 ===
  const queryStartTime = Date.now();
  const queryResults = await Promise.all(queryPromises);
  console.log(`[CandidateImages] 并行查询完成，耗时: ${Date.now() - queryStartTime}ms`);

  // 解析结果
  let linkedChars = [];
  let linkedStudio;
  if (validCharNames.length > 0) {
    linkedChars = queryResults[0];
    linkedStudio = queryResults[1];
  } else {
    linkedStudio = queryResults[0];
  }

  // === 处理角色数据 ===
  if (validCharNames.length > 0) {
    // 构建 name → row 映射，O(1) 查找
    const charMap = new Map();
    for (const row of linkedChars) {
      charMap.set(row.name, row);
    }

    // 校验每个角色是否关联 + 收集白膜/服装/兆底三视图
    for (const charName of validCharNames) {
      const linkedChar = charMap.get(charName);
      if (!linkedChar) {
        throw new Error(`角色「${charName}」未与该分镜建立关联。请先运行智能分镜生成以建立资源关联。`);
      }
      assertNonEmptyString(linkedChar.description, 'description', `角色「${charName}」`);
      assertNonEmptyString(linkedChar.appearance, 'appearance', `角色「${charName}」`);
      assertNonEmptyString(linkedChar.personality, 'personality', `角色「${charName}」`);

      allCharacterInfos.push({
        name: linkedChar.name,
        appearance: linkedChar.appearance,
        description: linkedChar.description,
        personality: linkedChar.personality,
        // 白膜+服装分层外貌信息（用于帧生成提示词构建）
        base_appearance: linkedChar.base_appearance,
        outfit_appearance: linkedChar.outfit_appearance,
        costume_outfit: linkedChar.costume_outfit,
        costume_accessories: linkedChar.costume_accessories
      });

      // === 优先使用白膜三视图（体貌参考）+ 服装状态三视图（服装参考）===
      const hasBaseViews = linkedChar.base_front_view_url;
      const hasCostumeViews = linkedChar.costume_front_view_url;

      if (hasBaseViews) {
        // 白膜正面图 - 体貌参考（肤色、体型、五官、发型等不可更换特征）
        candidateImages.push({
          id: `char_${charName}_base_front`,
          label: `角色「${charName}」白膜正面图 - 体貌参考`,
          url: linkedChar.base_front_view_url,
          description: `角色「${charName}」白膜正面视图，用于保持角色体貌一致性（肤色、体型、五官、发型、瞳色），不要复制立绘姿势，服装以当前场景为准`
        });
        if (linkedChar.base_side_view_url) {
          candidateImages.push({
            id: `char_${charName}_base_side`,
            label: `角色「${charName}」白膜侧面图 - 体貌参考`,
            url: linkedChar.base_side_view_url,
            description: `角色「${charName}」白膜侧面视图，适用于侧面、过肩镜头，保持体貌一致性`
          });
        }
        if (linkedChar.base_back_view_url) {
          candidateImages.push({
            id: `char_${charName}_base_back`,
            label: `角色「${charName}」白膜背面图 - 体貌参考`,
            url: linkedChar.base_back_view_url,
            description: `角色「${charName}」白膜背面视图，适用于背面镜头，保持体貌一致性`
          });
        }
        console.log(`[CandidateImages] 角色「${charName}」白膜三视图: 正面=${!!linkedChar.base_front_view_url}, 侧面=${!!linkedChar.base_side_view_url}, 背面=${!!linkedChar.base_back_view_url}`);
      }

      if (hasCostumeViews) {
        // 服装状态正面图 - 服装参考（服装款式、配饰等可更换特征）
        const costumeLabel = linkedChar.costume_state_name || '服装';
        candidateImages.push({
          id: `char_${charName}_costume_front`,
          label: `角色「${charName}」「${costumeLabel}」正面图 - 服装参考`,
          url: linkedChar.costume_front_view_url,
          description: `角色「${charName}」「${costumeLabel}」正面视图，用于保持服装配饰一致性（服装款式、颜色、配饰、鞋子），不要复制立绘姿势`
        });
        if (linkedChar.costume_side_view_url) {
          candidateImages.push({
            id: `char_${charName}_costume_side`,
            label: `角色「${charName}」「${costumeLabel}」侧面图 - 服装参考`,
            url: linkedChar.costume_side_view_url,
            description: `角色「${charName}」「${costumeLabel}」侧面视图，保持服装配饰一致性`
          });
        }
        if (linkedChar.costume_back_view_url) {
          candidateImages.push({
            id: `char_${charName}_costume_back`,
            label: `角色「${charName}」「${costumeLabel}」背面图 - 服装参考`,
            url: linkedChar.costume_back_view_url,
            description: `角色「${charName}」「${costumeLabel}」背面视图，保持服装配饰一致性`
          });
        }
        console.log(`[CandidateImages] 角色「${charName}」服装视图: 正面=${!!linkedChar.costume_front_view_url}, 侧面=${!!linkedChar.costume_side_view_url}, 背面=${!!linkedChar.costume_back_view_url}`);
      }

      // 兜底：无白膜也无服装视图时，使用角色级视图（兼容老数据）
      if (!hasBaseViews && !hasCostumeViews) {
        const frontUrl = linkedChar.front_view_url || linkedChar.image_url;
        if (frontUrl) {
          assertNonEmptyString(linkedChar.image_url, 'image_url', `角色「${charName}」`);
          candidateImages.push({
            id: `char_${charName}_front`,
            label: `角色「${charName}」正面图`,
            url: frontUrl,
            description: `角色「${charName}」正面视图，用于保持角色外貌一致性（发型、服装、体型），不要复制立绘姿势`
          });
          if (linkedChar.side_view_url) {
            candidateImages.push({
              id: `char_${charName}_side`,
              label: `角色「${charName}」侧面图`,
              url: linkedChar.side_view_url,
              description: `角色「${charName}」侧面视图，适用于侧面、过肩镜头，或角色侧对观众说话的场景`
            });
          }
          if (linkedChar.back_view_url) {
            candidateImages.push({
              id: `char_${charName}_back`,
              label: `角色「${charName}」背面图`,
              url: linkedChar.back_view_url,
              description: `角色「${charName}」背面视图，适用于背面镜头，或角色背对观众的场景`
            });
          }
        }
        console.log(`[CandidateImages] 角色「${charName}」(兆底)角色级三视图: 正面=${!!frontUrl}, 侧面=${!!linkedChar.side_view_url}, 背面=${!!linkedChar.back_view_url}`);
      }
    }

    // 注意：用户上传的参考图不在此处收集，参考图仅用于三视图生成阶段（characterViewsGeneration.js）
    // 分镜帧生成仅依赖三视图 + 场景图来保证风格一致性

    // 兼容旧逻辑：单角色时保留 characterName 和 characterInfo
    if (characterNames.length === 1) {
      characterName = characterNames[0];
      characterInfo = allCharacterInfos[0];
    } else {
      // 多角色时，characterInfo 包含所有角色信息
      characterInfo = allCharacterInfos;
    }
  }

  // === 处理影棚数据 ===
  if (!linkedStudio) {
    throw new Error(`影棚「${location}」未与该分镜建立关联。请先运行智能分镜生成以建立资源关联。`);
  }

  if (!linkedStudio.nine_grid_image_url) {
    throw new Error(`影棚「${location}」缺少九宫组装图，请先到影棚中生成九宫组装图`);
  }

  // 九宫组装图作为唯一场景参考（全方位多机位）
  candidateImages.push({
    id: 'scene_nine_grid',
    label: `影棚「${location}」九宫组装图`,
    url: linkedStudio.nine_grid_image_url,
    description: `影棚「${location}」的3×3九宫组装图，展示场景多个机位视角（主视/左视/右视/俯视/仰视/远景/中景/建筑细节/环境细节），提供全方位场景空间参考`
  });

  // 构建 sceneInfo（从影棚 + 环境 + 状态派生）
  const sceneInfo = {
    name: linkedStudio.name,
    description: linkedStudio.env_description || linkedStudio.studio_description || `${location}场景`,
    environment: linkedStudio.env_description || `${location}场景`,
    lighting: linkedStudio.state_lighting || '自然光',
    mood: linkedStudio.state_mood || '中性',
    spatialLayout: null,
    cameraDefaults: null
  };

  return { candidateImages, characterName, characterInfo, location, sceneInfo };
}, {
  extractInput: (sb, vars) => ({ storyboardId: sb?.id, characters: vars?.characters, location: vars?.location }),
  extractOutput: (r) => ({ candidateCount: r.candidateImages?.length, character: r.characterName, location: r.location })
});

/**
 * 追加上下文候选图（更新版空镜 + 上一镜头尾帧）
 * 
 * @param {Object} opts
 * @param {Array} opts.candidateImages - 基础候选图列表（会被修改）
 * @param {Object} opts.storyboard - 当前分镜数据
 * @param {Object} opts.variables - 当前分镜 variables_json
 * @param {string} opts.location - 当前场景名
 * @param {string} [opts.activeSceneUrl] - 调用方传入的更新版空镜 URL
 * @param {string} [opts.prevEndFrameUrl] - 调用方传入的上一帧尾帧 URL
 * @param {string} [opts.prevDescription] - 调用方传入的上一帧描述
 * @param {string} [opts.prevEndState] - 调用方传入的上一帧结束状态
 * @param {boolean} [opts.isFirstScene] - 是否首镜头
 * @returns {{ prevShotData, resolvedPrevEndState, resolvedPrevDescription, resolvedIsFirstScene }}
 */
async function appendContextCandidates(opts) {
  const {
    candidateImages, storyboard, variables, location,
    activeSceneUrl, prevEndFrameUrl, prevDescription,
    prevEndState: inputPrevEndState, isFirstScene
  } = opts;

  // 查询更新版空镜场景图
  let resolvedActiveUrl = activeSceneUrl || null;
  if (!resolvedActiveUrl) {
    resolvedActiveUrl = await queryActiveSceneUrl(storyboard.script_id, storyboard.idx, variables.location || location);
  }
  if (resolvedActiveUrl) {
    candidateImages.push({
      id: 'scene_updated',
      label: `场景「${variables.location || location}」更新版空镜图`,
      url: resolvedActiveUrl,
      description: '之前镜头中环境发生变化后生成的空镜场景图（无角色），展示变化后的环境状态'
    });
  }

  // 判断是否首镜头
  let resolvedIsFirstScene = isFirstScene;
  if (resolvedIsFirstScene === undefined || resolvedIsFirstScene === null) {
    const scriptId = storyboard.script_id;
    const currentIdx = storyboard.idx;
    resolvedIsFirstScene = !(scriptId != null && currentIdx != null && currentIdx > 0);
  }

  // 查询上一镜头数据
  let resolvedPrevEndFrameUrl = prevEndFrameUrl || null;
  let resolvedPrevDescription = prevDescription || null;
  let resolvedPrevEndState = inputPrevEndState || null;
  let prevShotData = null;

  if (!resolvedIsFirstScene) {
    const scriptId = storyboard.script_id;
    const currentIdx = storyboard.idx;
    if (scriptId != null && currentIdx != null) {
      const prevSb = await queryOne(
        'SELECT id, prompt_template, variables_json, first_frame_url, last_frame_url FROM storyboards WHERE script_id = ? AND idx = ?',
        [scriptId, currentIdx - 1]
      );
      if (prevSb) {
        let prevVars = {};
        try {
          prevVars = typeof prevSb.variables_json === 'string'
            ? JSON.parse(prevSb.variables_json || '{}')
            : (prevSb.variables_json || {});
        } catch (e) { prevVars = {}; }
        prevShotData = { prompt_template: prevSb.prompt_template, variables_json: prevVars, first_frame_url: prevSb.first_frame_url, last_frame_url: prevSb.last_frame_url };
        const prevHasAction = prevVars.hasAction || false;
        if (!resolvedPrevEndFrameUrl) {
          resolvedPrevEndFrameUrl = (prevHasAction && prevSb.last_frame_url)
            ? prevSb.last_frame_url
            : (prevSb.first_frame_url || null);
        }
        if (!resolvedPrevDescription) resolvedPrevDescription = prevSb.prompt_template || null;
        if (!resolvedPrevEndState) resolvedPrevEndState = prevVars.endState || null;

        // 将上一镜头尾帧加入候选，并附带场景信息供 AI 跨场景判断
        if (resolvedPrevEndFrameUrl) {
          const prevLocation = prevVars.location || '未知';
          const currentLocation = variables.location || location;
          const isSameScene = prevLocation === currentLocation;
          candidateImages.push({
            id: 'prev_end_frame',
            label: '上一镜头尾帧',
            url: resolvedPrevEndFrameUrl,
            description: `上一镜头结束时的画面（场景: ${prevLocation}${isSameScene ? '，与当前镜头同一场景' : `，与当前镜头「${currentLocation}」不同场景`}）。用于保持镜头间角色姿势、位置、光线的连续性`
          });
          trace('查询上一镜头数据', { hasPrevEndFrame: true, hasPrevEndState: !!resolvedPrevEndState, prevEndState: resolvedPrevEndState, prevLocation, isSameScene });
        } else {
          // 不再强制要求上一镜头尾帧，改为警告并继续
          // 画风统一将通过角色参考图和场景参考图来保证
          console.warn('[collectCandidateImages] 非首镜头缺少上一镜头尾帧参考图，将依赖角色/场景参考图保持画风统一');
          trace('上一镜头无尾帧', { prevIdx: currentIdx - 1, willContinue: true });
        }
      }
    }
  } else {
    trace('首镜头，无上一镜头数据');
  }

  return { prevShotData, resolvedPrevEndState, resolvedPrevDescription, resolvedIsFirstScene };
}

module.exports = { collectCandidateImages, appendContextCandidates };
