/**
 * IP 地理位置解析工具
 * 使用 ip-api.com 免费 API（无需 API Key，每分钟 45 次限制）
 * 备用：使用本地简单 IP 段匹配（中国主要省份）
 */

// 内存缓存：IP -> 地点，避免重复请求
const locationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

// 正在请求中的 IP（防止并发重复请求）
const pendingRequests = new Map();

/**
 * 通过 ip-api.com 解析 IP 地理位置
 * @param {string} ip - IP 地址
 * @returns {Promise<string|null>} 省份/城市，如 "湖北"、"四川成都"
 */
async function resolveIpByApi(ip) {
  // 本地/内网 IP 不查询
  if (!ip || isPrivateIp(ip)) return null;

  return new Promise((resolve) => {
    const http = require('http');
    const url = `http://ip-api.com/json/${ip}?lang=zh-CN&fields=regionName,city`;
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.regionName) {
            const directCities = ['北京', '上海', '天津', '重庆'];
            if (directCities.includes(json.regionName) || directCities.includes(json.city)) {
              resolve(json.city || json.regionName);
            } else {
              resolve(json.regionName);
            }
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * 判断是否为内网/本地 IP
 */
function isPrivateIp(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  if (parts[0] === 127 || parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  return false;
}

/**
 * 获取 IP 对应的地理位置（带缓存）
 * @param {string} ip - IP 地址
 * @returns {Promise<string|null>}
 */
async function getLocationByIp(ip) {
  if (!ip || isPrivateIp(ip)) return null;

  // 检查缓存
  const cached = locationCache.get(ip);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.location;
  }

  // 防止并发重复请求
  if (pendingRequests.has(ip)) {
    return pendingRequests.get(ip);
  }

  const promise = resolveIpByApi(ip).then(location => {
    locationCache.set(ip, { location, time: Date.now() });
    pendingRequests.delete(ip);
    return location;
  }).catch(() => {
    pendingRequests.delete(ip);
    return null;
  });

  pendingRequests.set(ip, promise);
  return promise;
}

module.exports = { getLocationByIp, isPrivateIp };
