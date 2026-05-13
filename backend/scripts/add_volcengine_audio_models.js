const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '115.190.201.91',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '3321380470@a',
    database: process.env.MYSQL_DATABASE || 'nanostory',
    connectionLimit: 5
  });

  try {
    // 查询火山引擎平台
    const [providers] = await pool.query(
      "SELECT id, name, display_name FROM model_providers WHERE name LIKE '%volc%' OR name LIKE '%火山%'"
    );
    console.log('Providers:', providers);

    if (providers.length === 0) {
      console.log('No volcengine provider found');
      await pool.end();
      return;
    }

    const providerId = providers[0].id;
    console.log('Using provider ID:', providerId);

    // 检查是否已有声音模型
    const [existing] = await pool.query(
      'SELECT id, name, model_id, category FROM ai_model_configs WHERE provider_id = ? AND category = ?',
      [providerId, 'AUDIO']
    );
    console.log('Existing AUDIO models:', existing);

    // 插入火山引擎音色设计模型
    const models = [
      {
        name: '豆包语音合成模型 2.0',
        model_id: 'seed-tts-2.0',
        description: '豆包语音合成大模型2.0，支持音色设计、声音复刻',
        capabilities: JSON.stringify(['audio_gen'])
      },
      {
        name: '豆包语音合成模型 1.0',
        model_id: 'seed-tts-1.0',
        description: '豆包语音合成大模型1.0，支持文本转语音',
        capabilities: JSON.stringify(['audio_gen'])
      }
    ];

    for (const m of models) {
      // 检查是否已存在
      const [dup] = await pool.query(
        'SELECT id FROM ai_model_configs WHERE provider_id = ? AND model_id = ?',
        [providerId, m.model_id]
      );
      if (dup.length > 0) {
        console.log('Model already exists:', m.model_id);
        continue;
      }

      await pool.query(
        `INSERT INTO ai_model_configs (
          name, category, provider, description, is_active,
          provider_id, model_id, capabilities,
          request_method, url_template, headers_template,
          body_template, default_params, response_mapping,
          supported_aspect_ratios, supported_durations, supported_resolutions,
          query_url_template, query_method, query_headers_template,
          query_body_template, query_response_mapping,
          query_success_condition, query_fail_condition,
          query_success_mapping, query_fail_mapping,
          custom_handler, custom_query_handler,
          billing_handler, billing_query_handler,
          price_config
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.name, 'AUDIO', 'volcengine', m.description, 1,
          providerId, m.model_id, m.capabilities,
          'POST', '', '{}', '{}', '{}', '{}',
          '[]', '[]', '[]',
          '', 'GET', '{}', '{}', '{}', '', '',
          '{}', '{}', '', '', '', '',
          '{}'
        ]
      );
      console.log('Inserted model:', m.model_id);
    }

    // 验证插入结果
    const [allAudio] = await pool.query(
      'SELECT id, name, model_id, category, capabilities FROM ai_model_configs WHERE provider_id = ? AND category = ?',
      [providerId, 'AUDIO']
    );
    console.log('All AUDIO models for volcengine:', allAudio);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
