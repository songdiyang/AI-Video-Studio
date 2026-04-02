const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const fetch = require('node-fetch');

// HTTP/HTTPS 连接池（keep-alive 复用连接，减少 TCP 握手开销）
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

function getAgent(url) {
  return url.startsWith('https') ? httpsAgent : httpAgent;
}

// DNS 缓存（5分钟过期）
const dnsCache = new Map();
const DNS_CACHE_TTL = 5 * 60 * 1000;

async function cachedDnsLookup(hostname) {
  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && (now - cached.timestamp) < DNS_CACHE_TTL) {
    return cached.addresses;
  }
  
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  dnsCache.set(hostname, { addresses, timestamp: now });
  
  // 清理过期缓存（简单策略：超过 1000 条时清理）
  if (dnsCache.size > 1000) {
    for (const [key, value] of dnsCache) {
      if (now - value.timestamp > DNS_CACHE_TTL) {
        dnsCache.delete(key);
      }
    }
  }
  
  return addresses;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'local',
  'host.docker.internal',
  'gateway.docker.internal',
  'metadata',
  'metadata.google.internal'
]);

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4]
];

const BLOCKED_IPV6_RANGES = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10]
];

const BLOCKED_METADATA_IPS = new Set([
  '100.100.100.200',
  '169.254.169.254',
  '169.254.170.2'
]);

function createOutboundError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function ipv6ToBigInt(ip) {
  let normalized = normalizeHostname(ip);
  if (normalized.includes('%')) {
    normalized = normalized.split('%')[0];
  }

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4Part = normalized.slice(lastColon + 1);
    const ipv4Value = ipv4ToInt(ipv4Part);
    if (ipv4Value === null) {
      return null;
    }
    const high = ((ipv4Value >>> 16) & 0xffff).toString(16);
    const low = (ipv4Value & 0xffff).toString(16);
    normalized = `${normalized.slice(0, lastColon)}:${high}:${low}`;
  }

  const pieces = normalized.split('::');
  if (pieces.length > 2) {
    return null;
  }

  const head = pieces[0] ? pieces[0].split(':').filter(Boolean) : [];
  const tail = pieces[1] ? pieces[1].split(':').filter(Boolean) : [];
  const missing = 8 - (head.length + tail.length);
  if ((pieces.length === 1 && head.length !== 8) || missing < 0) {
    return null;
  }

  const full = pieces.length === 1
    ? head
    : [...head, ...Array(missing).fill('0'), ...tail];

  if (full.length !== 8) {
    return null;
  }

  let result = 0n;
  for (const part of full) {
    const value = parseInt(part, 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) {
      return null;
    }
    result = (result << 16n) + BigInt(value);
  }

  return result;
}

function isIpv4InRange(ip, base, prefixLength) {
  const ipValue = ipv4ToInt(ip);
  const baseValue = ipv4ToInt(base);
  if (ipValue === null || baseValue === null) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipValue & mask) === (baseValue & mask);
}

function isIpv6InRange(ip, base, prefixLength) {
  const ipValue = ipv6ToBigInt(ip);
  const baseValue = ipv6ToBigInt(base);
  if (ipValue === null || baseValue === null) {
    return false;
  }

  const shift = 128n - BigInt(prefixLength);
  return (ipValue >> shift) === (baseValue >> shift);
}

function isBlockedIp(address) {
  const normalized = normalizeHostname(address);

  if (BLOCKED_METADATA_IPS.has(normalized)) {
    return true;
  }

  if (net.isIP(normalized) === 4) {
    return BLOCKED_IPV4_RANGES.some(([base, prefixLength]) => isIpv4InRange(normalized, base, prefixLength));
  }

  if (net.isIP(normalized) === 6) {
    if (normalized.includes('.')) {
      const embeddedIpv4 = normalized.slice(normalized.lastIndexOf(':') + 1);
      if (net.isIP(embeddedIpv4) === 4 && isBlockedIp(embeddedIpv4)) {
        return true;
      }
    }

    return BLOCKED_IPV6_RANGES.some(([base, prefixLength]) => isIpv6InRange(normalized, base, prefixLength));
  }

  return false;
}

async function assertSafeOutboundUrl(rawUrl, options = {}) {
  const context = options.context || '出站请求';
  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw createOutboundError(`${context} 被拒绝：URL 非法`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw createOutboundError(`${context} 被拒绝：仅允许 HTTP/HTTPS 协议`);
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (!hostname) {
    throw createOutboundError(`${context} 被拒绝：缺少目标主机`);
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw createOutboundError(`${context} 被拒绝：禁止访问本机或本地域名`);
  }

  if (isBlockedIp(hostname)) {
    throw createOutboundError(`${context} 被拒绝：禁止访问内网或保留地址`);
  }

  if (net.isIP(hostname)) {
    return parsedUrl.toString();
  }

  let resolvedAddresses;
  try {
    resolvedAddresses = await cachedDnsLookup(hostname);
  } catch {
    throw createOutboundError(`${context} 被拒绝：无法解析目标主机`);
  }

  if (!resolvedAddresses.length) {
    throw createOutboundError(`${context} 被拒绝：目标主机无可用解析结果`);
  }

  for (const record of resolvedAddresses) {
    if (isBlockedIp(record.address)) {
      throw createOutboundError(`${context} 被拒绝：目标主机解析到了受限地址`);
    }
  }

  return parsedUrl.toString();
}

async function safeFetch(rawUrl, options = {}, context = '出站请求') {
  const safeUrl = await assertSafeOutboundUrl(rawUrl, { context });
  
  const { timeout, ...fetchOptions } = options;
  
  // 使用连接池 agent
  const agent = getAgent(safeUrl);
  
  // 如果设置了 timeout，使用 AbortController 实现超时
  if (timeout && timeout > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(safeUrl, {
        ...fetchOptions,
        agent,
        redirect: 'error',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`${context} 超时：请求超过 ${Math.round(timeout / 1000)} 秒`);
      }
      throw err;
    }
  }
  
  return fetch(safeUrl, {
    ...fetchOptions,
    agent,
    redirect: 'error'
  });
}

module.exports = {
  assertSafeOutboundUrl,
  safeFetch
};
