const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const { HttpError } = require('./errors');
const {
  assertArchiveEntriesContain,
  assertExtractedEntries,
  extractTarFile,
  inspectTarFile,
} = require('./archive');
const { EXPECTED_EXTRACTED_ENTRIES, EXPECTED_REQUIRED_FILES, validateManifest } = require('./manifest');

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function ensureBaseDirs(config) {
  ensureDir(config.workDir);
  ensureDir(path.join(config.workDir, 'uploads'));
  ensureDir(path.join(config.workDir, 'tmp'));
  ensureDir(path.join(config.workDir, 'deployments'));
  ensureDir(path.join(config.frontendRoot, 'releases'));
  ensureDir(path.join(config.backendRoot, 'releases'));
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeReadCurrentTarget(rootDir) {
  const currentLink = path.join(rootDir, 'current');
  let stat;
  try {
    stat = fs.lstatSync(currentLink);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  if (!stat.isSymbolicLink()) {
    throw new HttpError(409, `${currentLink} must be a symlink`);
  }

  return fs.readlinkSync(currentLink);
}

function switchCurrentLink(rootDir, releaseId) {
  const currentLink = path.join(rootDir, 'current');
  const nextLink = path.join(rootDir, `.current-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const releaseTarget = path.join('releases', releaseId);
  const previousTarget = safeReadCurrentTarget(rootDir);

  fs.symlinkSync(releaseTarget, nextLink, 'dir');
  fs.renameSync(nextLink, currentLink);

  return previousTarget;
}

function restoreCurrentLink(rootDir, previousTarget) {
  const currentLink = path.join(rootDir, 'current');
  if (previousTarget) {
    const restoreLink = path.join(rootDir, `.restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.symlinkSync(previousTarget, restoreLink, 'dir');
    fs.renameSync(restoreLink, currentLink);
    return;
  }

  fs.rmSync(currentLink, { force: true });
}

function executeShell(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new HttpError(500, `command failed: ${command}`, {
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
      exitCode: result.status,
    });
  }

  return {
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
  };
}

function collectCurrentRelease(rootDir) {
  try {
    const target = safeReadCurrentTarget(rootDir);
    return target ? path.basename(target) : null;
  } catch (_error) {
    return null;
  }
}

function cleanupOldReleases(rootDir, keepCount) {
  const releasesDir = path.join(rootDir, 'releases');
  if (!fs.existsSync(releasesDir)) {
    return;
  }

  const current = collectCurrentRelease(rootDir);
  const entries = fs.readdirSync(releasesDir)
    .map((name) => {
      const fullPath = path.join(releasesDir, name);
      const stat = fs.statSync(fullPath);
      return stat.isDirectory() ? { name, mtimeMs: stat.mtimeMs, fullPath } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  let kept = 0;
  for (const entry of entries) {
    if (entry.name === current) {
      continue;
    }

    kept += 1;
    if (kept >= keepCount) {
      fs.rmSync(entry.fullPath, { recursive: true, force: true });
    }
  }
}

async function validateBundleArtifacts(bundleDir, manifest, config) {
  const results = {};

  for (const artifactName of ['frontend', 'backend']) {
    const artifact = manifest.artifacts[artifactName];
    const artifactPath = path.join(bundleDir, artifact.file);

    if (!fs.existsSync(artifactPath)) {
      throw new HttpError(400, `bundle missing ${artifact.file}`);
    }

    const stat = fs.statSync(artifactPath);
    if (!stat.isFile()) {
      throw new HttpError(400, `bundle path is not a file: ${artifact.file}`);
    }

    if (stat.size !== artifact.size) {
      throw new HttpError(400, `${artifact.file} size mismatch`);
    }

    const digest = await sha256File(artifactPath);
    if (digest !== artifact.sha256) {
      throw new HttpError(400, `${artifact.file} sha256 mismatch`);
    }

    const inspection = await inspectTarFile(artifactPath, {
      label: `${artifactName} artifact`,
      maxEntries: artifactName === 'backend' ? 100000 : 20000,
      maxExpandedBytes: artifactName === 'backend'
        ? config.uploadMaxBytes * 4
        : Math.max(config.uploadMaxBytes, 512 * 1024 * 1024),
    });

    assertArchiveEntriesContain(
      inspection,
      EXPECTED_REQUIRED_FILES[artifactName],
      `${artifactName} artifact`
    );

    results[artifactName] = {
      path: artifactPath,
      inspection,
    };
  }

  return results;
}

async function prepareReleaseDirectory(artifactName, artifactPath, releaseDir) {
  const stagingDir = `${releaseDir}.staging`;
  fs.rmSync(stagingDir, { recursive: true, force: true });

  await extractTarFile(artifactPath, stagingDir);
  assertExtractedEntries(stagingDir, EXPECTED_EXTRACTED_ENTRIES[artifactName], `${artifactName} artifact`);

  fs.renameSync(stagingDir, releaseDir);
}

function recordDeployment(config, payload) {
  const targetPath = path.join(
    config.workDir,
    'deployments',
    `${payload.releaseId}-${Date.now()}.json`
  );

  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
  return targetPath;
}

async function deployBundle(bundlePath, config) {
  ensureBaseDirs(config);

  const workspace = fs.mkdtempSync(path.join(config.workDir, 'tmp', 'bundle-'));
  const outerExtractionDir = path.join(workspace, 'outer');

  try {
    const outerInspection = await inspectTarFile(bundlePath, {
      label: 'release bundle',
      maxEntries: 3,
      maxExpandedBytes: config.uploadMaxBytes * 2,
    });

    assertArchiveEntriesContain(
      outerInspection,
      ['manifest.json', 'frontend.tar.gz', 'backend.tar.gz'],
      'release bundle'
    );

    await extractTarFile(bundlePath, outerExtractionDir);

    const manifestPath = path.join(outerExtractionDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new HttpError(400, 'bundle missing manifest.json');
    }

    const manifest = validateManifest(readJsonFile(manifestPath), config.uploadMaxBytes);
    if (manifest.runner.platform !== process.platform || manifest.runner.arch !== process.arch) {
      throw new HttpError(
        400,
        `bundle runtime mismatch: expected ${process.platform}/${process.arch}, got ${manifest.runner.platform}/${manifest.runner.arch}`
      );
    }

    const artifacts = await validateBundleArtifacts(outerExtractionDir, manifest, config);

    const frontendReleaseDir = path.join(config.frontendRoot, 'releases', manifest.releaseId);
    const backendReleaseDir = path.join(config.backendRoot, 'releases', manifest.releaseId);
    if (fs.existsSync(frontendReleaseDir) || fs.existsSync(backendReleaseDir)) {
      throw new HttpError(409, `release already exists: ${manifest.releaseId}`);
    }

    await prepareReleaseDirectory('frontend', artifacts.frontend.path, frontendReleaseDir);
    await prepareReleaseDirectory('backend', artifacts.backend.path, backendReleaseDir);

    const previousFrontendTarget = switchCurrentLink(config.frontendRoot, manifest.releaseId);
    const previousBackendTarget = switchCurrentLink(config.backendRoot, manifest.releaseId);

    let rollbackRequired = true;
    let restartResult = null;

    try {
      restartResult = executeShell(config.backendRestartCommand, config.repoRoot);
      rollbackRequired = false;
    } finally {
      if (rollbackRequired) {
        restoreCurrentLink(config.frontendRoot, previousFrontendTarget);
        restoreCurrentLink(config.backendRoot, previousBackendTarget);
        try {
          executeShell(config.backendRestartCommand, config.repoRoot);
        } catch (rollbackError) {
          console.error('[hot_update] rollback restart failed:', rollbackError.message);
        }
      }
    }

    cleanupOldReleases(config.frontendRoot, config.keepReleases);
    cleanupOldReleases(config.backendRoot, config.keepReleases);

    const deploymentRecord = recordDeployment(config, {
      releaseId: manifest.releaseId,
      version: manifest.version,
      commit: manifest.commit,
      builtAt: manifest.builtAt,
      deployedAt: new Date().toISOString(),
      frontendCurrent: manifest.releaseId,
      backendCurrent: manifest.releaseId,
      backendRestartCommand: config.backendRestartCommand,
      backendRestartResult: restartResult,
    });

    return {
      releaseId: manifest.releaseId,
      version: manifest.version,
      commit: manifest.commit,
      deploymentRecord,
      backendRestartResult: restartResult,
    };
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

module.exports = {
  deployBundle,
  ensureBaseDirs,
  sha256File,
};
