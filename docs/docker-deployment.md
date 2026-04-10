# Docker Deployment

这套部署方案包含以下容器：

- `nginx`：只挂载宿主机生成好的前端 `dist`
- `backend`：Node.js API 服务
- `minio`：对象存储，数据持久化到本地目录

如果你要启用产物热更新，再看 [hot-update.md](./hot-update.md)。

## 设计约束

- 前端不会在容器里构建
- 如果 `./dist` 不存在，Nginx 会返回提示页，提醒先在宿主机构建
- 如果 `./runtime/frontend/current` 存在，Nginx 会优先使用热更新产物
- 如果 `./runtime/backend/current` 存在，Backend 会优先从热更新目录启动
- Docker Hub 镜像通过 `DOCKER_IMAGE_PREFIX` 使用加速前缀
- npm 通过 `NPM_REGISTRY` 和仓库内 `.npmrc` 使用镜像源
- `backend` 容器直接读取现有的 [backend/.env](../backend/.env)
- 数据库不再由 Docker 管理，后端按 `backend/.env` 里的 MySQL 配置连接

## 目录

- Compose 文件：[docker-compose.yml](../docker-compose.yml)
- Compose 环境变量示例：[docker-compose.env.example](../docker-compose.env.example)
- Nginx 配置：[docker/nginx/default.conf.template](../docker/nginx/default.conf.template)
- 后端镜像：[docker/backend/Dockerfile](../docker/backend/Dockerfile)
- 根目录启动脚本：[docker-up.sh](../docker-up.sh)
- 启动脚本：[scripts/docker-up.sh](../scripts/docker-up.sh)

## 首次使用

### 1. 准备 Compose 环境变量

```bash
cp docker-compose.env.example docker-compose.env
```

至少改这些值：

- `MINIO_ROOT_PASSWORD`
- `MINIO_PUBLIC_URL`

`DOCKER_DATA_ROOT` 控制 MinIO 的宿主机数据目录。
后端数据库、JWT、管理员密钥等配置都放在 [backend/.env](../backend/.env)。

如果默认 Docker 加速前缀不可用，可以改：

```env
DOCKER_IMAGE_PREFIX=docker.m.daocloud.io/
```

如果 npm 镜像要切换，也改：

```env
NPM_REGISTRY=https://registry.npmmirror.com/
```

如果你是在 WSL 里运行 Docker，推荐把 MinIO 数据目录放在 Linux 文件系统路径，例如：

```env
DOCKER_DATA_ROOT=/home/inkbottle/nanostory-docker-data
```

### 2. 准备后端配置

确认 [backend/.env](../backend/.env) 里的这些值已经正确：

```env
MYSQL_HOST=你的数据库地址
MYSQL_PORT=3306
MYSQL_DATABASE=nanostory
MYSQL_USER=你的数据库用户
MYSQL_PASSWORD=你的数据库密码

JWT_SECRET=你的JWT密钥
ADMIN_ACCESS_KEY=你的后台访问密钥
```

`backend` 容器启动时会直接读取这个文件。

### 3. 在宿主机构建前端

```bash
npm install
npm run build
```

这一步必须在宿主机执行，产物会输出到 `./dist`，然后由 Nginx 直接挂载。

如果后续接入热更新，前端会优先读取 `./runtime/frontend/current`，但在第一次发布前，`./dist` 仍然保留为兼容回退目录。

### 4. 启动容器

```bash
chmod +x docker-up.sh
chmod +x scripts/docker-up.sh
./docker-up.sh
```

## 访问地址

- 网站首页：`http://localhost`
- 后端 API：`http://localhost:4000`
- MinIO API：`http://localhost:9000`
- MinIO Console：`http://localhost:9001`

## 持久化目录

- MinIO：`${DOCKER_DATA_ROOT}/minio`
- Backend logs：`./backend/logs`
- Backend uploads：`./runtime/backend-data/uploads`
- Runtime releases：`./runtime/frontend`、`./runtime/backend`

这些目录会由 Docker 自动创建。

## 常用命令

### 查看服务状态

```bash
docker compose --env-file docker-compose.env ps
```

### 查看日志

```bash
docker compose --env-file docker-compose.env logs -f
```

### 重建前端挂载

当前端重新执行 `npm run build` 后，通常只需要重启 Nginx：

```bash
docker compose --env-file docker-compose.env restart nginx
```

如果你已经接入热更新，则不再建议直接手工覆盖 `dist`，而是上传 CI 产物给 `hot_update` 服务。

### 停止并删除容器

```bash
docker compose --env-file docker-compose.env down
```

### 停止并删除容器与网络，但保留数据

```bash
docker compose --env-file docker-compose.env down
```

数据仍然保存在本地挂载目录中。

## 说明

### 关于 `dist` 缺失

如果你直接启动 `nginx` 容器但既没有 `./runtime/frontend/current/index.html`，也没有 `./dist/index.html`，页面会显示一段明确提示，告诉你先在宿主机执行：

```bash
npm install
npm run build
```

### 关于镜像加速

Compose 里所有公共镜像都支持通过 `DOCKER_IMAGE_PREFIX` 统一加速。例如：

- `docker.m.daocloud.io/nginx:1.27-alpine`
- `docker.m.daocloud.io/node:20-bookworm-slim`
- `docker.m.daocloud.io/minio/minio:latest`

如果你的环境里另一个加速前缀更稳定，只改 `docker-compose.env` 即可，不需要改 `docker-compose.yml`。
