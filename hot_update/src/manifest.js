const { HttpError } = require('./errors');

const EXPECTED_REQUIRED_FILES = Object.freeze({
  frontend: ['index.html'],
  backend: ['package.json', 'package-lock.json', 'src/index.js', 'node_modules'],
});

const EXPECTED_EXTRACTED_ENTRIES = Object.freeze({
  frontend: [
    { path: 'index.html', type: 'file' },
  ],
  backend: [
    { path: 'package.json', type: 'file' },
    { path: 'package-lock.json', type: 'file' },
    { path: 'src/index.js', type: 'file' },
    { path: 'node_modules', type: 'directory' },
  ],
});

function assertExactKeys(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object`);
  }

  const actual = Object.keys(value).sort();
  const expected = [...allowedKeys].sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new HttpError(400, `${label} contains unexpected fields`);
  }
}

function assertRegex(value, regex, label, maxLength = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || !regex.test(value)) {
    throw new HttpError(400, `invalid ${label}`);
  }
}

function assertSafeString(value, label, maxLength = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new HttpError(400, `invalid ${label}`);
  }
}

function assertRequiredFiles(actualFiles, expectedFiles, label) {
  if (!Array.isArray(actualFiles)) {
    throw new HttpError(400, `${label}.requiredFiles must be an array`);
  }

  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((value, index) => value !== expectedFiles[index])
  ) {
    throw new HttpError(400, `${label}.requiredFiles does not match contract`);
  }
}

function validateArtifact(name, artifact, maxUploadBytes) {
  assertExactKeys(artifact, ['file', 'format', 'requiredFiles', 'sha256', 'size'], `artifacts.${name}`);

  const expectedFile = `${name}.tar.gz`;
  if (artifact.file !== expectedFile) {
    throw new HttpError(400, `artifacts.${name}.file must equal ${expectedFile}`);
  }

  if (artifact.format !== 'tar.gz') {
    throw new HttpError(400, `artifacts.${name}.format must be tar.gz`);
  }

  assertRegex(artifact.sha256, /^[a-f0-9]{64}$/, `artifacts.${name}.sha256`, 64);

  if (!Number.isInteger(artifact.size) || artifact.size <= 0 || artifact.size > maxUploadBytes) {
    throw new HttpError(400, `artifacts.${name}.size out of range`);
  }

  assertRequiredFiles(artifact.requiredFiles, EXPECTED_REQUIRED_FILES[name], `artifacts.${name}`);
}

function validateManifest(manifest, maxUploadBytes) {
  assertExactKeys(
    manifest,
    ['app', 'artifacts', 'builtAt', 'bundleVersion', 'commit', 'ref', 'refName', 'releaseId', 'runner', 'version'],
    'manifest'
  );

  if (manifest.app !== 'nanostory') {
    throw new HttpError(400, 'manifest.app must equal nanostory');
  }

  if (manifest.bundleVersion !== 1) {
    throw new HttpError(400, 'unsupported bundle version');
  }

  assertRegex(manifest.version, /^[A-Za-z0-9._-]{1,64}$/, 'manifest.version', 64);
  assertRegex(manifest.releaseId, /^[A-Za-z0-9._-]{1,120}$/, 'manifest.releaseId', 120);
  assertRegex(manifest.commit, /^[a-f0-9]{40}$/, 'manifest.commit', 40);
  assertSafeString(manifest.ref, 'manifest.ref', 256);
  assertSafeString(manifest.refName, 'manifest.refName', 128);

  if (Number.isNaN(Date.parse(manifest.builtAt))) {
    throw new HttpError(400, 'manifest.builtAt must be a valid ISO timestamp');
  }

  assertExactKeys(manifest.runner, ['arch', 'node', 'platform'], 'manifest.runner');
  assertSafeString(manifest.runner.platform, 'manifest.runner.platform', 64);
  assertSafeString(manifest.runner.arch, 'manifest.runner.arch', 64);
  assertRegex(manifest.runner.node, /^v\d+\.\d+\.\d+$/, 'manifest.runner.node', 32);

  assertExactKeys(manifest.artifacts, ['backend', 'frontend'], 'manifest.artifacts');
  validateArtifact('frontend', manifest.artifacts.frontend, maxUploadBytes);
  validateArtifact('backend', manifest.artifacts.backend, maxUploadBytes);

  return manifest;
}

module.exports = {
  EXPECTED_EXTRACTED_ENTRIES,
  EXPECTED_REQUIRED_FILES,
  validateManifest,
};
