#!/bin/sh
set -eu

SITE_ROOT="${NGINX_SITE_ROOT:-/usr/share/nginx/site}"
DIST_DIR="${FRONTEND_DIST_DIR:-/srv/frontend-dist}"
LEGACY_DIST_DIR="${LEGACY_FRONTEND_DIST_DIR:-/srv/frontend-dist-legacy}"

rm -rf "${SITE_ROOT}"

if [ -f "${DIST_DIR}/index.html" ]; then
  ln -s "${DIST_DIR}" "${SITE_ROOT}"
  echo "[nginx] serving frontend dist from ${DIST_DIR}"
  exit 0
fi

if [ -f "${LEGACY_DIST_DIR}/index.html" ]; then
  ln -s "${LEGACY_DIST_DIR}" "${SITE_ROOT}"
  echo "[nginx] serving legacy frontend dist from ${LEGACY_DIST_DIR}"
  exit 0
fi

mkdir -p "${SITE_ROOT}"

cat > "${SITE_ROOT}/index.html" <<'EOF'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>NanoStory Frontend Dist Missing</title>
  <style>
    body {
      margin: 0;
      font-family: "Microsoft YaHei", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .panel {
      max-width: 720px;
      width: 100%;
      background: #111827;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 45px rgba(15, 23, 42, 0.45);
    }
    h1 {
      margin-top: 0;
      font-size: 28px;
    }
    p, li {
      color: #cbd5e1;
      line-height: 1.7;
    }
    code, pre {
      font-family: Consolas, Monaco, monospace;
      background: #0f172a;
      border-radius: 8px;
    }
    pre {
      padding: 16px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="panel">
    <h1>未检测到前端 dist 构建产物</h1>
    <p>Nginx 容器不会在容器内构建前端。请先在宿主机完成构建，再重新启动或重建 Nginx 容器。</p>
    <pre>npm install
npm run build
docker-compose --env-file docker-compose.env up -d --build</pre>
    <p>期望挂载目录：</p>
    <ul>
      <li>热更新目录：宿主机 <code>./runtime/frontend/current</code>，容器内 <code>/srv/frontend-runtime/current</code></li>
      <li>兼容目录：宿主机 <code>./dist</code>，容器内 <code>/srv/frontend-dist-legacy</code></li>
    </ul>
  </div>
</body>
</html>
EOF

echo "[nginx] frontend dist missing at ${DIST_DIR} and ${LEGACY_DIST_DIR}, serving reminder page"
