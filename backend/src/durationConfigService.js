/**
 * 分镜时长配置服务
 * 从 system_configs 表读取时长相关配置，支持默认值兜底
 */

const { queryOne } = require('./dbHelper');

const DURATION_CONFIG_DEFAULTS = {
  storyboard_min_duration: 60,
  storyboard_max_duration: 180,
  batch_scene_min_duration: 15,
  batch_scene_max_duration: 60,
  duration_tolerance: 2
};

/**
 * 获取单个时长配置值
 * @param {string} key 配置键名
 * @returns {Promise<number>} 配置值（数字）
 */
async function getDurationConfig(key) {
  try {
    const config = await queryOne(
      'SELECT config_value FROM system_configs WHERE config_key = ? AND is_active = 1',
      [key]
    );
    if (config && config.config_value !== null && config.config_value !== undefined) {
      const val = typeof config.config_value === 'string' ? JSON.parse(config.config_value) : config.config_value;
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) return num;
    }
  } catch (e) {
    console.error(`[DurationConfig] 获取配置 ${key} 失败:`, e.message);
  }
  return DURATION_CONFIG_DEFAULTS[key] || 0;
}

/**
 * 批量获取分镜生成的时长配置（减少数据库查询次数）
 * @returns {Promise<{minDuration: number, maxDuration: number, tolerance: number}>}
 */
async function getStoryboardDurationConfig() {
  const [minDuration, maxDuration, tolerance] = await Promise.all([
    getDurationConfig('storyboard_min_duration'),
    getDurationConfig('storyboard_max_duration'),
    getDurationConfig('duration_tolerance')
  ]);
  return { minDuration, maxDuration, tolerance };
}

/**
 * 批量获取批量场景生成的时长配置
 * @returns {Promise<{minDuration: number, maxDuration: number, tolerance: number}>}
 */
async function getBatchSceneDurationConfig() {
  const [minDuration, maxDuration, tolerance] = await Promise.all([
    getDurationConfig('batch_scene_min_duration'),
    getDurationConfig('batch_scene_max_duration'),
    getDurationConfig('duration_tolerance')
  ]);
  return { minDuration, maxDuration, tolerance };
}

module.exports = {
  getDurationConfig,
  getStoryboardDurationConfig,
  getBatchSceneDurationConfig,
  DURATION_CONFIG_DEFAULTS
};
