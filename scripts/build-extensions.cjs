/**
 * Build Extensions Script
 * 将 extensions/ 目录下的扩展打包为 ZIP，输出到 public/extensions/
 */

const fs = require('fs');
const path = require('path');
// jszip 是 frontend/ 的依赖；本脚本位于仓库根 scripts/，CI 全新检出时根无 node_modules，
// 需显式从 frontend/node_modules 解析，否则 require('jszip') 会找不到模块。
const JSZip = require(require.resolve('jszip', { paths: [path.join(__dirname, '..', 'frontend')] }));

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');
// 前后端分离后 public 已搬入 frontend/，扩展 ZIP 需输出到 frontend/public/extensions 以便 vite 打包进 dist
const OUTPUT_DIR = path.join(__dirname, '..', 'frontend', 'public', 'extensions');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function packExtension(extName) {
  const extDir = path.join(EXTENSIONS_DIR, extName);
  const zip = new JSZip();

  function addFiles(dirPath, zipPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        addFiles(fullPath, relativePath);
      } else {
        const content = fs.readFileSync(fullPath);
        zip.file(relativePath, content);
      }
    }
  }

  addFiles(extDir, '');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const outputPath = path.join(OUTPUT_DIR, `${extName}.zip`);
  fs.writeFileSync(outputPath, buffer);
  console.log(`  Packed: ${extName}.zip`);
}

async function main() {
  console.log('Building extensions...');
  ensureDir(OUTPUT_DIR);

  if (!fs.existsSync(EXTENSIONS_DIR)) {
    console.log('No extensions directory found, skipping.');
    return;
  }

  const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
  const extDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

  if (extDirs.length === 0) {
    console.log('No extensions to pack.');
    return;
  }

  for (const extName of extDirs) {
    await packExtension(extName);
  }

  console.log(`Done. ${extDirs.length} extension(s) packed.`);
}

main().catch(err => {
  console.error('Build extensions failed:', err);
  process.exit(1);
});
