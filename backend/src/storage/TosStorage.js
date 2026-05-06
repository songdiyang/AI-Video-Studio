const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const ObjectStorage = require('./ObjectStorage');

/**
 * 火山引擎 TOS 对象存储实现（基于 AWS S3 SDK）
 */
class TosStorage extends ObjectStorage {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return true;

    try {
      const endpoint = this.config.useSSL
        ? `https://${this.config.endPoint}`
        : `http://${this.config.endPoint}`;

      this.client = new S3Client({
        region: this.config.region || 'cn-beijing',
        endpoint: endpoint,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey,
        },
        forcePathStyle: false,
      });

      // 检查桶是否存在
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));

      this.ready = true;
      console.log(`[TosStorage] 就绪 (${this.config.endPoint}/${this.config.bucket})`);
      return true;
    } catch (err) {
      console.error('[TosStorage] 初始化失败:', err.message);
      this.client = null;
      return false;
    }
  }

  async upload(buffer, key, options = {}) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: options.contentType,
    }));
  }

  async download(key) {
    const headResult = await this.client.send(new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));

    const getResult = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));

    return {
      stream: getResult.Body,
      contentType: headResult.ContentType || '',
      size: headResult.ContentLength || 0,
    };
  }

  async delete(key) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
  }

  async exists(key) {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }));
      return true;
    } catch (err) {
      if (err.name === 'NotFound' || err.Code === 'NotFound') return false;
      throw err;
    }
  }

  async head(key) {
    const result = await this.client.send(new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));

    return {
      size: result.ContentLength || 0,
      contentType: result.ContentType || '',
      metaData: result.Metadata || {},
    };
  }

  getPublicUrl(key) {
    if (this.config.publicUrl) {
      const base = this.config.publicUrl.replace(/\/$/, '');
      return `${base}/${key}`;
    }
    const protocol = this.config.useSSL ? 'https' : 'http';
    return `${protocol}://${this.config.endPoint}/${this.config.bucket}/${key}`;
  }
}

module.exports = TosStorage;
