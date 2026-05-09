/**
 * AI 模型相关路由（普通用户可访问）
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./middleware');
const { queryAll } = require('./dbHelper');
const { parseJsonField } = require('./utils/parseJsonField');
const { getPriceSummary, normalizePriceConfig } = require('./aiBillingService');

/**
 * GET /api/ai-models
 * 获取可用的 AI 模型列表（普通用户可访问）
 * 可选参数：type (TEXT/IMAGE/VIDEO/AUDIO/MULTIMODAL)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;

    let query = `
      SELECT id, name, category, provider, description, is_active, price_config,
             supported_aspect_ratios, supported_durations, supported_resolutions,
             supports_tool_calling
      FROM ai_model_configs
      WHERE is_active = 1
    `;
    const params = [];

    if (type) {
      query += ' AND category = ?';
      params.push(type);
    }

    query += ' ORDER BY name';

    const models = await queryAll(query, params);

    res.json({
      models: models.map(m => {
        let priceConfig = null;
        try {
          priceConfig = normalizePriceConfig(m.price_config, { modelName: m.name });
        } catch (err) {
          console.warn(`[Get AI Models] 规范化 price_config 失败 (${m.name}):`, err.message);
        }

        return {
          id: m.id,
          name: m.name,
          provider: m.provider,
          type: m.category,
          category: m.category,
          description: m.description,
          isActive: m.is_active === 1,
          priceConfig,
          priceSummary: getPriceSummary(m.price_config, { modelName: m.name }),
          supportedAspectRatios: parseJsonField(m.supported_aspect_ratios, []),
          supportedDurations: parseJsonField(m.supported_durations, []),
          supportedResolutions: parseJsonField(m.supported_resolutions, []),
          supports_tool_calling: m.supports_tool_calling === 1 || m.supports_tool_calling === true
        };
      })
    });
  } catch (error) {
    console.error('[Get AI Models]', error);
    res.status(500).json({ message: '获取模型列表失败: ' + error.message });
  }
});

module.exports = router;
