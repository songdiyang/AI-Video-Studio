/**
 * ModelRouter - 智能模型路由服务
 *
 * 根据任务需求自动选择最优模型，支持：
 * - 能力匹配
 * - 质量评分排序
 * - 成本约束
 * - Fallback 降级
 */

const { queryOne, queryAll } = require('../dbHelper');

class ModelRouter {
  // ============================================================
  // 核心路由方法
  // ============================================================

  /**
   * 根据任务需求选择最佳模型
   * @param {object} requirements - 需求条件
   * @param {string[]} requirements.capabilities - 必需能力标签
   * @param {number} [requirements.minQuality] - 最低质量要求 (0-1)
   * @param {number} [requirements.maxCost] - 最大成本限制
   * @param {number} [requirements.preferredProvider] - 优先平台ID
   * @returns {Promise<object|null>} 模型配置
   */
  async selectModel(requirements) {
    const {
      capabilities = [],
      minQuality = 0.3,
      maxCost,
      preferredProvider
    } = requirements;

    // 构建查询条件
    let sql = `
      SELECT 
        m.id, m.name, m.provider_id, m.model_id, m.capabilities,
        m.metadata, m.pricing, m.quality_score, m.is_recommended,
        p.name as provider_name, p.display_name as provider_display_name,
        p.base_url, p.api_key
      FROM ai_models_v2 m
      JOIN model_providers p ON m.provider_id = p.id
      WHERE m.is_active = 1
        AND p.is_active = 1
        AND m.quality_score >= ?
    `;
    const params = [minQuality];

    // 能力匹配（JSON 包含查询）
    if (capabilities.length > 0) {
      // MySQL 8.0 JSON_CONTAINS 查询
      const capabilityConditions = capabilities.map(() =>
        `JSON_CONTAINS(m.capabilities, JSON_QUOTE(?))`
      ).join(' AND ');
      sql += ` AND (${capabilityConditions})`;
      params.push(...capabilities);
    }

    // 优先平台
    if (preferredProvider) {
      sql += ` AND m.provider_id = ?`;
      params.push(preferredProvider);
    }

    // 排序：推荐优先 > 质量分降序
    sql += ` ORDER BY m.is_recommended DESC, m.quality_score DESC`;

    const candidates = await queryAll(sql, params);

    if (candidates.length === 0) {
      console.warn(`[ModelRouter] 未找到满足条件的模型:`, requirements);
      return null;
    }

    // 成本过滤
    let filtered = candidates;
    if (maxCost !== undefined) {
      filtered = candidates.filter(m => this.estimateCost(m) <= maxCost);
    }

    if (filtered.length === 0) {
      console.warn(`[ModelRouter] 成本过滤后无可用模型，回退到第一个候选`);
      filtered = candidates;
    }

    const selected = filtered[0];
    console.log(`[ModelRouter] 选择模型: ${selected.name} (quality: ${selected.quality_score})`);

    return this.formatModelConfig(selected);
  }

  /**
   * 为工作流步骤选择模型
   * @param {string} stepType - 步骤类型
   * @param {object} [projectConfig] - 项目配置
   * @returns {Promise<object|null>}
   */
  async selectModelForWorkflowStep(stepType, projectConfig = {}) {
    // 1. 先查路由规则
    const rule = await queryOne(
      `SELECT * FROM model_routing_rules 
       WHERE task_type = ? AND is_active = 1 
       ORDER BY priority DESC LIMIT 1`,
      [stepType]
    );

    if (rule?.preferred_model_id) {
      // 使用规则指定的模型
      const model = await queryOne(
        `SELECT m.*, p.name as provider_name, p.display_name as provider_display_name,
                p.base_url, p.api_key
         FROM ai_models_v2 m
         JOIN model_providers p ON m.provider_id = p.id
         WHERE m.id = ? AND m.is_active = 1`,
        [rule.preferred_model_id]
      );

      if (model) {
        return this.formatModelConfig(model);
      }
    }

    // 2. 根据规则的能力要求或步骤类型推断
    const capabilities = this.inferCapabilitiesForStep(stepType);
    const minQuality = rule?.min_quality_score || 0.3;

    return await this.selectModel({
      capabilities,
      minQuality,
      preferredProvider: projectConfig.preferredProvider
    });
  }

