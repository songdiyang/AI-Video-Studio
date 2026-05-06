const ObjectStorage = require('./ObjectStorage');
const MinioStorage = require('./MinioStorage');
const TosStorage = require('./TosStorage');
const StorageFactory = require('./StorageFactory');

module.exports = {
  ObjectStorage,
  MinioStorage,
  TosStorage,
  StorageFactory,
};
