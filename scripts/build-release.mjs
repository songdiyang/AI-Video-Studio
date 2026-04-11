#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { npmCommand, repoRoot, run } from './lib/common.mjs';

const skipInstall = process.argv.includes('--skip-install');
const backendDir = path.join(repoRoot, 'backend');

if (!skipInstall) {
  run(npmCommand(), ['ci'], { cwd: repoRoot });
  run(npmCommand(), ['ci', '--omit=dev'], { cwd: backendDir });
} else if (!fs.existsSync(path.join(backendDir, 'node_modules'))) {
  throw new Error('backend/node_modules 不存在，不能使用 --skip-install');
}

run(npmCommand(), ['run', 'build'], { cwd: repoRoot });
run(process.execPath, ['scripts/create-release-bundle.mjs'], { cwd: repoRoot });
