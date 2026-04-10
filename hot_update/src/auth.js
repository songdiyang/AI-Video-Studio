const { createHmac, timingSafeEqual } = require('crypto');
const { HttpError } = require('./errors');

const TIMESTAMP_HEADER = 'x-nanostory-timestamp';
const NONCE_HEADER = 'x-nanostory-nonce';
const CONTENT_SHA_HEADER = 'x-nanostory-content-sha256';
const SIGNATURE_HEADER = 'x-nanostory-signature';
const AUTHORIZATION_HEADER = 'authorization';

class NonceStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  cleanup(now = Date.now()) {
    for (const [nonce, expiresAt] of this.entries.entries()) {
      if (expiresAt <= now) {
        this.entries.delete(nonce);
      }
    }
  }

  reserve(nonce) {
    const now = Date.now();
    this.cleanup(now);

    const current = this.entries.get(nonce);
    if (current && current > now) {
      throw new HttpError(409, 'nonce already used');
    }

    this.entries.set(nonce, now + this.ttlMs);
  }
}

function parseBearerToken(headerValue) {
  if (!headerValue) {
    throw new HttpError(401, 'missing authorization header');
  }

  const [type, token] = headerValue.split(/\s+/, 2);
  if (type !== 'Bearer' || !token) {
    throw new HttpError(401, 'invalid authorization header');
  }

  return token;
}

function validateTimestamp(rawValue, allowedClockSkewMs) {
  if (!rawValue || !/^\d{10,16}$/.test(rawValue)) {
    throw new HttpError(401, 'invalid request timestamp');
  }

  const timestamp = Number(rawValue);
  if (!Number.isSafeInteger(timestamp)) {
    throw new HttpError(401, 'invalid request timestamp');
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > allowedClockSkewMs) {
    throw new HttpError(401, 'request timestamp outside allowed window');
  }

  return timestamp;
}

function validateNonce(rawValue) {
  if (!rawValue || !/^[A-Za-z0-9._-]{16,128}$/.test(rawValue)) {
    throw new HttpError(401, 'invalid request nonce');
  }

  return rawValue;
}

function validateShaHeader(rawValue) {
  if (!rawValue || !/^[a-f0-9]{64}$/.test(rawValue)) {
    throw new HttpError(401, 'invalid content sha256 header');
  }

  return rawValue;
}

function compareHexDigest(actualHex, expectedHex, message) {
  const actual = Buffer.from(actualHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new HttpError(401, message);
  }
}

function verifyRequestSignature({ timestamp, nonce, contentSha256, signature }, sharedSecret) {
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new HttpError(401, 'invalid signature header');
  }

  const expected = createHmac('sha256', sharedSecret)
    .update(`${timestamp}\n${nonce}\n${contentSha256}`)
    .digest('hex');

  compareHexDigest(signature, expected, 'signature verification failed');
}

function createPreAuthMiddleware(config, nonceStore) {
  return (req, _res, next) => {
    try {
      const token = parseBearerToken(req.headers[AUTHORIZATION_HEADER]);
      if (token !== config.apiToken) {
        throw new HttpError(401, 'invalid api token');
      }

      const timestamp = validateTimestamp(req.headers[TIMESTAMP_HEADER], config.allowedClockSkewMs);
      const nonce = validateNonce(req.headers[NONCE_HEADER]);
      const contentSha256 = validateShaHeader(req.headers[CONTENT_SHA_HEADER]);

      nonceStore.reserve(nonce);
      req.hotUpdateAuth = {
        timestamp,
        nonce,
        contentSha256,
        signature: req.headers[SIGNATURE_HEADER],
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  NonceStore,
  createPreAuthMiddleware,
  verifyRequestSignature,
  headers: {
    TIMESTAMP_HEADER,
    NONCE_HEADER,
    CONTENT_SHA_HEADER,
    SIGNATURE_HEADER,
  },
};