  /**
   * 获取 Fallback 模型列表
   * @param {object} primaryModel - 首选模型
   * @param {string[]} capabilities - 必需能力
   * @returns {Promise<object[]>}
   */
  async getFallbackModels(primaryModel, capabilities) {
    const models = await queryAll(
      `SELECT m.*, p.name as provider_name, p.base_url, p.api_key
       FROM ai_models_v2 m
       JOIN model_providers p ON m.provider_id = p.id
       WHERE m.is_active = 1
         AND m.id != ?
         AND m.provider_id = ?
       ORDER BY m.quality_score DESC
       LIMIT 3`,
      [primaryModel.id, primaryModel.provider_id]
    );

    return models.map(m => this.formatModelConfig(m));
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 推断步骤所需能力
   */
  inferCapabilitiesForStep(stepType) {
    const capabilityMap = {
      // 文本生成类
      'storyboard_generation': ['chat'],
      'character_extraction': ['chat'],
      'scene_state_analysis': ['chat'],
      'script_generation': ['chat'],
      'script_split': ['chat'],
      'prompt_optimization': ['chat', 'reasoning'],

      // 图像生成类
      'image_generation': ['image_gen'],
      'frame_generation': ['image_gen'],
      'character_views_generation': ['image_gen'],
      'costume_views_generation': ['image_gen'],
      'scene_image_generation': ['image_gen'],

      // 视频生成类
      'video_generation': ['video_gen'],
      'scene_video_generation': ['video_gen'],
      'batch_scene_video_generation': ['video_gen'],

      // 多模态类
      'smart_parse': ['chat', 'vision'],
      'magic_paint_generation': ['image_gen'],

      // 默认
      'default': ['chat']
    };

    return capabilityMap[stepType] || capabilityMap['default'];
  }

  /**
   * 估算模型调用成本
   */
  estimateCost(model) {
    try {
      const pricing = typeof model.pricing === 'string'
        ? JSON.parse(model.pricing)
        : model.pricing;

      if (!pricing?.components) return Infinity;

      // 取第一个计费组件的价格作为参考
      const firstComponent = pricing.components[0];
      return firstComponent?.price || Infinity;
    } catch {
      return Infinity;
    }
  }

  /**
   * 格式化模型配置（统一输出结构）
   */
  formatModelConfig(model) {
    return {
      id: model.id,
      name: model.name,
      modelId: model.model_id,
      providerId: model.provider_id,
      providerName: model.provider_name,
      providerDisplayName: model.provider_display_name,
      capabilities: typeof model.capabilities === 'string'
        ? JSON.parse(model.capabilities)
        : model.capabilities,
      metadata: typeof model.metadata === 'string'
        ? JSON.parse(model.metadata)
        : model.metadata,
      pricing: typeof model.pricing === 'string'
        ? JSON.parse(model.pricing)
        : model.pricing,
      qualityScore: model.quality_score,
      isRecommended: model.is_recommended === 1,

      // 平台配置（用于 Adapter 初始化）
      _provider: {
        id: model.provider_id,
        name: model.provider_name,
        display_name: model.provider_display_name,
        base_url: model.base_url,
        api_key: model.api_key
      }
    };
  }

  /**
   * 更新路由规则
   */
  async updateRoutingRule(taskType, preferredModelId, options = {}) {
    const {
      fallbackModelIds = [],
      minQuality = 0.3,
      maxCost,
      priority = 0
    } = options;

    const capabilities = JSON.stringify(this.inferCapabilitiesForStep(taskType));
    const fallbackIds = JSON.stringify(fallbackModelIds);

    await queryOne(
      `INSERT INTO model_routing_rules (
        task_type, required_capabilities, preferred_model_id,
        fallback_model_ids, min_quality_score, max_cost_per_request, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        preferred_model_id = VALUES(preferred_model_id),
        fallback_model_ids = VALUES(fallback_model_ids),
        min_quality_score = VALUES(min_quality_score),
        max_cost_per_request = VALUES(max_cost_per_request),
        priority = VALUES(priority),
        updated_at = NOW()`,
      [taskType, capabilities, preferredModelId, fallbackIds, minQuality, maxCost, priority]
    );
  }
}

// 单例实例
const modelRouter = new ModelRouter();

module.exports = {
  ModelRouter,
  modelRouter
};
