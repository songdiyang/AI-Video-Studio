/**
 * 分镜关联查询
 * 
 * 查询分镜关联的角色/场景ID和详情
 */

const { queryAll } = require('../dbHelper');

/**
 * 查询单个分镜关联的角色和场景
 * 
 * @param {number} storyboardId
 * @returns {Promise<{characters: object[], scenes: object[]}>}
 */
async function getStoryboardLinks(storyboardId) {
  if (!storyboardId) return { characters: [], scenes: [] };

  const [characters, scenes] = await Promise.all([
    queryAll(
      `SELECT sc.character_id, sc.role_type, c.name, c.appearance, c.image_url,
              c.base_appearance, c.outfit_appearance,
              bs.front_view_url AS base_front_view_url,
              bs.is_base_model AS has_base_model,
              cs.name AS active_state_name,
              cs.outfit AS active_state_outfit,
              cs.front_view_url AS active_state_image_url
       FROM storyboard_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_states bs ON bs.character_id = c.id AND bs.is_base_model = 1
       LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
       WHERE sc.storyboard_id = ?`,
      [storyboardId]
    ),
    queryAll(
      `SELECT ss.scene_id, s.name, s.description, s.image_url
       FROM storyboard_scenes ss
       JOIN scenes s ON s.id = ss.scene_id
       WHERE ss.storyboard_id = ?`,
      [storyboardId]
    )
  ]);

  return { characters, scenes };
}

/**
 * 批量查询多个分镜的关联（用于列表页，减少 N+1 查询）
 * 
 * @param {number[]} storyboardIds
 * @returns {Promise<Map<number, {characters: object[], scenes: object[]}>>}
 */
async function getBatchStoryboardLinks(storyboardIds) {
  const result = new Map();
  if (!storyboardIds || storyboardIds.length === 0) return result;

  // 初始化空结构
  for (const id of storyboardIds) {
    result.set(id, { characters: [], scenes: [] });
  }

  const placeholders = storyboardIds.map(() => '?').join(',');

  const [charRows, sceneRows] = await Promise.all([
    queryAll(
      `SELECT sc.storyboard_id, sc.character_id, sc.role_type, c.name, c.appearance, c.image_url,
              c.base_appearance, c.outfit_appearance,
              bs.front_view_url AS base_front_view_url,
              bs.is_base_model AS has_base_model,
              cs.name AS active_state_name,
              cs.outfit AS active_state_outfit,
              cs.front_view_url AS active_state_image_url
       FROM storyboard_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_states bs ON bs.character_id = c.id AND bs.is_base_model = 1
       LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
       WHERE sc.storyboard_id IN (${placeholders})`,
      storyboardIds
    ),
    queryAll(
      `SELECT ss.storyboard_id, ss.scene_id, s.name, s.description, s.image_url
       FROM storyboard_scenes ss
       JOIN scenes s ON s.id = ss.scene_id
       WHERE ss.storyboard_id IN (${placeholders})`,
      storyboardIds
    )
  ]);

  for (const row of charRows) {
    const entry = result.get(row.storyboard_id);
    if (entry) {
      entry.characters.push({
        character_id: row.character_id,
        role_type: row.role_type,
        name: row.name,
        appearance: row.appearance,
        image_url: row.image_url,
        base_appearance: row.base_appearance,
        outfit_appearance: row.outfit_appearance,
        base_front_view_url: row.base_front_view_url,
        has_base_model: row.has_base_model,
        active_state_name: row.active_state_name,
        active_state_outfit: row.active_state_outfit,
        active_state_image_url: row.active_state_image_url
      });
    }
  }

  for (const row of sceneRows) {
    const entry = result.get(row.storyboard_id);
    if (entry) {
      entry.scenes.push({
        scene_id: row.scene_id,
        name: row.name,
        description: row.description,
        image_url: row.image_url
      });
    }
  }

  return result;
}

module.exports = { getStoryboardLinks, getBatchStoryboardLinks };
