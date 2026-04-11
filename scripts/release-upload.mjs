#!/usr/bin/env node

import { createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dockerEnvFile, loadEnvFile, resolveLatestBundle } from './lib/common.mjs';

const bundlePath = resolveLatestBundle(process.argv[2]);
const envFile = loadEnvFile(dockerEnvFile);
const token = process.env.HOT_UPDATE_API_TOKEN || envFile.HOT_UPDATE_API_TOKEN;
const secret = process.env.HOT_UPDATE_SHARED_SECRET || envFile.HOT_UPDATE_SHARED_SECRET;
const httpPort = process.env.HTTP_PORT || envFile.HTTP_PORT || '80';
const uploadUrl = process.argv[3] || process.env.HOT_UPDATE_URL || `http://127.0.0.1:${httpPort}/hot-update/api/artifacts/upload`;

if (!token) {
  throw new Error('缺少 HOT_UPDATE_API_TOKEN，请在环境变量或 docker-compose.env 中配置');
}

if (!secret) {
  throw new Error('缺少 HOT_UPDATE_SHARED_SECRET，请在环境变量或 docker-compose.env 中配置');
}

const bundleBuffer = await fs.readFile(bundlePath);
const contentSha = createHash('sha256').update(bundleBuffer).digest('hex');
const timestamp = String(Date.now());
const nonce = randomBytes(16).toString('hex');
const signature = createHmac('sha256', secret)
  .update(`${timestamp}\n${nonce}\n${contentSha}`)
  .digest('hex');

const form = new FormData();
form.append(
  'bundle',
  new Blob([bundleBuffer], { type: 'application/gzip' }),
  path.basename(bundlePath)
);

const response = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'x-nanostory-timestamp': timestamp,
    'x-nanostory-nonce': nonce,
    'x-nanostory-content-sha256': contentSha,
    'x-nanostory-signature': signature,
  },
  body: form,
});

const responseText = await response.text();
if (!response.ok) {
  throw new Error(`upload failed: ${response.status} ${responseText}`);
}

console.log(responseText);
