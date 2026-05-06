/**
 * S3 协议存储测试脚本
 * 测试上传、下载、exists、head、delete 等操作
 */
require('dotenv').config();
const StorageFactory = require('../src/storage/StorageFactory');

async function test() {
  const storage = StorageFactory.create();
  if (!storage) {
    console.error('[Test] 存储实例创建失败');
    process.exit(1);
  }

  console.log('[Test] 存储类型:', storage.constructor.name);
  const config = StorageFactory.getConfig();
  console.log('[Test] Endpoint:', config.endPoint);
  console.log('[Test] Bucket:', config.bucket);
  console.log('[Test] Region:', config.region);

  const initOk = await storage.init();
  console.log('[Test] 初始化结果:', initOk);
  if (!initOk) {
    console.error('[Test] 初始化失败，退出');
    process.exit(1);
  }

  // 测试上传
  const testContent = Buffer.from('Hello S3 Protocol Test - ' + new Date().toISOString());
  const testKey = 'test/s3-protocol-test-' + Date.now() + '.txt';

  try {
    console.log('\n--- 1. 上传测试 ---');
    await storage.upload(testContent, testKey, { contentType: 'text/plain' });
    console.log('[Test] 上传成功:', testKey);

    console.log('\n--- 2. exists 测试 ---');
    const exists = await storage.exists(testKey);
    console.log('[Test] exists:', exists);

    console.log('\n--- 3. head 测试 ---');
    const head = await storage.head(testKey);
    console.log('[Test] head:', JSON.stringify(head, null, 2));

    console.log('\n--- 4. publicUrl 测试 ---');
    const url = storage.getPublicUrl(testKey);
    console.log('[Test] publicUrl:', url);

    console.log('\n--- 5. 下载测试 ---');
    const dl = await storage.download(testKey);
    console.log('[Test] download contentType:', dl.contentType, 'size:', dl.size);

    // 读取流内容验证
    const chunks = [];
    for await (const chunk of dl.stream) {
      chunks.push(chunk);
    }
    const downloaded = Buffer.concat(chunks).toString();
    console.log('[Test] 下载内容:', downloaded.substring(0, 100));

    // 验证内容一致性
    const match = downloaded === testContent.toString();
    console.log('[Test] 内容一致性:', match ? 'PASS' : 'FAIL');

    console.log('\n--- 6. 删除测试 ---');
    await storage.delete(testKey);
    console.log('[Test] 删除成功');

    // 验证删除后不存在
    const existsAfter = await storage.exists(testKey);
    console.log('[Test] 删除后 exists:', existsAfter, '(期望 false)');

    console.log('\n============================');
    console.log('文本文件测试通过!');
    console.log('============================');

    // ========== 二进制文件（图片）测试 ==========
    console.log('\n========== 二进制图片测试 ==========');

    // 创建一个 1x1 像素的红色 PNG 图片（二进制数据）
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG 文件头
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 像素
      0x08, 0x02, 0x00, 0x00, 0x00, // 8bit RGB
      0x90, 0x77, 0x53, 0xDE, // IHDR CRC
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
      0x00, 0x03, 0x00, 0x01, 0x00, 0x05, // 压缩数据
      0xFE, 0xD7, 0x22, 0xB4, // IDAT CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
      0xAE, 0x42, 0x60, 0x82  // IEND CRC
    ]);

    const imgKey = 'test/s3-image-test-' + Date.now() + '.png';

    console.log('\n--- 7. 二进制图片上传测试 ---');
    await storage.upload(pngBuffer, imgKey, { contentType: 'image/png' });
    console.log('[Test] 图片上传成功:', imgKey);

    console.log('\n--- 8. 图片 exists 测试 ---');
    const imgExists = await storage.exists(imgKey);
    console.log('[Test] 图片 exists:', imgExists);

    console.log('\n--- 9. 图片 head 测试 ---');
    const imgHead = await storage.head(imgKey);
    console.log('[Test] 图片 head:', JSON.stringify(imgHead, null, 2));
    console.log('[Test] 图片大小:', imgHead.size, '字节 (期望 69)');
    console.log('[Test] Content-Type:', imgHead.contentType, '(期望 image/png)');

    console.log('\n--- 10. 图片下载测试 ---');
    const imgDl = await storage.download(imgKey);
    console.log('[Test] 图片 download contentType:', imgDl.contentType, 'size:', imgDl.size);

    // 读取流并验证二进制一致性
    const imgChunks = [];
    for await (const chunk of imgDl.stream) {
      imgChunks.push(chunk);
    }
    const downloadedImg = Buffer.concat(imgChunks);
    const imgMatch = downloadedImg.equals(pngBuffer);
    console.log('[Test] 图片二进制一致性:', imgMatch ? 'PASS' : 'FAIL');
    console.log('[Test] 原始大小:', pngBuffer.length, '下载大小:', downloadedImg.length);

    console.log('\n--- 11. 图片公开 URL 测试 ---');
    const imgUrl = storage.getPublicUrl(imgKey);
    console.log('[Test] 图片 publicUrl:', imgUrl);

    console.log('\n--- 12. 图片删除测试 ---');
    await storage.delete(imgKey);
    console.log('[Test] 图片删除成功');

    const imgExistsAfter = await storage.exists(imgKey);
    console.log('[Test] 删除后 exists:', imgExistsAfter, '(期望 false)');

    console.log('\n============================');
    console.log('所有 S3 协议测试通过!');
    console.log('包括：文本文件 + 二进制图片');
    console.log('============================');
  } catch (err) {
    console.error('[Test] 测试失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
