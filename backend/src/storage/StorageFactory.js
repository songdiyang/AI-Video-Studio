const MinioStorage = require('./MinioStorage');
const TosStorage = require('./TosStorage');

/**
 * 对象存储工厂
 * 
 * 根据环境变量配置创建对应的存储实例。
 * 支持：MinIO、火山引擎 TOS，未来可扩展其他云存储。
 */
class StorageFactory {
  /**
   * 从环境变量读取配置
   */
  static getConfig() {
    return {
      endPoint:  process.env.MINIO_ENDPOINT   || 'localhost',
      port:      parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL:    process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY  || '',
      secretKey: process.env.MINIO_SECRET_KEY  || '',
      bucket:    process.env.MINIO_BUCKET      || 'nanostory',
      publicUrl: process.env.MINIO_PUBLIC_URL  || '',
      region:    process.env.TOS_REGION        || 'cn-beijing',
    };
  }

  /**
   * 检测是否应使用 TOS
   */
  static isTos() {
    if (process.env.USE_TOS === 'true') return true;
    const endpoint = process.env.MINIO_ENDPOINT || '';
    return endpoint.includes('volces.com');
  }

  /**
   * 创建存储实例
   * @returns {ObjectStorage|null}
   */
  static create() {
    const config = this.getConfig();

    if (!config.accessKey || !config.secretKey) {
      console.log('[StorageFactory] 未配置存储密钥，跳过初始化');
      return null;
    }

    if (this.isTos()) {
      console.log('[StorageFactory] 使用 TOS (火山引擎)');
      return new TosStorage(config);
    }

    console.log('[StorageFactory] 使用 MinIO');
    return new MinioStorage(config);
  }
}

module.exports = StorageFactory;
