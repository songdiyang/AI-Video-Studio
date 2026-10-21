#!/usr/bin/env node
/**
 * AOM 扩展包解压与调用测试脚本
 *
 * 用法:
 *   node scripts/test-aom-extract.mjs <path-to-aom-file>
 *
 * 示例:
 *   node scripts/test-aom-extract.mjs japanese-language-pack-1.0.0.aom
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========== AOM 格式常量 ==========
const AOM_MAGIC = Buffer.from([0x41, 0x4F, 0x4D, 0x01]); // "AOM\x01"
const AOM_VERSION = 1;
const AOM_HEADER_SIZE = 64;

// ========== 测试结果统计 ==========
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✅ ${message} (${actual})`);
    passed++;
  } else {
    console.error(`  ❌ ${message} - 期望: ${expected}, 实际: ${actual}`);
    failed++;
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// ========== 测试主体 ==========
async function main() {
  const [,, aomPath] = process.argv;
  const resolvedPath = path.resolve(aomPath || 'japanese-language-pack-1.0.0.aom');

  if (!fs.existsSync(resolvedPath)) {
    console.error(`错误: 文件不存在: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`\n📋 AOM 解压与调用测试`);
  console.log(`   文件: ${resolvedPath}`);
  console.log(`   大小: ${(fs.statSync(resolvedPath).size / 1024).toFixed(2)} KB\n`);

  // ====================
  // 第一部分: AOM 文件头解析
  // ====================
  console.log('━'.repeat(50));
  console.log('1. AOM 文件头解析');
  console.log('━'.repeat(50));

  const buffer = fs.readFileSync(resolvedPath);

  // 1a. 魔数检查
  const magic = buffer.slice(0, 4);
  assert(magic.equals(AOM_MAGIC), '魔数 "AOM\\x01" 匹配');

  // 1b. 版本号
  const version = buffer.readUInt16LE(4);
  assertEqual(version, AOM_VERSION, 'AOM 格式版本号');

  // 1c. 文件头大小
  const headerSize = buffer.readUInt16LE(6);
  assertEqual(headerSize, AOM_HEADER_SIZE, '文件头大小 (bytes)');

  // 1d. Payload 偏移
  const payloadOffset = buffer.readUInt32LE(8);
  assertEqual(payloadOffset, AOM_HEADER_SIZE, 'Payload 偏移');

  // 1e. Payload 大小
  const payloadSize = buffer.readUInt32LE(12);
  assert(payloadSize > 0, `Payload 大小 (${payloadSize} bytes) > 0`);

  // 1f. SHA-256 验证
  const expectedSha256 = buffer.slice(16, 48);
  const payload = buffer.slice(payloadOffset, payloadOffset + payloadSize);
  const actualSha256 = sha256Buffer(payload);
  assert(
    expectedSha256.equals(actualSha256),
    `SHA-256 校验通过 (${actualSha256.toString('hex').slice(0, 16)}...)`
  );

  // 1g. 预留字段
  const reserved = buffer.slice(48, 64);
  assert(
    reserved.equals(Buffer.alloc(16)),
    '预留字段全为零'
  );

  // ====================
  // 第二部分: ZIP 解压与文件清单
  // ====================
  console.log('\n' + '━'.repeat(50));
  console.log('2. ZIP 解压与文件清单');
  console.log('━'.repeat(50));

  const zip = await JSZip.loadAsync(payload);

  const fileNames = Object.keys(zip.files).filter(f => !zip.files[f].dir);
  console.log(`   文件数量: ${fileNames.length}`);
  for (const name of fileNames.sort()) {
    const zi = zip.files[name];
    console.log(`   📄 ${name}  (${(zi._data?.uncompressedSize || 0) / 1024} KB)`);
  }

  // 2a. 必须包含 manifest.json
  assert(fileNames.includes('manifest.json'), '包含 manifest.json');

  // 2b. 必须包含 index.js（main 入口）
  assert(fileNames.includes('index.js'), '包含 index.js');

  // ====================
  // 第三部分: manifest.json 验证
  // ====================
  console.log('\n' + '━'.repeat(50));
  console.log('3. manifest.json 验证');
  console.log('━'.repeat(50));

  const manifestRaw = await zip.file('manifest.json')?.async('string');
  assert(!!manifestRaw, 'manifest.json 可读取');

  const manifest = JSON.parse(manifestRaw);

  // 3a. 必填字段
  const requiredFields = ['name', 'display_name', 'version', 'author', 'category', 'description', 'main', 'files'];
  for (const field of requiredFields) {
    assert(!!manifest[field], `必填字段 "${field}" 存在: ${manifest[field]}`);
  }

  // 3b. name 格式
  assert(/^[a-z0-9-]+$/.test(manifest.name), `name 格式合法: ${manifest.name}`);

  // 3c. version 格式
  assert(/^\d+\.\d+\.\d+/.test(manifest.version), `version 格式合法: ${manifest.version}`);

  // 3d. main 必须在 files 中
  assert(
    manifest.files.includes(manifest.main),
    `main 文件 "${manifest.main}" 已在 files 列表中`
  );

  // 3e. 打印 manifest 摘要
  console.log(`\n   📋 Manifest 摘要:`);
  console.log(`      名称: ${manifest.name}`);
  console.log(`      显示名: ${manifest.display_name}`);
  console.log(`      版本: ${manifest.version}`);
  console.log(`      类别: ${manifest.category}`);
  console.log(`      权限: ${(manifest.permissions || []).join(', ') || '无'}`);
  console.log(`      最低应用版本: ${manifest.min_app_version || '未指定'}`);

  // ====================
  // 第四部分: index.js 加载与函数调用测试
  // ====================
  console.log('\n' + '━'.repeat(50));
  console.log('4. index.js 加载与函数调用测试');
  console.log('━'.repeat(50));

  // 4a. 读取 index.js 内容
  const indexContent = await zip.file('index.js')?.async('string');
  assert(!!indexContent, 'index.js 可读取');
  assert(indexContent.length > 1000, `index.js 内容足够 (${indexContent.length} 字符)`);

  // 4b. 检查 export 语法
  assert(
    indexContent.includes('export function activate'),
    '导出 activate 函数'
  );
  assert(
    indexContent.includes('export function deactivate'),
    '导出 deactivate 函数'
  );

  // 4c. 将文件写入临时目录，通过动态 import 加载
  const tmpDir = path.join(__dirname, '..', '.aom-test-tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // 写入解压后的文件
  for (const name of fileNames) {
    const content = await zip.file(name)?.async('nodebuffer');
    const outPath = path.join(tmpDir, name);
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, content);
  }

  // 动态导入 index.js
  const modPath = path.join(tmpDir, 'index.js');
  const modUrl = 'file://' + modPath;
  let extensionModule;
  try {
    extensionModule = await import(modUrl);
    console.log('  ✅ 成功通过动态 import 加载 index.js');
    passed++;
  } catch (err) {
    console.error(`  ❌ 加载 index.js 失败: ${err.message}`);
    failed++;
    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true });
    printSummary();
    return;
  }

  // 4d. 调用 activate
  assert(
    typeof extensionModule.activate === 'function',
    'activate 是函数'
  );

  const mockApi = {
    language: {
      registered: [],
      unregistered: [],
      registerTranslations(langCode, langName, translations) {
        this.registered.push({ langCode, langName, translations });
      },
      unregisterTranslations(langCode) {
        this.unregistered.push(langCode);
      },
    },
  };

  // 调用 activate
  extensionModule.activate(mockApi);
  assert(
    mockApi.language.registered.length === 1,
    `activate 注册了 1 个翻译 (实际: ${mockApi.language.registered.length})`
  );

  const registration = mockApi.language.registered[0];
  assertEqual(
    registration.langCode,
    'ja-JP',
    '注册的语言代码'
  );

  assertEqual(
    registration.langName,
    '日本語',
    '语言显示名'
  );

  assert(
    typeof registration.translations === 'object' && registration.translations !== null,
    '翻译数据是对象'
  );

  // 检查翻译数据的结构
  const sections = Object.keys(registration.translations);
  console.log(`\n   📖 翻译数据包含 ${sections.length} 个区块:`);
  const keySections = ['common', 'nav', 'settings', 'auth', 'projects', 'workbench'];
  for (const sec of keySections) {
    if (sections.includes(sec)) {
      const subKeys = Object.keys(registration.translations[sec]).length;
      console.log(`      ${sec}: ${subKeys} 个翻译键`);
    }
  }

  assert(sections.length >= 10, `翻译区块数量充足 (${sections.length} >= 10)`);
  assert(sections.includes('common'), '包含 common 区块');
  assert(sections.includes('nav'), '包含 nav 区块');
  assert(sections.includes('auth'), '包含 auth 区块');

  // 4e. 调用 deactivate
  assert(
    typeof extensionModule.deactivate === 'function',
    'deactivate 是函数'
  );

  extensionModule.deactivate(mockApi);
  assert(
    mockApi.language.unregistered.length === 1,
    `deactivate 注销了 1 个翻译 (实际: ${mockApi.language.unregistered.length})`
  );
  assertEqual(
    mockApi.language.unregistered[0],
    'ja-JP',
    '注销的语言代码'
  );

  // 清理临时文件
  fs.rmSync(tmpDir, { recursive: true });

  // ====================
  // 输出汇总
  // ====================
  printSummary();
}

function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 测试汇总');
  console.log('═'.repeat(50));
  console.log(`   总计: ${passed + failed} 项`);
  console.log(`   ✅ 通过: ${passed}`);
  console.log(`   ❌ 失败: ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 全部测试通过！AOM 文件可正常解压和调用。');
  } else {
    console.log(`\n⚠️  有 ${failed} 项测试失败，请检查。`);
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ 测试脚本崩溃:', err);
  process.exit(1);
});
