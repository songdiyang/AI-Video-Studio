-- ============================================
-- 初始化日语语言包到扩展市场
-- 幂等：如果已存在则跳过
-- ============================================

INSERT INTO extensions (
  name, display_name, description, version,
  author_id, author, category, icon_url, readme,
  manifest_json, min_app_version, permissions_json, source_url,
  download_count, rating, status, is_active, created_at, updated_at
)
SELECT
  'japanese-language-pack',
  '日语语言包',
  '为 Nanostory 添加日语界面支持',
  '1.0.0',
  NULL,
  'Nanostory Team',
  'language',
  NULL,
  '# 日语语言包\n\n为 Nanostory 应用添加完整的日语界面支持。\n\n## 功能\n\n- 完整的日语翻译覆盖\n- 设置页面可切换日语\n- 所有主要界面模块均已翻译\n\n## 安装后使用\n\n1. 安装此扩展\n2. 前往设置页面 → 语言\n3. 选择「日本語」即可切换',
  '{"name":"japanese-language-pack","display_name":"日语语言包","display_name_ja":"日本語言語パック","version":"1.0.0","description":"为 Nanostory 添加日语界面支持","description_ja":"Nanostory に日本語インターフェースサポートを追加","author":"Nanostory Team","category":"language","main":"index.js","files":["index.js","manifest.json"],"language_code":"ja-JP","dependencies":{},"permissions":["language.register"],"min_app_version":"0.5.0"}',
  '0.5.0',
  '["language.register"]',
  NULL,
  0,
  5.00,
  'approved',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM extensions WHERE name = 'japanese-language-pack'
);

-- 同时插入版本记录
INSERT INTO extension_versions (
  extension_id, version, changelog, package_url, manifest_json
)
SELECT
  e.id,
  '1.0.0',
  '初始版本',
  '/extensions/japanese-language-pack-1.0.0.aom',
  e.manifest_json
FROM extensions e
WHERE e.name = 'japanese-language-pack'
  AND NOT EXISTS (
    SELECT 1 FROM extension_versions ev
    WHERE ev.extension_id = e.id AND ev.version = '1.0.0'
  );
