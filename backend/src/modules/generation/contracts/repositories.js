const { queryOne, queryAll } = require('../../../dbHelper');
const { HttpError } = require('../utils/httpErrors');

async function requireProjectForUser(projectId, userId) {
  const project = await queryOne(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );

  if (!project) {
    throw new HttpError(404, '项目不存在或无权访问');
  }

  return project;
}

async function requireScriptForUser(scriptId, userId) {
  const script = await queryOne(
    'SELECT * FROM scripts WHERE id = ? AND user_id = ?',
    [scriptId, userId]
  );

  if (!script) {
    throw new HttpError(404, '剧本不存在或无权访问');
  }

  return script;
}

async function requireCharacterForUser(characterId, userId) {
  const character = await queryOne(
    'SELECT * FROM characters WHERE id = ? AND user_id = ?',
    [characterId, userId]
  );

  if (!character) {
    throw new HttpError(404, '角色不存在');
  }

  return character;
}

async function requireCostumeForUser(costumeId, userId) {
  const costume = await queryOne(
    'SELECT * FROM costumes WHERE id = ? AND user_id = ?',
    [costumeId, userId]
  );

  if (!costume) {
    throw new HttpError(404, '服装不存在或无权访问');
  }

  return costume;
}

async function requireSceneForUser(sceneId, userId) {
  const scene = await queryOne(
    'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
    [sceneId, userId]
  );

  if (!scene) {
    throw new HttpError(404, '场景不存在');
  }

  return scene;
}

async function listScenesForProject(projectId, userId) {
  return queryAll(
    `SELECT id, name, description, environment, lighting, mood, image_url, generation_prompt
     FROM scenes
     WHERE project_id = ? AND user_id = ?`,
    [projectId, userId]
  );
}

async function requireStoryboardForUser(storyboardId, userId) {
  const storyboard = await queryOne(
    `SELECT sb.*, sc.project_id, sc.user_id, sc.episode_number, sc.title AS script_title
     FROM storyboards sb
     JOIN scripts sc ON sb.script_id = sc.id
     WHERE sb.id = ? AND sc.user_id = ?`,
    [storyboardId, userId]
  );

  if (!storyboard) {
    throw new HttpError(404, '分镜不存在或无权访问');
  }

  return storyboard;
}

async function requireStateForUser(stateId, characterId, userId) {
  // 先验证角色归属
  const character = await queryOne(
    'SELECT id, name, appearance, personality, description, project_id, gender FROM characters WHERE id = ? AND user_id = ?',
    [characterId, userId]
  );
  if (!character) {
    throw new HttpError(404, '角色不存在或无权访问');
  }

  const state = await queryOne(
    'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
    [stateId, characterId]
  );
  if (!state) {
    throw new HttpError(404, '角色状态不存在');
  }

  return { character, state };
}

async function requireSceneElementForUser(elementId, userId) {
  const element = await queryOne(
    'SELECT * FROM scene_elements WHERE id = ? AND user_id = ?',
    [elementId, userId]
  );

  if (!element) {
    throw new HttpError(404, '场景元素不存在或无权访问');
  }

  return element;
}

async function listEnabledSceneElementLinks(sceneId) {
  return queryAll(
    `SELECT l.element_id, l.position_hint, l.sort_order,
            e.name, e.category, e.description, e.image_url, e.generation_status
     FROM scene_element_links l
     JOIN scene_elements e ON e.id = l.element_id
     WHERE l.scene_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`,
    [sceneId]
  );
}

async function requireStudioForUser(studioId, userId) {
  const studio = await queryOne(
    'SELECT * FROM studios WHERE id = ? AND user_id = ?',
    [studioId, userId]
  );

  if (!studio) {
    throw new HttpError(404, '场景不存在或无权访问');
  }

  return studio;
}

async function requireEnvironmentForUser(environmentId, userId) {
  const env = await queryOne(
    'SELECT * FROM environments WHERE id = ? AND user_id = ?',
    [environmentId, userId]
  );

  if (!env) {
    throw new HttpError(404, '环境不存在或无权访问');
  }

  return env;
}

async function requireBuildingForUser(buildingId, userId) {
  const building = await queryOne(
    'SELECT * FROM buildings WHERE id = ? AND user_id = ?',
    [buildingId, userId]
  );

  if (!building) {
    throw new HttpError(404, '建筑不存在或无权访问');
  }

  return building;
}

async function listStudioBuildings(studioId) {
  return queryAll(
    `SELECT b.id, b.name, b.description, b.interior_exterior, b.structure_type,
            b.image_url, b.generation_status, l.sort_order
     FROM studio_building_links l
     JOIN buildings b ON b.id = l.building_id
     WHERE l.studio_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`,
    [studioId]
  );
}

async function getStudioEnvironment(studioId) {
  return queryOne(
    `SELECT e.id, e.name, e.description, e.time_of_day, e.weather, e.lighting, e.mood,
            e.image_url, e.generation_status
     FROM studios s
     JOIN environments e ON e.id = s.environment_id
     WHERE s.id = ?`,
    [studioId]
  ) || null;
}

async function listStudioElementLinks(studioId) {
  return queryAll(
    `SELECT l.element_id, l.sort_order,
            e.name, e.category, e.description, e.image_url, e.generation_status
     FROM studio_element_links l
     JOIN scene_elements e ON e.id = l.element_id
     WHERE l.studio_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`,
    [studioId]
  );
}

module.exports = {
  requireProjectForUser,
  requireScriptForUser,
  requireCharacterForUser,
  requireCostumeForUser,
  requireSceneForUser,
  listScenesForProject,
  requireStoryboardForUser,
  requireStateForUser,
  requireSceneElementForUser,
  listEnabledSceneElementLinks,
  requireStudioForUser,
  requireEnvironmentForUser,
  requireBuildingForUser,
  listStudioBuildings,
  getStudioEnvironment,
  listStudioElementLinks
};
