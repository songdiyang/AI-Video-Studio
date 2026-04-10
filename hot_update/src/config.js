const path = require('path');

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }

  return value;
}

function readPositiveIntEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid positive integer env: ${name}`);
  }

  return parsed;
}

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'runtime');

const config = Object.freeze({
  repoRoot,
  port: readPositiveIntEnv('PORT', 4205),
  apiToken: readRequiredEnv('HOT_UPDATE_API_TOKEN'),
  sharedSecret: readRequiredEnv('HOT_UPDATE_SHARED_SECRET'),
  uploadMaxBytes: readPositiveIntEnv('HOT_UPDATE_UPLOAD_MAX_BYTES', 700 * 1024 * 1024),
  allowedClockSkewMs: readPositiveIntEnv('HOT_UPDATE_ALLOWED_CLOCK_SKEW_MS', 5 * 60 * 1000),
  nonceTtlMs: readPositiveIntEnv('HOT_UPDATE_NONCE_TTL_MS', 10 * 60 * 1000),
  keepReleases: readPositiveIntEnv('HOT_UPDATE_KEEP_RELEASES', 5),
  workDir: path.resolve(process.env.HOT_UPDATE_WORK_DIR || path.join(runtimeRoot, 'hot-update')),
  frontendRoot: path.resolve(process.env.HOT_UPDATE_FRONTEND_ROOT || path.join(runtimeRoot, 'frontend')),
  backendRoot: path.resolve(process.env.HOT_UPDATE_BACKEND_ROOT || path.join(runtimeRoot, 'backend')),
  backendRestartCommand: readRequiredEnv('HOT_UPDATE_BACKEND_RESTART_CMD'),
});

module.exports = {
  config,
};
