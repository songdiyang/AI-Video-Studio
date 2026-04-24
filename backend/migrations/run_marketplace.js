/**
 * 模板市场功能迁移运行脚本
 * 执行 add_marketplace.sql
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  try {
    console.log('========================================');
    console.log('开始执行数据库迁移...');
    console.log('模板市场功能（配方交易+社交互动）');
    console.log('========================================\n');

    const sqlFile = path.join(__dirname, 'add_marketplace.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // 由于 DELIMITER 语法不能通过 mysql2 执行，需要拆分处理
    // 按步骤执行
    const steps = [
      {
        name: '检查并添加 templates 表扩展字段',
        action: async () => {
          const columns = [
            ['price', 'INT DEFAULT 0'],
            ['is_free', 'TINYINT(1) DEFAULT 0'],
            ['listing_status', "ENUM('draft','listed','delisted') DEFAULT 'draft'"],
            ['recipe_type', "ENUM('character','scene','script') DEFAULT 'character'"],
            ['preview_urls', 'JSON'],
            ['recipe_data', 'JSON'],
            ['like_count', 'INT DEFAULT 0'],
            ['comment_count', 'INT DEFAULT 0'],
            ['purchase_count', 'INT DEFAULT 0'],
            ['total_revenue', 'INT DEFAULT 0'],
            ['listed_at', 'DATETIME'],
            ['sort_score', 'FLOAT DEFAULT 0'],
            ['review_status', "ENUM('pending','approved','rejected') DEFAULT 'pending'"],
            ['review_note', 'TEXT'],
            ['seller_id', 'INT'],
          ];
          
          for (const [col, def] of columns) {
            const [rows] = await connection.execute(
              `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'templates' AND COLUMN_NAME = ?`,
              [col]
            );
            if (rows[0].cnt === 0) {
              await connection.execute(`ALTER TABLE templates ADD COLUMN ${col} ${def}`);
              console.log(`  + templates.${col}`);
            } else {
              console.log(`  = templates.${col} (已存在)`);
            }
          }

          // 添加索引
          try { await connection.execute(`ALTER TABLE templates ADD INDEX idx_listing_status (listing_status)`); } catch(e) {}
          try { await connection.execute(`ALTER TABLE templates ADD INDEX idx_recipe_type (recipe_type)`); } catch(e) {}
          try { await connection.execute(`ALTER TABLE templates ADD INDEX idx_seller_id (seller_id)`); } catch(e) {}
          try { await connection.execute(`ALTER TABLE templates ADD INDEX idx_sort_score (sort_score)`); } catch(e) {}
          try { await connection.execute(`ALTER TABLE templates ADD INDEX idx_price (price)`); } catch(e) {}
          console.log('  索引添加完成');
        }
      },
      {
        name: '创建 template_purchases 表',
        action: async () => {
          await connection.execute(`
            CREATE TABLE IF NOT EXISTS template_purchases (
              id INT AUTO_INCREMENT PRIMARY KEY,
              buyer_id INT NOT NULL,
              template_id INT NOT NULL,
              seller_id INT NOT NULL,
              price INT NOT NULL COMMENT '成交价格（积分）',
              platform_fee INT NOT NULL COMMENT '平台手续费（积分）',
              seller_revenue INT NOT NULL COMMENT '卖家收入（积分）',
              status ENUM('completed','refunded') DEFAULT 'completed',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (buyer_id) REFERENCES users(id),
              FOREIGN KEY (template_id) REFERENCES templates(id),
              FOREIGN KEY (seller_id) REFERENCES users(id),
              UNIQUE KEY uk_buyer_template (buyer_id, template_id),
              INDEX idx_buyer_id (buyer_id),
              INDEX idx_seller_id (seller_id),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('  OK');
        }
      },
      {
        name: '创建 template_comments 表',
        action: async () => {
          await connection.execute(`
            CREATE TABLE IF NOT EXISTS template_comments (
              id INT AUTO_INCREMENT PRIMARY KEY,
              template_id INT NOT NULL,
              user_id INT NOT NULL,
              content TEXT NOT NULL,
              parent_id INT DEFAULT NULL COMMENT '回复评论ID',
              like_count INT DEFAULT 0,
              status ENUM('visible','hidden') DEFAULT 'visible',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id),
              FOREIGN KEY (parent_id) REFERENCES template_comments(id) ON DELETE SET NULL,
              INDEX idx_template_id (template_id),
              INDEX idx_user_id (user_id),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('  OK');
        }
      },
      {
        name: '创建 template_likes 表',
        action: async () => {
          await connection.execute(`
            CREATE TABLE IF NOT EXISTS template_likes (
              id INT AUTO_INCREMENT PRIMARY KEY,
              template_id INT NOT NULL,
              user_id INT NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uk_template_user (template_id, user_id),
              FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('  OK');
        }
      },
      {
        name: '创建 user_follows 表',
        action: async () => {
          await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_follows (
              id INT AUTO_INCREMENT PRIMARY KEY,
              follower_id INT NOT NULL COMMENT '关注者',
              following_id INT NOT NULL COMMENT '被关注者',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY uk_follow (follower_id, following_id),
              FOREIGN KEY (follower_id) REFERENCES users(id),
              FOREIGN KEY (following_id) REFERENCES users(id),
              INDEX idx_follower (follower_id),
              INDEX idx_following (following_id),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('  OK');
        }
      },
      {
        name: '扩展 creator_profiles 表',
        action: async () => {
          const columns = [
            ['follower_count', 'INT DEFAULT 0'],
            ['following_count', 'INT DEFAULT 0'],
            ['total_sales', 'INT DEFAULT 0'],
            ['total_earnings', 'INT DEFAULT 0'],
            ['shop_description', 'TEXT'],
          ];
          
          for (const [col, def] of columns) {
            const [rows] = await connection.execute(
              `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'creator_profiles' AND COLUMN_NAME = ?`,
              [col]
            );
            if (rows[0].cnt === 0) {
              await connection.execute(`ALTER TABLE creator_profiles ADD COLUMN ${col} ${def}`);
              console.log(`  + creator_profiles.${col}`);
            } else {
              console.log(`  = creator_profiles.${col} (已存在)`);
            }
          }
        }
      }
    ];

    for (const step of steps) {
      console.log(`\n▶ ${step.name}`);
      await step.action();
    }

    console.log('\n========================================');
    console.log('迁移完成！');
    console.log('========================================');

  } catch (error) {
    console.error('迁移失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
