# Docker Deployment

仓库现在只保留一套正式运行模型：`Docker Compose`。

- 单一编排文件：[`docker-compose.yml`](../docker-compose.yml)
- 单一环境文件：[`docker-compose.env.example`](../docker-compose.env.example)
- 单一发布模型：`release bundle -> runtime/current -> hot-update`

## 服务组成

- `nginx`：统一入口，代理 `/api/`、`/ws`、`/notification/socket.io/`、`/hot-update/`
- `backend`：只从 `runtime/backend/current` 启动
- `hot-update`：接收 bundle、切换 `runtime/current`、重启 `backend`
- `notification-service`、`core-service-control`、`core-service-agent`、`minio`
- `frontend-dev`：仅在 `dev` profile 下启动，供 `npm run docker:dev` 使用

数据库继续外置，按 [`backend/.env`](../backend/.env) 连接。

## 首次启动

### 1. 准备环境变量

```bash
cp docker-compose.env.example docker-compose.env
cp backend/.env.example backend/.env
```

至少要填写：

- `backend/.env` 中的 MySQL、JWT、管理员密钥
- `docker-compose.env` 中的 `MINIO_ROOT_PASSWORD`
- `docker-compose.env` 中的 `HOT_UPDATE_API_TOKEN`
- `docker-compose.env` 中的 `HOT_UPDATE_SHARED_SECRET`

### 2. 初始化数据库

```bash
mysql -u root -p nanostory < backend/initial_database.sql
```

### 3. 构建并写入运行时版本

```bash
npm run build:release
npm run release:bootstrap
```

`release:bootstrap` 会把最新 bundle 解包到：

- `runtime/frontend/releases/<releaseId>`
- `runtime/backend/releases/<releaseId>`

然后更新：

- `runtime/frontend/current`
- `runtime/backend/current`

### 4. 启动服务

```bash
npm run docker:up
```

## 开发模式

```bash
npm run docker:dev
```

这个命令会：

- 启动标准后端栈
- 额外启动 `frontend-dev`
- 让 `nginx` 把前端请求代理到 Vite dev server

在运行 `docker:dev` 之前，仍然需要先执行一次 `npm run release:bootstrap`，因为后端只接受从 `runtime/backend/current` 启动。

## 热更新发布

### 构建 bundle

```bash
npm run build:release
```

产物输出到 `artifacts/`，包含：

- `nanostory-release-<releaseId>.tar.gz`
- `nanostory-release-<releaseId>.manifest.json`
- `nanostory-release-<releaseId>.summary.json`

### 上传 bundle

```bash
npm run release:upload
```

默认会：

- 读取 `docker-compose.env` 中的 `HOT_UPDATE_API_TOKEN` 和 `HOT_UPDATE_SHARED_SECRET`
- 选取 `artifacts/` 下最新的 bundle
- 上传到 `http://127.0.0.1:${HTTP_PORT}/hot-update/api/artifacts/upload`

也可以指定 bundle 和 URL：

```bash
npm run release:upload -- artifacts/nanostory-release-<releaseId>.tar.gz http://127.0.0.1/hot-update/api/artifacts/upload
```

## 常用命令

```bash
npm run docker:up
npm run docker:dev
npm run docker:logs
npm run docker:down
npm run build:release
npm run release:bootstrap
npm run release:upload
```

## 访问地址

- 首页：`http://localhost`
- API：`http://localhost/api/health`
- hot_update：`http://localhost/hot-update/health`
- MinIO API：`http://localhost:9000`
- MinIO Console：`http://localhost:9001`

## 运行时目录

- `runtime/frontend/releases/<releaseId>`
- `runtime/frontend/current`
- `runtime/backend/releases/<releaseId>`
- `runtime/backend/current`
- `runtime/backend-data/uploads`
- `runtime/hot-update/deployments`

## 说明

- `backend` 镜像不再内置业务代码 fallback；缺少 `runtime/backend/current` 时会直接退出。
- `nginx` 不再回退到 `dist`；缺少 `runtime/frontend/current` 时会返回明确提示页。
- `hot-update` 通过 Docker Socket 执行 `docker restart nanostory-backend`，因此当前部署模型默认是单机 Compose。
- 如果你使用 WSL，建议把 `DOCKER_DATA_ROOT` 指到 Linux 文件系统路径，避免 Docker Desktop 挂载性能问题。
