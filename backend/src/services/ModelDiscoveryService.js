/**
 * ModelDiscoveryService - 模型自动发现服务
 *
 * 定期从各平台 API 拉取模型列表，自动识别能力标签，
 * 更新到 ai_models_v2 表中。
 */

const { queryOne, queryAll, execute } = require('../dbHelper');
const { createAdapter, inferAdapterForProvider } = require('../adapters');

class ModelDiscoveryService {
  constructor() {
    this.isRunning = false;
  }

  // ============================================================
  // 核心发现流程
  // ============================================================

  /**
   * 发现指定平台上的所有模型
   * @param {number} providerId - 平台ID
   * @returns {Promise<{discovered, added, updated, removed, errors}>}
   */
  async discoverProviderModels(providerId) {
    const provider = await queryOne(
      'SELECT * FROM model_providers WHERE id = ? AND is_active = 1',
      [providerId]
    );

    if (!provider) {
      throw new Error(`平台 ${providerId} 不存在或未启用`);
    }

    console.log(`[Discovery] 开始发现平台: ${provider.display_name || provider.name}`);

    // 创建适配器
    const AdapterClass = inferAdapterForProvider(provider.name);
    const adapter = new AdapterClass(provider, {});

    // 调用发现接口
    const discoveredModels = await adapter.discoverModels();
    console.log(`[Discovery] ${provider.name} 发现 ${discoveredModels.length} 个模型`);

    // 获取现有模型
    const existingModels = await queryAll(
      'SELECT id, model_id, capabilities, is_active FROM ai_models_v2 WHERE provider_id = ?',
      [providerId]
    );
    const existingMap = new Map(existingModels.map(m => [m.model_id, m]));

    let added = 0;
    let updated = 0;
    let removed = 0;
    const errors = [];

    // 处理发现的模型
    for (const model of discoveredModels) {
      try {
        const existing = existingMap.get(model.model_id);

        if (existing) {
          // 更新现有模型
          await this.updateModel(existing.id, model, providerId);
          updated++;
        } else {
          // 新增模型
          await this.addModel(model, providerId, provider.name);
          added++;
        }

        // 标记为已处理
        existingMap.delete(model.model_id);
      } catch (err) {
        errors.push({ model_id: model.model_id, error: err.message });
      }
    }

    // 标记未发现的模型为已移除（可选）
    // for (const [modelId, existing] of existingMap) {
    //   if (existing.is_active) {
    //     await execute(
    //       'UPDATE ai_models_v2 SET is_active = 0 WHERE id = ?',
    //       [existing.id]
    //     );
    //     removed++;
    //   }
    // }

    // 记录日志
    await this.logDiscovery(providerId, provider.name, {
      discovered: discoveredModels.length,
      added,
      updated,
      removed,
      errorMessage: errors.length > 0 ? JSON.stringify(errors) : null
    });

    return { discovered: discoveredModels.length, added, updated, removed, errors };
  }

  /**
   * 发现所有平台
   * @returns {Promise<object>}
   */
  async discoverAll() {
    if (this.isRunning) {
      throw new Error('发现任务正在运行中');
    }

    this.isRunning = true;
    const results = {};

    try {
      const providers = await queryAll(
        'SELECT id, name, display_name FROM model_providers WHERE is_active = 1'
      );

      for (const provider of providers) {
        try {
          results[provider.name] = await this.discoverProviderModels(provider.id);
        } catch (err) {
          console.error(`[Discovery] ${provider.name} 发现失败:`, err.message);
          results[provider.name] = { error: err.message };
        }
      }
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  // ============================================================
  // 模型 CRUD
  // ============================================================

  async addModel(model, providerId, providerName) {
    const capabilities = JSON.stringify(model.capabilities || ['chat']);
    const metadata = JSON.stringify(model.metadata || {});
    const pricing = JSON.stringify(model.pricing || { currency: 'CNY', components: [] });

    await execute(
      `INSERT INTO ai_models_v2 (
        name, provider_id, model_id, capabilities, metadata, pricing,
        is_discovered, discovery_source, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1)`,
      [
        model.name || model.model_id,
        providerId,
        model.model_id,
        capabilities,
        metadata,
        pricing,
        providerName
      ]
    );
  }

  async updateModel(modelId, discoveredModel, providerId) {
    const capabilities = JSON.stringify(discoveredModel.capabilities || ['chat']);
    const metadata = JSON.stringify(discoveredModel.metadata || {});

    await execute(
      `UPDATE ai_models_v2 SET
        capabilities = ?,
        metadata = JSON_MERGE_PATCH(COALESCE(metadata, '{}'), ?),
        is_discovered = 1,
        updated_at = NOW()
      WHERE id = ?`,
      [capabilities, metadata, modelId]
    );
  }

  // ============================================================
  // 日志记录
  // ============================================================

  async logDiscovery(providerId, providerName, stats) {
    await execute(
      `INSERT INTO model_discovery_logs (
        provider_id, provider_name, discovered_count, added_count,
        updated_count, removed_count, error_message, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        providerId,
        providerName,
        stats.discovered,
        stats.added,
        stats.updated,
        stats.removed,
        stats.errorMessage
      ]
    );
  }

  // ============================================================
  // 定时任务
  // ============================================================

  /**
   * 启动定时发现任务
   * @param {number} intervalHours - 间隔小时数（默认 24）
   */
  startScheduledDiscovery(intervalHours = 24) {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`[Discovery] 启动定时发现任务，间隔 ${intervalHours} 小时`);

    // 立即执行一次
    this.discoverAll().catch(err => {
      console.error('[Discovery] 定时发现失败:', err.message);
    });

    // 定时执行
    setInterval(() => {
      this.discoverAll().catch(err => {
        console.error('[Discovery] 定时发现失败:', err.message);
      });
    }, intervalMs);
  }
}

// 单例实例
const discoveryService = new ModelDiscoveryService();

module.exports = {
  ModelDiscoveryService,
  discoveryService
};
