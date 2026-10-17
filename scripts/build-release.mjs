#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { npmCommand, repoRoot, run } from './lib/common.mjs';

const skipInstall = process.argv.includes('--skip-install');
const frontendDir = path.join(repoRoot, 'frontend');
const backendDir = path.join(repoRoot, 'backend');

// 前后端分离后：前端依赖与构建都在 frontend/，后端依赖在 backend/，仓库根不再有 package.json 依赖。
if (!skipInstall) {
  run(npmCommand(), ['ci'], { cwd: frontendDir });
  run(npmCommand(), ['ci', '--omit=dev'], { cwd: backendDir });
} else if (!fs.existsSync(path.join(backendDir, 'node_modules'))) {
  throw new Error('backend/node_modules 不存在，不能使用 --skip-install');
}

// 构建前端（vite build 产出 frontend/dist）
run(npmCommand(), ['run', 'build'], { cwd: frontendDir });
run(process.execPath, ['scripts/create-release-bundle.mjs'], { cwd: repoRoot });
