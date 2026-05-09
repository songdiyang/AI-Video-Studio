/**
 * 更新现有扩展表结构
 * 为已存在的 extensions 表添加缺失的字段
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory'
  });

  try {
    console.log('========================================');
    console.log('更新扩展表结构');
    console.log('========================================\n');

    // 检查并添加缺失的字段
    const columnsToAdd = [
      {
        name: 'min_app_version',
        definition: "VARCHAR(50) DEFAULT NULL COMMENT '最低应用版本要求' AFTER manifest_json"
      },
      {
        name: 'permissions_json',
        definition: "TEXT DEFAULT NULL COMMENT '权限声明 JSON' AFTER min_app_version"
      },
      {
        name: 'source_url',
        definition: "TEXT DEFAULT NULL COMMENT '源码地址' AFTER permissions_json"
      },
      {
        name: 'download_count',
        definition: "INT DEFAULT 0 COMMENT '下载次数' AFTER source_url"
      },
      {
        name: 'rating',
        definition: "DECIMAL(3,2) DEFAULT 5.00 COMMENT '评分 0-5' AFTER download_count"
      }
    ];

    for (const col of columnsToAdd) {
      console.log(`检查字段: ${col.name}...`);
      
      // 检查字段是否存在
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'extensions' 
         AND COLUMN_NAME = ?`,
        [col.name]
      );

      if (rows[0].cnt === 0) {
        console.log(`  - 字段不存在，添加中...`);
        await connection.execute(
          `ALTER TABLE extensions ADD COLUMN ${col.name} ${col.definition}`
        );
        console.log(`  ✓ 成功添加 ${col.name}`);
      } else {
        console.log(`  = 字段已存在，跳过`);
      }
    }

    // 检查并添加索引
    console.log('\n检查索引...');
    const indexesToAdd = [
      { name: 'idx_category', columns: 'category' },
      { name: 'idx_status', columns: 'status' },
      { name: 'idx_is_active', columns: 'is_active' }
    ];

    for (const idx of indexesToAdd) {
      console.log(`检查索引: ${idx.name}...`);
      
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'extensions' 
         AND INDEX_NAME = ?`,
        [idx.name]
      );

      if (rows[0].cnt === 0) {
        console.log(`  - 索引不存在，添加中...`);
        try {
          await connection.execute(
            `CREATE INDEX ${idx.name} ON extensions (${idx.columns})`
          );
          console.log(`  ✓ 成功添加索引 ${idx.name}`);
        } catch (err) {
          if (err.code === 'ER_DUP_KEYNAME') {
            console.log(`  = 索引已存在，跳过`);
          } else {
            throw err;
          }
        }
      } else {
        console.log(`  = 索引已存在，跳过`);
      }
    }

    // 更新现有的日语扩展记录
    console.log('\n更新现有扩展记录...');
    
    const [jpExtensions] = await connection.execute(
      `SELECT id, name FROM extensions WHERE name = 'japanese-language-pack'`
    );

    if (jpExtensions.length > 0) {
      console.log('  - 找到日语语言包扩展，更新中...');
      
      await connection.execute(
        `UPDATE extensions 
         SET display_name = '日语语言包',
             description = '为 Nanostory 添加日语界面支持',
             version = '1.0.0',
             author = 'Nanostory Team',
             category = 'language',
             manifest_json = ?,
             min_app_version = '0.5.0',
             permissions_json = '["language.register"]',
             status = 'approved',
             is_active = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE name = 'japanese-language-pack'`,
        [JSON.stringify({
          name: "japanese-language-pack",
          display_name: "日语语言包",
          display_name_ja: "日本語言語パック",
          version: "1.0.0",
          description: "为 Nanostory 添加日语界面支持",
          description_ja: "Nanostory に日本語インターフェースサポートを追加",
          author: "Nanostory Team",
          category: "language",
          main: "index.js",
          files: ["index.js", "manifest.json"],
          language_code: "ja-JP",
          dependencies: {},
          permissions: ["language.register"],
          min_app_version: "0.5.0"
        })]
      );
      
      console.log('  ✓ 日语语言包扩展已更新');
    } else {
      console.log('  - 未找到日语语言包扩展，创建新记录...');
      
      await connection.execute(
        `INSERT INTO extensions (
          name, display_name, description, version,
          author_id, author, category, icon_url, readme,
          manifest_json, min_app_version, permissions_json, source_url,
          download_count, rating, status, is_active, created_at, updated_at
        ) VALUES (
          'japanese-language-pack',
          '日语语言包',
          '为 Nanostory 添加日语界面支持',
          '1.0.0',
          NULL,
          'Nanostory Team',
          'language',
          NULL,
          '# 日语语言包\\n\\n为 Nanostory 应用添加完整的日语界面支持。\\n\\n## 功能\\n\\n- 完整的日语翻译覆盖\\n- 设置页面可切换日语\\n- 所有主要界面模块均已翻译\\n\\n## 安装后使用\\n\\n1. 安装此扩展\\n2. 前往设置页面 → 语言\\n3. 选择「日本語」即可切换',
          ?,
          '0.5.0',
          '["language.register"]',
          NULL,
          0,
          5.00,
          'approved',
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )`,
        [JSON.stringify({
          name: "japanese-language-pack",
          display_name: "日语语言包",
          display_name_ja: "日本語言語パック",
          version: "1.0.0",
          description: "为 Nanostory 添加日语界面支持",
          description_ja: "Nanostory に日本語インターフェースサポートを追加",
          author: "Nanostory Team",
          category: "language",
          main: "index.js",
          files: ["index.js", "manifest.json"],
          language_code: "ja-JP",
          dependencies: {},
          permissions: ["language.register"],
          min_app_version: "0.5.0"
        })]
      );
      
      console.log('  ✓ 日语语言包扩展已创建');
    }

    // 检查并创建版本记录
    console.log('\n检查扩展版本记录...');
    const [jpExt] = await connection.execute(
      `SELECT id FROM extensions WHERE name = 'japanese-language-pack'`
    );

    if (jpExt.length > 0) {
      const extId = jpExt[0].id;
      const [versions] = await connection.execute(
        `SELECT id FROM extension_versions WHERE extension_id = ? AND version = '1.0.0'`,
        [extId]
      );

      if (versions.length === 0) {
        console.log('  - 创建版本记录 1.0.0...');
        await connection.execute(
          `INSERT INTO extension_versions (extension_id, version, changelog, package_url, manifest_json)
           VALUES (?, '1.0.0', '初始版本', '/extensions/japanese-language-pack-1.0.0.aom', 
           (SELECT manifest_json FROM extensions WHERE id = ?))`,
          [extId, extId]
        );
        console.log('  ✓ 版本记录已创建');
      } else {
        console.log('  = 版本记录已存在，跳过');
      }
    }

    console.log('\n========================================');
    console.log('迁移完成！');
    console.log('========================================');
    console.log('\n更新内容:');
    console.log('  ✓ extensions 表字段已补全');
    console.log('  ✓ extensions 表索引已创建');
    console.log('  ✓ 日语语言包扩展记录已更新/创建');
    console.log('  ✓ 扩展版本记录已创建');
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
