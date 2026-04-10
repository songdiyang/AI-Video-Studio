# Hot Update

这套热更新链路分成三段：

1. GitHub Actions 构建前端和后端运行时产物，并打成单个 `release bundle`
2. `hot_update` 服务接收这个 bundle，做严格校验
3. 校验通过后，把前后端一起切换到新的运行时版本

## Release Bundle 格式

CI 产出的 bundle 是一个 `tar.gz`，内部固定只有这 3 个文件：

- `manifest.json`
- `frontend.tar.gz`
- `backend.tar.gz`

`manifest.json` 里会记录：

- `app`
- `bundleVersion`
- `version`
- `releaseId`
- `commit`
- `ref`
- `refName`
- `builtAt`
- `runner`
- `artifacts.frontend`
- `artifacts.backend`

前后端产物都要求包含固定关键文件：

- 前端：`index.html`
- 后端：`package.json`、`package-lock.json`、`src/index.js`、`node_modules`

## GitHub CI

工作流文件在 [`.github/workflows/build-release.yml`](../.github/workflows/build-release.yml)。

它会做这些事：

- `npm ci` + `npm run build` 构建前端
- `backend/npm ci --omit=dev` 生成后端运行时依赖
- 调用 [`scripts/create-release-bundle.mjs`](../scripts/create-release-bundle.mjs) 生成统一 bundle
- 上传到 GitHub Actions artifact
- 如果是 `v*` tag，再附加到 GitHub Release

产物会输出到仓库根目录 `artifacts/`。

## 运行时目录

热更新不再直接覆盖源码目录，而是切到 `runtime/`：

- 前端发布目录：`./runtime/frontend/releases/<releaseId>`
- 前端当前版本：`./runtime/frontend/current`
- 后端发布目录：`./runtime/backend/releases/<releaseId>`
- 后端当前版本：`./runtime/backend/current`
- 后端上传文件目录：`./runtime/backend-data/uploads`
- 热更新服务工作目录：`./runtime/hot-update`

`current` 是符号链接。热更新成功后只切换链接，不直接改容器里的运行目录。

## Docker 接入

[`docker-compose.yml`](../docker-compose.yml) 现在有两层行为：

- Nginx 优先读取 `./runtime/frontend/current`
- 如果热更新目录还没准备好，Nginx 会回退到旧的 `./dist`
- Backend 优先读取 `./runtime/backend/current`
- 如果热更新目录还没准备好，Backend 会回退到镜像内自带代码
- 后端上传文件改写到 `UPLOADS_BASE_DIR=/srv/backend-data/uploads`

这样可以先上线热更新能力，再逐步切换到新链路。

## 启动 Hot Update 服务

```bash
cd hot_update
npm install
cp .env.example .env
```

至少要改这几个值：

- `HOT_UPDATE_API_TOKEN`
- `HOT_UPDATE_SHARED_SECRET`
- `HOT_UPDATE_BACKEND_RESTART_CMD`

启动：

```bash
npm start
```

健康检查：

```bash
curl http://127.0.0.1:4205/health
```

## 上传 Bundle

推荐直接用 helper：

```bash
chmod +x hot_update/scripts/upload-bundle.sh
HOT_UPDATE_API_TOKEN=your-token \
HOT_UPDATE_SHARED_SECRET=your-secret \
hot_update/scripts/upload-bundle.sh \
artifacts/nanostory-release-<releaseId>.tar.gz
```

默认上传地址是 `http://127.0.0.1:4205/api/artifacts/upload`，也可以传第二个参数覆盖。

## 服务端校验项

`hot_update` 会拒绝任何不符合约束的请求，当前校验包括：

- `Authorization: Bearer <token>`
- `x-nanostory-timestamp` 时间窗校验
- `x-nanostory-nonce` 重放保护
- `x-nanostory-content-sha256` 内容摘要校验
- `x-nanostory-signature` HMAC-SHA256 校验
- 上传文件大小限制
- 外层 bundle 结构固定校验
- `manifest.json` 精确字段校验
- `tar` 条目禁止绝对路径、`..` 穿越、symlink 和非常规条目
- 前后端运行时关键文件存在性校验

签名原文固定是：

```text
<timestamp>\n<nonce>\n<content_sha256>
```

密钥使用 `HOT_UPDATE_SHARED_SECRET`。

## 部署后行为

部署成功后会：

1. 解包前后端产物到新的 release 目录
2. 切换 `runtime/frontend/current`
3. 切换 `runtime/backend/current`
4. 执行 `HOT_UPDATE_BACKEND_RESTART_CMD`
5. 写入部署记录到 `runtime/hot-update/deployments/`

如果后端重启失败，会回滚前后端 `current` 链接，然后尝试把旧版本重新拉起。
