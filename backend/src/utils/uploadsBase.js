const path = require('path');

function getUploadsBase() {
  const configuredPath = process.env.UPLOADS_BASE_DIR;
  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(__dirname, '..', '..', 'uploads');
}

module.exports = {
  getUploadsBase,
};
