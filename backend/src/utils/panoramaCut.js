/**
 * equirectangular 全景图 → 透视视图重采样
 *
 * 给定一张 equirectangular 2:1 全景图（W x H，水平 360° / 垂直 180°），
 * 以及视角参数 (yaw, pitch, fov)，输出一张透视投影图。
 *
 * 坐标系约定：
 *   - 相机默认朝 -Z 方向，+Y 朝上，+X 朝右（右手系）
 *   - yaw > 0 表示向右转（绕 +Y 轴）
 *   - pitch > 0 表示向上看（绕 +X 轴）
 *   - fov 为垂直视场角（度）
 *
 * 算法：对每个输出像素反算视线方向，应用相机旋转得到世界方向，
 *       换算为球面坐标 (theta, phi)，映射回全景图 UV，双线性插值采样。
 */
const sharp = require('sharp');

/**
 * 下载远程图片到 Buffer（兼容 MinIO 公共 URL / http / https / file://）
 */
async function fetchToBuffer(url) {
  if (!url) throw new Error('全景图 URL 缺失');
  // Node 18+ 自带 fetch
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载全景图失败 HTTP ${res.status}: ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * 核心重采样函数
 *
 * @param {Buffer} panoBuffer - 全景图文件 buffer
 * @param {object} opts
 * @param {number} opts.yawDeg   - 水平视角（度，0 表示朝前）
 * @param {number} opts.pitchDeg - 俯仰角（度，默认 0 水平视）
 * @param {number} opts.fovDeg   - 垂直视场角（度，默认 75）
 * @param {number} opts.outW     - 输出宽度（默认 768）
 * @param {number} opts.outH     - 输出高度（默认 1024，适合竖屏分镜）
 * @returns {Promise<Buffer>}    - PNG 格式 Buffer
 */
async function cutEquirectangularToPerspective(panoBuffer, opts = {}) {
  const {
    yawDeg = 0,
    pitchDeg = 0,
    fovDeg = 75,
    outW = 768,
    outH = 1024,
  } = opts;

  const src = sharp(panoBuffer).ensureAlpha();
  const meta = await src.metadata();
  const W = meta.width;
  const H = meta.height;
  if (!W || !H) throw new Error('无法读取全景图尺寸');

  const { data: raw } = await src.raw().toBuffer({ resolveWithObject: true });
  // raw 为 RGBA 每像素 4 字节，长度 = W * H * 4

  const out = Buffer.alloc(outW * outH * 4);

  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const fovRad = (fovDeg * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRad / 2);
  const aspect = outW / outH;
  const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

  const twoPi = Math.PI * 2;
  const invTwoPi = 1 / twoPi;
  const invPi = 1 / Math.PI;

  for (let y = 0; y < outH; y++) {
    const ny = 1 - ((y + 0.5) / outH) * 2; // 图片 y 向下；相机 +Y 向上
    for (let x = 0; x < outW; x++) {
      const nx = ((x + 0.5) / outW) * 2 - 1;

      // 相机空间视线
      let vx = nx * aspect * tanHalfFov;
      let vy = ny * tanHalfFov;
      let vz = -1;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
      vx /= len; vy /= len; vz /= len;

      // Rx(pitch)
      const ry = vy * cosP - vz * sinP;
      const rz = vy * sinP + vz * cosP;
      const rx = vx;

      // Ry(yaw)
      const wx = rx * cosY + rz * sinY;
      const wy = ry;
      const wz = -rx * sinY + rz * cosY;

      // 球面坐标：theta 为水平方位角，phi 为仰角
      const theta = Math.atan2(wx, -wz);            // [-π, π]
      const phiClamped = Math.max(-1, Math.min(1, wy));
      const phi = Math.asin(phiClamped);            // [-π/2, π/2]

      // 映射回 equirectangular UV（像素坐标）
      const u = (theta + Math.PI) * invTwoPi * W;   // [0, W)
      const v = (Math.PI / 2 - phi) * invPi * H;    // [0, H]

      // 双线性插值：水平环绕，垂直截断
      const u0 = Math.floor(u);
      const v0 = Math.floor(v);
      const du = u - u0;
      const dv = v - v0;

      const u0m = ((u0 % W) + W) % W;
      const u1m = ((u0 + 1) % W + W) % W;
      const v0c = v0 < 0 ? 0 : (v0 >= H ? H - 1 : v0);
      const v1c = v0 + 1 < 0 ? 0 : (v0 + 1 >= H ? H - 1 : v0 + 1);

      const i00 = (v0c * W + u0m) * 4;
      const i01 = (v0c * W + u1m) * 4;
      const i10 = (v1c * W + u0m) * 4;
      const i11 = (v1c * W + u1m) * 4;

      const outIdx = (y * outW + x) * 4;
      // 展开通道循环，减少开销
      const a0 = raw[i00] * (1 - du) + raw[i01] * du;
      const b0 = raw[i10] * (1 - du) + raw[i11] * du;
      out[outIdx] = (a0 * (1 - dv) + b0 * dv + 0.5) | 0;

      const a1 = raw[i00 + 1] * (1 - du) + raw[i01 + 1] * du;
      const b1 = raw[i10 + 1] * (1 - du) + raw[i11 + 1] * du;
      out[outIdx + 1] = (a1 * (1 - dv) + b1 * dv + 0.5) | 0;

      const a2 = raw[i00 + 2] * (1 - du) + raw[i01 + 2] * du;
      const b2 = raw[i10 + 2] * (1 - du) + raw[i11 + 2] * du;
      out[outIdx + 2] = (a2 * (1 - dv) + b2 * dv + 0.5) | 0;

      const a3 = raw[i00 + 3] * (1 - du) + raw[i01 + 3] * du;
      const b3 = raw[i10 + 3] * (1 - du) + raw[i11 + 3] * du;
      out[outIdx + 3] = (a3 * (1 - dv) + b3 * dv + 0.5) | 0;
    }
  }

  const pngBuffer = await sharp(out, {
    raw: { width: outW, height: outH, channels: 4 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return pngBuffer;
}

module.exports = {
  fetchToBuffer,
  cutEquirectangularToPerspective,
};
