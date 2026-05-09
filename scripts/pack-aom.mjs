#!/usr/bin/env node
/**
 * AOM 打包工具
 * 将扩展文件夹打包为 .aom 文件
 *
 * 用法:
 *   node scripts/pack-aom.mjs <扩展文件夹路径> [输出文件名]
 *
 * 示例:
 *   node scripts/pack-aom.mjs extensions/japanese-language-pack
 *   node scripts/pack-aom.mjs extensions/japanese-language-pack japanese-language-pack.aom
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AOM_MAGIC = Buffer.from([0x41, 0x4F, 0x4D, 0x01]); // "AOM\x01"
const AOM_VERSION = 1;
const AOM_HEADER_SIZE = 64;

async function sha256Buffer(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Buffer.from(hash);
}

/**
 * 将文件夹打包为 ZIP Buffer
 */
async function zipFolder(folderPath) {
  const zip = new JSZip();
  const files = fs.readdirSync(folderPath, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      const content = fs.readFileSync(fullPath);
      zip.file(file, content);
    }
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * 将 ZIP Buffer 打包为 AOM 格式
 */
async function packAOM(zipBuffer) {
  const sha256 = await sha256Buffer(zipBuffer);

  const header = Buffer.alloc(AOM_HEADER_SIZE);

  // Magic (4 bytes)
  AOM_MAGIC.copy(header, 0);
  // Version (2 bytes, LE)
  header.writeUInt16LE(AOM_VERSION, 4);
  // Header size (2 bytes, LE)
  header.writeUInt16LE(AOM_HEADER_SIZE, 6);
  // Payload offset (4 bytes, LE)
  header.writeUInt32LE(AOM_HEADER_SIZE, 8);
  // Payload size (4 bytes, LE)
  header.writeUInt32LE(zipBuffer.length, 12);
  // SHA-256 (32 bytes)
  sha256.copy(header, 16);
  // Reserved (16 bytes, already zeros)

  return Buffer.concat([header, zipBuffer]);
}

async function main() {
  const [,, folderPath, outputFile] = process.argv;

  if (!folderPath) {
    console.error('用法: node scripts/pack-aom.mjs <扩展文件夹路径> [输出文件名]');
    console.error('示例: node scripts/pack-aom.mjs extensions/japanese-language-pack');
    process.exit(1);
  }

  const resolvedPath = path.resolve(folderPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`错误: 文件夹不存在: ${resolvedPath}`);
    process.exit(1);
  }

  // 检查 manifest.json
  const manifestPath = path.join(resolvedPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`错误: 未找到 manifest.json: ${manifestPath}`);
    console.error('扩展文件夹必须包含 manifest.json');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const extName = manifest.name || path.basename(resolvedPath);
  const extVersion = manifest.version || '0.0.0';

  const outFile = outputFile || `${extName}-${extVersion}.aom`;
  const outPath = path.resolve(outFile);

  console.log(`📦 打包扩展: ${extName} v${extVersion}`);
  console.log(`   来源: ${resolvedPath}`);

  // 1. 打包为 ZIP
  console.log('   正在创建 ZIP...');
  const zipBuffer = await zipFolder(resolvedPath);
  console.log(`   ZIP 大小: ${(zipBuffer.length / 1024).toFixed(2)} KB`);

  // 2. 打包为 AOM
  console.log('   正在添加 AOM 文件头...');
  const aomBuffer = await packAOM(zipBuffer);
  console.log(`   AOM 大小: ${(aomBuffer.length / 1024).toFixed(2)} KB`);

  // 3. 写入文件
  fs.writeFileSync(outPath, aomBuffer);
  console.log(`✅ 已保存: ${outPath}`);

  // 4. 验证
  console.log('   验证文件完整性...');
  const verifyBuffer = fs.readFileSync(outPath);
  const magic = verifyBuffer.slice(0, 4);
  if (!magic.equals(AOM_MAGIC)) {
    console.error('❌ 验证失败: 魔数不匹配');
    process.exit(1);
  }

  const version = verifyBuffer.readUInt16LE(4);
  const payloadOffset = verifyBuffer.readUInt32LE(8);
  const payloadSize = verifyBuffer.readUInt32LE(12);
  const expectedSha256 = verifyBuffer.slice(16, 48);

  const payload = verifyBuffer.slice(payloadOffset, payloadOffset + payloadSize);
  const actualSha256 = await sha256Buffer(payload);

  if (!expectedSha256.equals(actualSha256)) {
    console.error('❌ 验证失败: SHA-256 不匹配');
    process.exit(1);
  }

  console.log('✅ 验证通过');
  console.log(`   格式版本: ${version}`);
  console.log(`   文件头大小: ${payloadOffset} bytes`);
  console.log(`   Payload 大小: ${payloadSize} bytes`);
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
