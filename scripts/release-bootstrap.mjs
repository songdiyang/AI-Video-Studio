#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { backendRuntimeRoot, ensureDir, assertExtractedPaths, frontendRuntimeRoot, makeTempDir, recreateSymlink, repoRoot, resolveLatestBundle, run } from './lib/common.mjs';

const bundlePath = resolveLatestBundle(process.argv[2]);
const workspace = makeTempDir('nanostory-bootstrap-');
const outerDir = path.join(workspace, 'outer');

function prepareRelease(archivePath, releaseDir, expectedPaths, label) {
  if (!fs.existsSync(releaseDir)) {
    ensureDir(releaseDir);
    run('tar', ['-xzf', archivePath, '-C', releaseDir], { cwd: repoRoot });
  }

  assertExtractedPaths(releaseDir, expectedPaths, label);
}

try {
  ensureDir(outerDir);
  run('tar', ['-xzf', bundlePath, '-C', outerDir], { cwd: repoRoot });

  const manifestPath = path.join(outerDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('bundle 缺少 manifest.json');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const releaseId = manifest.releaseId;
  if (!releaseId) {
    throw new Error('manifest.releaseId 缺失');
  }

  const frontendArchive = path.join(outerDir, 'frontend.tar.gz');
  const backendArchive = path.join(outerDir, 'backend.tar.gz');
  if (!fs.existsSync(frontendArchive) || !fs.existsSync(backendArchive)) {
    throw new Error('bundle 缺少 frontend.tar.gz 或 backend.tar.gz');
  }

  ensureDir(path.join(frontendRuntimeRoot, 'releases'));
  ensureDir(path.join(backendRuntimeRoot, 'releases'));

  const frontendReleaseDir = path.join(frontendRuntimeRoot, 'releases', releaseId);
  const backendReleaseDir = path.join(backendRuntimeRoot, 'releases', releaseId);

  prepareRelease(frontendArchive, frontendReleaseDir, ['index.html'], 'frontend release');
  prepareRelease(backendArchive, backendReleaseDir, ['package.json', 'package-lock.json', 'src/index.js', 'node_modules'], 'backend release');

  recreateSymlink(path.join(frontendRuntimeRoot, 'current'), path.join('releases', releaseId));
  recreateSymlink(path.join(backendRuntimeRoot, 'current'), path.join('releases', releaseId));

  console.log(JSON.stringify({
    ok: true,
    bundlePath,
    releaseId,
    frontendCurrent: path.join(frontendRuntimeRoot, 'current'),
    backendCurrent: path.join(backendRuntimeRoot, 'current'),
  }, null, 2));
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
