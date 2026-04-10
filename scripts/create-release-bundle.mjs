#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  createReadStream,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'nanostory-release-'));

const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const frontendDistDir = path.join(repoRoot, 'dist');
const backendDir = path.join(repoRoot, 'backend');
const outputDir = path.resolve(repoRoot, process.env.RELEASE_OUTPUT_DIR || 'artifacts');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || `command failed: ${command} ${args.join(' ')}`;
    throw new Error(stderr);
  }

  return result.stdout.trim();
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim();
}

function ensureExists(targetPath, message) {
  if (!existsSync(targetPath)) {
    throw new Error(message);
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function sanitizeReleaseId(input) {
  return input
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'nanostory-release';
}

function tarArchive(sourceDir, outputFile) {
  run('tar', ['-czf', outputFile, '-C', sourceDir, '.']);
}

function collectBuildMetadata() {
  const commit = process.env.GITHUB_SHA || run('git', ['rev-parse', 'HEAD']);
  const ref = process.env.GITHUB_REF || runOptional('git', ['symbolic-ref', '-q', 'HEAD']) || 'HEAD';
  const refName = process.env.GITHUB_REF_NAME || run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const version = process.env.RELEASE_VERSION || rootPackage.version;
  const releaseId = sanitizeReleaseId(
    process.env.RELEASE_ID || `${version}-${commit.slice(0, 7)}`
  );

  return {
    app: 'nanostory',
    bundleVersion: 1,
    version,
    releaseId,
    commit,
    ref,
    refName,
    builtAt: new Date().toISOString(),
    runner: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
  };
}

function stageBackendRuntime(stagingDir) {
  const backendRuntimeDir = path.join(stagingDir, 'backend-runtime');
  const requiredEntries = [
    'package.json',
    'package-lock.json',
    'src',
    'migrations',
    'scripts',
    'initial_database.sql',
    '.env.example',
    'node_modules',
  ];

  mkdirSync(backendRuntimeDir, { recursive: true });

  for (const entry of requiredEntries) {
    const sourcePath = path.join(backendDir, entry);
    ensureExists(sourcePath, `missing backend runtime entry: backend/${entry}`);

    const targetPath = path.join(backendRuntimeDir, entry);
    const sourceStat = statSync(sourcePath);
    if (sourceStat.isDirectory()) {
      cpSync(sourcePath, targetPath, {
        recursive: true,
        dereference: true,
      });
    } else {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }

  return backendRuntimeDir;
}

async function main() {
  ensureExists(
    path.join(frontendDistDir, 'index.html'),
    'missing frontend build output: dist/index.html'
  );
  ensureExists(
    path.join(backendDir, 'node_modules'),
    'missing backend production dependencies: backend/node_modules'
  );

  mkdirSync(outputDir, { recursive: true });

  const metadata = collectBuildMetadata();
  const frontendTar = path.join(tempRoot, 'frontend.tar.gz');
  const backendTar = path.join(tempRoot, 'backend.tar.gz');
  const manifestPath = path.join(tempRoot, 'manifest.json');
  const backendStageRoot = path.join(tempRoot, 'backend-stage');

  tarArchive(frontendDistDir, frontendTar);
  tarArchive(stageBackendRuntime(backendStageRoot), backendTar);

  const manifest = {
    ...metadata,
    artifacts: {
      frontend: {
        file: 'frontend.tar.gz',
        format: 'tar.gz',
        sha256: await sha256(frontendTar),
        size: statSync(frontendTar).size,
        requiredFiles: ['index.html'],
      },
      backend: {
        file: 'backend.tar.gz',
        format: 'tar.gz',
        sha256: await sha256(backendTar),
        size: statSync(backendTar).size,
        requiredFiles: ['package.json', 'package-lock.json', 'src/index.js', 'node_modules'],
      },
    },
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const bundleName = `nanostory-release-${metadata.releaseId}.tar.gz`;
  const bundlePath = path.join(outputDir, bundleName);
  run('tar', ['-czf', bundlePath, '-C', tempRoot, 'manifest.json', 'frontend.tar.gz', 'backend.tar.gz']);

  const publishedManifestPath = path.join(outputDir, `nanostory-release-${metadata.releaseId}.manifest.json`);
  const summaryPath = path.join(outputDir, `nanostory-release-${metadata.releaseId}.summary.json`);
  const bundleSha = await sha256(bundlePath);

  writeFileSync(publishedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        bundle: {
          file: bundleName,
          sha256: bundleSha,
          size: statSync(bundlePath).size,
        },
        manifest: path.basename(publishedManifestPath),
        release: metadata,
      },
      null,
      2
    )}\n`
  );

  console.log(JSON.stringify({
    bundlePath,
    manifestPath: publishedManifestPath,
    summaryPath,
    releaseId: metadata.releaseId,
    version: metadata.version,
    commit: metadata.commit,
  }, null, 2));
}

try {
  await main();
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
