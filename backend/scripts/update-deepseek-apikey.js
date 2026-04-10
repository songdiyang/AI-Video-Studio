/**
 * 更新 DeepSeek Chat 模型的 API Key 到数据库
 * 运行: node scripts/update-deepseek-apikey.js <your-api-key> [model-name]
 * 示例: node scripts/update-deepseek-apikey.js sk-xxxx "DeepSeek Chat"
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const API_KEY = process.argv[2];
const MODEL_NAME = process.argv[3] || 'DeepSeek Chat';

if (!API_KEY) {
  console.error('❌ 请提供 API Key 作为第一个参数');
  console.error('用法: node scripts/update-deepseek-apikey.js <api-key> [model-name]');
  process.exit(1);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    // 检查模型是否存在
    const [rows] = await connection.execute(
      'SELECT id, name, api_key FROM ai_model_configs WHERE name = ?',
      [MODEL_NAME]
    );

    if (rows.length === 0) {
      console.log(`未找到名为 "${MODEL_NAME}" 的模型配置`);
      return;
    }

    const model = rows[0];
    console.log(`找到模型: ID=${model.id}, 名称=${model.name}`);
    console.log(`当前 API Key: ${model.api_key ? model.api_key.substring(0, 10) + '...' : '(空)'}`);

    // 更新 API Key
    const [result] = await connection.execute(
      'UPDATE ai_model_configs SET api_key = ? WHERE name = ?',
      [API_KEY, MODEL_NAME]
    );

    if (result.affectedRows > 0) {
      console.log(`✅ 成功更新 "${MODEL_NAME}" 的 API Key`);
      console.log(`新 API Key: ${API_KEY.substring(0, 10)}...`);
    } else {
      console.log('❌ 更新失败，未影响任何行');
    }
  } catch (error) {
    console.error('数据库操作失败:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

main();
