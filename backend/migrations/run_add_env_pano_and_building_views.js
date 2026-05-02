/**
 * 迁移：环境全景图 + 建筑室内外视图字段
 * - environments.panorama_image_url: 环境 360° 全景图
 * - buildings.interior_image_url: 建筑室内图
 * - buildings.exterior_image_url: 建筑室外图
 *
 * 用法：node backend/migrations/run_add_env_pano_and_building_views.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('[Migration] 开始: 环境全景图 + 建筑室内外视图字段...\n');

    // 1. environments 表添加 panorama_image_url
    console.log('1. 添加 environments.panorama_image_url...');
    try {
      await conn.execute(`
        ALTER TABLE environments
        ADD COLUMN panorama_image_url VARCHAR(1024) DEFAULT NULL
        COMMENT '环境 360° 全景图(equirectangular) URL'
      `);
      console.log('   ✓ 成功添加 panorama_image_url');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   - panorama_image_url 已存在，跳过');
      } else {
        throw err;
      }
    }

    // 2. buildings 表添加 interior_image_url
    console.log('2. 添加 buildings.interior_image_url...');
    try {
      await conn.execute(`
        ALTER TABLE buildings
        ADD COLUMN interior_image_url VARCHAR(1024) DEFAULT NULL
        COMMENT '建筑室内视图 URL'
      `);
      console.log('   ✓ 成功添加 interior_image_url');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   - interior_image_url 已存在，跳过');
      } else {
        throw err;
      }
    }

    // 3. buildings 表添加 exterior_image_url
    console.log('3. 添加 buildings.exterior_image_url...');
    try {
      await conn.execute(`
        ALTER TABLE buildings
        ADD COLUMN exterior_image_url VARCHAR(1024) DEFAULT NULL
        COMMENT '建筑室外视图 URL'
      `);
      console.log('   ✓ 成功添加 exterior_image_url');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   - exterior_image_url 已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('\n[Migration] 全部完成 ✓');
  } catch (err) {
    console.error('[Migration] 失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

migrate();
