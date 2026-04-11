#!/usr/bin/env node

import { backendEnvFile, detectDockerCompose, dockerEnvFile, ensureFileExists, ensureRuntimeBootstrapReady, repoRoot, run } from './lib/common.mjs';

const mode = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!mode || !['up', 'down', 'logs', 'dev'].includes(mode)) {
  console.error('usage: node scripts/docker-compose.mjs <up|down|logs|dev> [extra compose args]');
  process.exit(1);
}

ensureFileExists(dockerEnvFile, `缺少 ${dockerEnvFile}，请先从 docker-compose.env.example 复制`);
ensureFileExists(backendEnvFile, `缺少 ${backendEnvFile}，请先准备后端环境变量`);

if (mode === 'up' || mode === 'dev') {
  ensureRuntimeBootstrapReady();
}

const compose = detectDockerCompose();
const composeArgs = [...compose.args, '--env-file', dockerEnvFile, '-f', 'docker-compose.yml'];
const env = { ...process.env };

if (mode === 'dev') {
  env.NGINX_FRONTEND_MODE = 'proxy';
  env.FRONTEND_UPSTREAM = env.FRONTEND_UPSTREAM || 'http://frontend-dev:5173';
  composeArgs.push('--profile', 'dev', 'up', '-d', '--build', ...extraArgs);
} else if (mode === 'up') {
  env.NGINX_FRONTEND_MODE = 'static';
  composeArgs.push('up', '-d', '--build', ...extraArgs);
} else if (mode === 'down') {
  composeArgs.push('down', ...extraArgs);
} else {
  composeArgs.push('logs', '-f', ...extraArgs);
}

run(compose.command, composeArgs, { cwd: repoRoot, env });
