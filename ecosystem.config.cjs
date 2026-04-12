module.exports = {
  apps: [
    {
      name: 'nanostory-backend',
      cwd: '/var/www/nanostory/backend',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        // 覆盖 .env 中的 Docker 内网地址，改为宿主机 localhost
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: '9000',
        CORE_SERVICE_URL: 'http://localhost:4102',
        NOTIFICATION_SERVICE_URL: 'http://localhost:4101',
        UPLOADS_BASE_DIR: '/var/www/nanostory/runtime/backend-data/uploads',
      },
      // 日志输出
      output: '/var/log/nanostory-backend-out.log',
      error: '/var/log/nanostory-backend-error.log',
      // 自动重启
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
    },
  ],
};
