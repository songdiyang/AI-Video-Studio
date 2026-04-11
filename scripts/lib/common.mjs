import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const artifactsDir = path.join(repoRoot, 'artifacts');
export const runtimeDir = path.join(repoRoot, 'runtime');
export const frontendRuntimeRoot = path.join(runtimeDir, 'frontend');
export const backendRuntimeRoot = path.join(runtimeDir, 'backend');
export const dockerEnvFile = path.resolve(process.env.DOCKER_ENV_FILE || path.join(repoRoot, 'docker-compose.env'));
export const backendEnvFile = path.resolve(process.env.BACKEND_ENV_FILE || path.join(repoRoot, 'backend', '.env'));

export function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return result;
}

export function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || `${command} ${args.join(' ')} failed`;
    throw new Error(stderr);
  }

  return result.stdout.trim();
}

export function ensureFileExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

export function loadEnvFile(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return {};
  }

  const parsed = {};
  const lines = fs.readFileSync(targetPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function resolveLatestBundle(bundleArg) {
  if (bundleArg) {
    return path.resolve(bundleArg);
  }

  if (!fs.existsSync(artifactsDir)) {
    throw new Error('artifacts 目录不存在，请先执行 npm run build:release');
  }

  const bundles = fs.readdirSync(artifactsDir)
    .filter((entry) => /^nanostory-release-.*\.tar\.gz$/.test(entry))
    .map((entry) => {
      const fullPath = path.join(artifactsDir, entry);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (bundles.length === 0) {
    throw new Error('未找到 release bundle，请先执行 npm run build:release');
  }

  return bundles[0].fullPath;
}

export function ensureRuntimeBootstrapReady() {
  const frontendIndex = path.join(frontendRuntimeRoot, 'current', 'index.html');
  const backendEntry = path.join(backendRuntimeRoot, 'current', 'src', 'index.js');
  const backendPackage = path.join(backendRuntimeRoot, 'current', 'package.json');

  if (fs.existsSync(frontendIndex) && fs.existsSync(backendEntry) && fs.existsSync(backendPackage)) {
    return;
  }

  throw new Error(
    '未检测到 runtime 当前版本，请先执行 npm run build:release && npm run release:bootstrap'
  );
}

export function detectDockerCompose() {
  const dockerCheck = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  if (dockerCheck.status === 0) {
    return { command: 'docker', args: ['compose'] };
  }

  const legacyCheck = spawnSync('docker-compose', ['version'], { stdio: 'ignore' });
  if (legacyCheck.status === 0) {
    return { command: 'docker-compose', args: [] };
  }

  throw new Error('未找到 docker compose / docker-compose');
}

export function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function recreateSymlink(linkPath, targetPath) {
  fs.rmSync(linkPath, { force: true, recursive: true });
  fs.symlinkSync(
    targetPath,
    linkPath,
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

export function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function assertExtractedPaths(baseDir, expectedPaths, label) {
  for (const relativePath of expectedPaths) {
    const absolutePath = path.join(baseDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`${label} 缺少 ${relativePath}`);
    }
  }
}
