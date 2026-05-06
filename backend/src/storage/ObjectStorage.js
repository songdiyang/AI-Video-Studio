/**
 * 对象存储抽象基类
 * 
 * 定义所有存储后端必须实现的统一接口。
 * 新增存储后端时，继承此类并实现所有方法即可。
 */
class ObjectStorage {
  /**
   * 初始化存储客户端（连接、认证、检查桶等）
   * @returns {Promise<boolean>} 是否初始化成功
   */
  async init() {
    throw new Error('init() 必须在子类中实现');
  }

  /**
   * 上传文件
   * @param {Buffer} buffer - 文件内容
   * @param {string} key - 对象键（存储路径）
   * @param {object} [options] - 可选配置
   * @param {string} [options.contentType] - MIME 类型
   * @returns {Promise<void>}
   */
  async upload(buffer, key, options = {}) {
    throw new Error('upload() 必须在子类中实现');
  }

  /**
   * 下载文件
   * @param {string} key - 对象键
   * @returns {Promise<{stream: ReadableStream, contentType: string, size: number}>}
   */
  async download(key) {
    throw new Error('download() 必须在子类中实现');
  }

  /**
   * 删除文件
   * @param {string} key - 对象键
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error('delete() 必须在子类中实现');
  }

  /**
   * 检查对象是否存在
   * @param {string} key - 对象键
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error('exists() 必须在子类中实现');
  }

  /**
   * 获取对象元信息
   * @param {string} key - 对象键
   * @returns {Promise<{size: number, contentType: string, metaData: object}>}
   */
  async head(key) {
    throw new Error('head() 必须在子类中实现');
  }

  /**
   * 生成公开访问 URL
   * @param {string} key - 对象键
   * @returns {string}
   */
  getPublicUrl(key) {
    throw new Error('getPublicUrl() 必须在子类中实现');
  }
}

module.exports = ObjectStorage;
