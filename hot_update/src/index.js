require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const { config } = require('./config');
const { NonceStore, createPreAuthMiddleware, verifyRequestSignature } = require('./auth');
const { deployBundle, ensureBaseDirs, sha256File } = require('./deploy');
const { HttpError } = require('./errors');

const app = express();
const nonceStore = new NonceStore(config.nonceTtlMs);

ensureBaseDirs(config);

const upload = multer({
  dest: path.join(config.workDir, 'uploads'),
  limits: {
    fileSize: config.uploadMaxBytes,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const safeName = file.originalname || '';
    if (!safeName.endsWith('.tar.gz')) {
      callback(new HttpError(400, 'bundle filename must end with .tar.gz'));
      return;
    }

    callback(null, true);
  },
});

let deployInFlight = false;

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  const currentRelease = (rootDir) => {
    const currentLink = path.join(rootDir, 'current');
    if (!fs.existsSync(currentLink)) {
      return null;
    }

    try {
      return path.basename(fs.readlinkSync(currentLink));
    } catch (_error) {
      return null;
    }
  };

  res.json({
    status: 'ok',
    frontendCurrent: currentRelease(config.frontendRoot),
    backendCurrent: currentRelease(config.backendRoot),
  });
});

app.post(
  '/api/artifacts/upload',
  createPreAuthMiddleware(config, nonceStore),
  (_req, _res, next) => {
    if (deployInFlight) {
      next(new HttpError(409, 'another deployment is already running'));
      return;
    }

    next();
  },
  upload.single('bundle'),
  async (req, res, next) => {
    if (!req.file) {
      next(new HttpError(400, 'missing bundle file field'));
      return;
    }

    deployInFlight = true;

    try {
      const digest = await sha256File(req.file.path);
      if (digest !== req.hotUpdateAuth.contentSha256) {
        throw new HttpError(400, 'bundle sha256 mismatch');
      }

      verifyRequestSignature(req.hotUpdateAuth, config.sharedSecret);

      const result = await deployBundle(req.file.path, config);
      res.status(201).json({
        ok: true,
        ...result,
      });
    } catch (error) {
      next(error);
    } finally {
      deployInFlight = false;
      if (req.file?.path) {
        fs.rmSync(req.file.path, { force: true });
      }
    }
  }
);

app.use((error, _req, res, _next) => {
  let statusCode = error instanceof HttpError ? error.statusCode : 500;
  if (error instanceof multer.MulterError) {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  }

  const payload = {
    message: error.message || 'internal server error',
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (!(error instanceof HttpError)) {
    console.error('[hot_update] unexpected error:', error);
  }

  res.status(statusCode).json(payload);
});

app.listen(config.port, () => {
  console.log(`[hot_update] listening on :${config.port}`);
});
