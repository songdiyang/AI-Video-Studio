const Minio = require('minio');
const ObjectStorage = require('./ObjectStorage');

/**
 * MinIO 对象存储实现
 */
class MinioStorage extends ObjectStorage {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return true;

    try {
      this.client = new Minio.Client({
        endPoint: this.config.endPoint,
        port: this.config.port,
        useSSL: this.config.useSSL,
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
      });

      // 确保桶存在
      const exists = await this.client.bucketExists(this.config.bucket);
      if (!exists) {
        await this.client.makeBucket(this.config.bucket);
        console.log(`[MinioStorage] 已创建存储桶: ${this.config.bucket}`);

        // 设置桶策略为公开只读
        const policy = {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.config.bucket}/*`]
          }]
        };
        await this.client.setBucketPolicy(this.config.bucket, JSON.stringify(policy));
        console.log(`[MinioStorage] 已设置桶公开只读策略`);
      }

      this.ready = true;
      console.log(`[MinioStorage] 就绪 (${this.config.endPoint}:${this.config.port}/${this.config.bucket})`);
      return true;
    } catch (err) {
      console.error('[MinioStorage] 初始化失败:', err.message);
      this.client = null;
      return false;
    }
  }

  async upload(buffer, key, options = {}) {
    const metaData = {};
    if (options.contentType) {
      metaData['Content-Type'] = options.contentType;
    }
    await this.client.putObject(this.config.bucket, key, buffer, buffer.length, metaData);
  }

  async download(key) {
    const stat = await this.client.statObject(this.config.bucket, key);
    const stream = await this.client.getObject(this.config.bucket, key);
    return {
      stream,
      contentType: stat.metaData?.['content-type'] || '',
      size: stat.size,
    };
  }

  async delete(key) {
    await this.client.removeObject(this.config.bucket, key);
  }

  async exists(key) {
    try {
      await this.client.statObject(this.config.bucket, key);
      return true;
    } catch (err) {
      if (err.code === 'NotFound') return false;
      throw err;
    }
  }

  async head(key) {
    const stat = await this.client.statObject(this.config.bucket, key);
    return {
      size: stat.size,
      contentType: stat.metaData?.['content-type'] || '',
      metaData: stat.metaData || {},
    };
  }

  getPublicUrl(key) {
    if (this.config.publicUrl) {
      const base = this.config.publicUrl.replace(/\/$/, '');
      return `${base}/${key}`;
    }
    const protocol = this.config.useSSL ? 'https' : 'http';
    return `${protocol}://${this.config.endPoint}:${this.config.port}/${this.config.bucket}/${key}`;
  }
}

module.exports = MinioStorage;
