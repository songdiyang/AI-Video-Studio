/**
 * AOM (Application Object Module) 文件格式工具
 *
 * 格式规范 v1:
 *   Offset  Size    Description
 *   ------  ----    -----------
 *   0       4       Magic: "AOM\x01" (0x41 0x4F 0x4D 0x01)
 *   4       2       Format version (uint16 LE, current = 1)
 *   6       2       Header size (uint16 LE, default = 64)
 *   8       4       Payload offset (uint32 LE, = header size)
 *   12      4       Payload size (uint32 LE)
 *   16      32      SHA-256 of payload (raw 32 bytes)
 *   48      16      Reserved (zeros)
 *   64      -       ZIP payload
 */

const AOM_MAGIC = new Uint8Array([0x41, 0x4F, 0x4D, 0x01]); // "AOM\x01"
const AOM_VERSION = 1;
const AOM_HEADER_SIZE = 64;

/**
 * 检查 ArrayBuffer 是否以 AOM 魔数开头
 */
export function isAOMFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new Uint8Array(buffer, 0, 4);
  return view.every((b, i) => b === AOM_MAGIC[i]);
}

/**
 * 解析 AOM 文件头
 * @returns { payloadOffset, payloadSize, sha256 } 或 null（如果不是 AOM）
 */
export function parseAOMHeader(buffer: ArrayBuffer): { payloadOffset: number; payloadSize: number; sha256: Uint8Array } | null {
  if (!isAOMFile(buffer)) return null;
  if (buffer.byteLength < AOM_HEADER_SIZE) {
    throw new Error('AOM 文件头不完整');
  }

  const view = new DataView(buffer);
  const version = view.getUint16(4, true);
  if (version !== AOM_VERSION) {
    throw new Error(`不支持的 AOM 版本: ${version}`);
  }

  const headerSize = view.getUint16(6, true);
  const payloadOffset = view.getUint32(8, true);
  const payloadSize = view.getUint32(12, true);
  const sha256 = new Uint8Array(buffer, 16, 32);

  // 验证 payload 范围
  if (payloadOffset < headerSize || payloadOffset + payloadSize > buffer.byteLength) {
    throw new Error('AOM payload 范围无效');
  }

  return { payloadOffset, payloadSize, sha256 };
}

/**
 * 计算 SHA-256
 */
async function sha256Buffer(data: ArrayBuffer): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * 验证 AOM 文件完整性
 */
export async function verifyAOM(buffer: ArrayBuffer): Promise<boolean> {
  const header = parseAOMHeader(buffer);
  if (!header) return false;

  const payload = buffer.slice(header.payloadOffset, header.payloadOffset + header.payloadSize);
  const actualSha256 = await sha256Buffer(payload);

  return actualSha256.every((b, i) => b === header!.sha256[i]);
}

/**
 * 从 AOM 文件提取 ZIP payload
 * @returns ZIP 数据的 ArrayBuffer，如果不是 AOM 则返回原 buffer
 */
export function extractAOMPayload(buffer: ArrayBuffer): ArrayBuffer {
  const header = parseAOMHeader(buffer);
  if (!header) {
    // 不是 AOM 文件，当作纯 ZIP 返回
    return buffer;
  }
  return buffer.slice(header.payloadOffset, header.payloadOffset + header.payloadSize);
}

/**
 * 将 ZIP ArrayBuffer 打包为 AOM 格式
 */
export async function packAOM(zipBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const sha256 = await sha256Buffer(zipBuffer);

  const header = new ArrayBuffer(AOM_HEADER_SIZE);
  const view = new DataView(header);
  const headerBytes = new Uint8Array(header);

  // Magic
  headerBytes.set(AOM_MAGIC, 0);
  // Version
  view.setUint16(4, AOM_VERSION, true);
  // Header size
  view.setUint16(6, AOM_HEADER_SIZE, true);
  // Payload offset
  view.setUint32(8, AOM_HEADER_SIZE, true);
  // Payload size
  view.setUint32(12, zipBuffer.byteLength, true);
  // SHA-256
  headerBytes.set(sha256, 16);
  // Reserved (already zeros)

  // Concatenate header + payload
  const result = new Uint8Array(AOM_HEADER_SIZE + zipBuffer.byteLength);
  result.set(headerBytes, 0);
  result.set(new Uint8Array(zipBuffer), AOM_HEADER_SIZE);

  return result.buffer;
}

/**
 * 将 File/Blob 读取为 ArrayBuffer
 */
export function readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ========== Manifest 验证 ==========

export interface AOMManifest {
  name: string;
  display_name: string;
  version: string;
  author: string;
  category: string;
  description: string;
  main: string;
  files: string[];
  dependencies?: Record<string, string>;
  permissions?: string[];
  min_app_version?: string;
  icon?: string;
  [key: string]: any;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: AOMManifest;
}

/**
 * 验证 manifest.json 是否符合 AOM 扩展包规范
 */
export function validateManifest(manifest: Record<string, any>): ManifestValidationResult {
  const errors: string[] = [];

  // 必填字段
  const required = ['name', 'display_name', 'version', 'author', 'category', 'description', 'main', 'files'];
  for (const field of required) {
    if (!manifest[field]) {
      errors.push(`manifest.json 缺少必填字段: ${field}`);
    }
  }

  // name 格式：只允许小写字母、数字、连字符
  if (manifest.name && !/^[a-z0-9-]+$/.test(manifest.name)) {
    errors.push('name 只能包含小写字母、数字和连字符');
  }

  // version 格式：语义化版本
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version 必须符合语义化版本格式 (如 1.0.0)');
  }

  // files 必须是数组
  if (manifest.files && !Array.isArray(manifest.files)) {
    errors.push('files 必须是数组');
  }

  // main 文件必须在 files 列表中
  if (manifest.main && manifest.files && Array.isArray(manifest.files)) {
    if (!manifest.files.includes(manifest.main)) {
      errors.push(`main 文件 "${manifest.main}" 必须在 files 列表中`);
    }
  }

  // min_app_version 格式检查
  if (manifest.min_app_version && !/^\d+\.\d+\.\d+/.test(manifest.min_app_version)) {
    errors.push('min_app_version 必须符合语义化版本格式');
  }

  // permissions 必须是数组
  if (manifest.permissions && !Array.isArray(manifest.permissions)) {
    errors.push('permissions 必须是字符串数组');
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? manifest as AOMManifest : undefined,
  };
}

/**
 * 检查应用版本是否满足扩展的最低版本要求
 */
export function checkAppVersionCompatibility(minAppVersion: string | undefined, currentVersion: string): boolean {
  if (!minAppVersion) return true;

  const parse = (v: string) => v.split('.').map(Number);
  const min = parse(minAppVersion);
  const current = parse(currentVersion);

  for (let i = 0; i < Math.max(min.length, current.length); i++) {
    const a = min[i] || 0;
    const b = current[i] || 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return true;
}

/**
 * 获取当前应用版本（从环境变量或配置中读取）
 */
export function getAppVersion(): string {
  // 优先从全局配置读取，否则返回默认版本
  return (window as any).__NANOSTORY_VERSION__ || '0.5.1';
}
