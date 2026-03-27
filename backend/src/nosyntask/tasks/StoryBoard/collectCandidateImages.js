/**
 * 共享候选参考图收集模块
 * 
 * 被 frameGeneration.js 和 singleFrameGeneration.js 共同使用。
 * 负责：查询角色三视图 + 用户上传参考图 + 场景图 + 更新版空镜 + 上一镜头尾帧，构建完整候选列表。
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

  // 通过关联表查询角色（含三视图 URL）
  // 支持多角色：收集所有角色的图片
  let characterName = null;
  let characterInfo = null;
  const allCharacterInfos = [];

  if (characterNames.length > 0) {
    // 过滤非角色群体词
    const validCharNames = characterNames.filter(charName => {
      if (isNonCharacterEntity(charName)) {
        console.log(`[CandidateImages] 跳过非角色群体词「${charName}」`);
        return false;
      }
      return true;
    });

    if (validCharNames.length > 0) {
      // 批量查询所有角色（1 次 DB 查询代替 N 次）
      const placeholders = validCharNames.map(() => '?').join(',');
      const linkedChars = await queryAll(
        `SELECT c.id, c.name, c.description, c.appearance, c.personality,
                c.image_url, c.front_view_url, c.side_view_url, c.back_view_url
         FROM storyboard_characters sc
         JOIN characters c ON sc.character_id = c.id
         WHERE sc.storyboard_id = ? AND c.name IN (${placeholders})`,
        [storyboardId, ...validCharNames]
      );

      // 构建 name → row 映射，O(1) 查找
      const charMap = new Map();
      for (const row of linkedChars) {
        charMap.set(row.name, row);
      }

      // 校验每个角色是否关联 + 收集 charIds 用于批量查参考图
      const charIds = [];
      for (const charName of validCharNames) {
        const linkedChar = charMap.get(charName);
        if (!linkedChar) {
          throw new Error(`角色「${charName}」未与该分镜建立关联。请先运行智能分镜生成以建立资源关联。`);
        }
        assertNonEmptyString(linkedChar.description, 'description', `角色「${charName}」`);
        assertNonEmptyString(linkedChar.appearance, 'appearance', `角色「${charName}」`);
        assertNonEmptyString(linkedChar.personality, 'personality', `角色「${charName}」`);
        assertNonEmptyString(linkedChar.image_url, 'image_url', `角色「${charName}」`);

        allCharacterInfos.push({
          name: linkedChar.name,
          appearance: linkedChar.appearance,
          description: linkedChar.description,
          personality: linkedChar.personality
        });
        charIds.push(linkedChar.id);

        // 三视图候选
        const frontUrl = linkedChar.front_view_url || linkedChar.image_url;
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
        console.log(`[CandidateImages] 角色「${charName}」三视图: 正面=${!!frontUrl}, 侧面=${!!linkedChar.side_view_url}, 背面=${!!linkedChar.back_view_url}`);
      }

      // 批量查询所有角色的用户上传参考图（1 次 DB 查询代替 N 次）
      if (charIds.length > 0) {
        const refPlaceholders = charIds.map(() => '?').join(',');
        const allRefImages = await queryAll(
          `SELECT asset_id, image_url, description, view_type FROM asset_reference_images
           WHERE asset_type = 'character' AND asset_id IN (${refPlaceholders})
           ORDER BY sort_order ASC`,
          charIds
        );

        // 按 asset_id 分组
        const refByCharId = new Map();
        for (const ref of allRefImages) {
          if (!refByCharId.has(ref.asset_id)) refByCharId.set(ref.asset_id, []);
          refByCharId.get(ref.asset_id).push(ref);
        }

        const viewTypeLabels = {
          front: '用户上传正面参考图',
          side: '用户上传侧面参考图',
          back: '用户上传背面参考图',
          other: '用户上传参考图'
        };
        const viewTypeDescs = {
          front: '用户上传的角色正面参考图，适用于正面、面部特写镜头',
          side: '用户上传的角色侧面参考图，适用于侧面、过肩镜头',
          back: '用户上传的角色背面参考图，适用于背影镜头',
          other: '用户上传的其他角色参考图，用于补充角色细节'
        };

        for (let ci = 0; ci < validCharNames.length; ci++) {
          const charName = validCharNames[ci];
          const charId = charIds[ci];
          const userRefImages = refByCharId.get(charId) || [];
          for (let i = 0; i < userRefImages.length; i++) {
            const refImg = userRefImages[i];
            const vt = refImg.view_type || 'other';
            candidateImages.push({
              id: `char_${charName}_user_${vt}_${i}`,
              label: `${viewTypeLabels[vt]}（${charName}）`,
              url: refImg.image_url,
              description: refImg.description || viewTypeDescs[vt]
            });
          }
          if (userRefImages.length > 0) {
            console.log(`[CandidateImages] 角色「${charName}」用户上传参考图: ${userRefImages.length} 张`);
          }
        }
      }
    }

    // 兼容旧逻辑：单角色时保留 characterName 和 characterInfo
    if (characterNames.length === 1) {
      characterName = characterNames[0];
      characterInfo = allCharacterInfos[0];
    } else {
      // 多角色时，characterInfo 包含所有角色信息
      characterInfo = allCharacterInfos;
    }
  }

  // 通过关联表查询场景（含 A/B 两面 + 生成提示词 + 空间布局）
  const linkedScene = await queryOne(
    `SELECT s.name, s.description, s.environment, s.lighting, s.mood,
            s.image_url, s.reverse_image_url,
            s.generation_prompt, s.reverse_generation_prompt,
            s.spatial_layout, s.camera_defaults
     FROM storyboard_scenes ss
     JOIN scenes s ON ss.scene_id = s.id
     WHERE ss.storyboard_id = ? AND s.name = ?`,
    [storyboardId, location]
  );
  if (!linkedScene) {
    throw new Error(`场景「${location}」未与该分镜建立关联。请先运行智能分镜生成以建立资源关联。`);
  }
  assertNonEmptyString(linkedScene.description, 'description', `场景「${location}」`);
  // 对于老数据缺失的字段，自动填充默认值而不是报错
  if (!linkedScene.environment || linkedScene.environment.trim() === '') {
    linkedScene.environment = `${location}场景`;
    console.log(`[CandidateImages] 场景「${location}」缺少 environment 字段，已自动填充默认值`);
  }
  if (!linkedScene.lighting || linkedScene.lighting.trim() === '') {
    linkedScene.lighting = '自然光';
    console.log(`[CandidateImages] 场景「${location}」缺少 lighting 字段，已自动填充默认值`);
  }
  if (!linkedScene.mood || linkedScene.mood.trim() === '') {
    linkedScene.mood = '中性';
    console.log(`[CandidateImages] 场景「${location}」缺少 mood 字段，已自动填充默认值`);
  }
  assertNonEmptyString(linkedScene.image_url, 'image_url', `场景「${location}」`);

  // A 面候选图（附带生成提示词摘要，帮助 AI 推断拍摄方向）
  const aPromptHint = linkedScene.generation_prompt
    ? `。图片内容：${linkedScene.generation_prompt.substring(0, 120)}`
    : '';
  candidateImages.push({ id: 'scene_original', label: `场景「${location}」A面（正打）`, url: linkedScene.image_url, description: `场景 A 面空镜参考图（主视角/正打方向），提供环境色调、光照、氛围参考${aPromptHint}` });

  // B 面候选图
  if (linkedScene.reverse_image_url) {
    const bPromptHint = linkedScene.reverse_generation_prompt
      ? `。图片内容：${linkedScene.reverse_generation_prompt.substring(0, 120)}`
      : '';
    candidateImages.push({ id: 'scene_reverse', label: `场景「${location}」B面（反打）`, url: linkedScene.reverse_image_url, description: `场景 B 面空镜参考图（180°反打方向），与 A 面视角相反。当摄像机从 A 面的反方向拍摄时应选此图${bPromptHint}` });
  }

  const sceneInfo = {
    name: linkedScene.name,
    description: linkedScene.description,
    environment: linkedScene.environment,
    lighting: linkedScene.lighting,
    mood: linkedScene.mood,
    // 新增：空间布局和摄像机默认参数
    spatialLayout: linkedScene.spatial_layout ? (
      typeof linkedScene.spatial_layout === 'string' 
        ? JSON.parse(linkedScene.spatial_layout) 
        : linkedScene.spatial_layout
    ) : null,
    cameraDefaults: linkedScene.camera_defaults ? (
      typeof linkedScene.camera_defaults === 'string' 
        ? JSON.parse(linkedScene.camera_defaults) 
        : linkedScene.camera_defaults
    ) : null
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
          throw new Error('非首镜头缺少上一镜头的尾帧参考图（上一镜头未生成帧图片），无法保证镜头连续性。请先确保上一镜头已生成帧图片。');
        }
      }
    }
  } else {
    trace('首镜头，无上一镜头数据');
  }

  return { prevShotData, resolvedPrevEndState, resolvedPrevDescription, resolvedIsFirstScene };
}

module.exports = { collectCandidateImages, appendContextCandidates };
