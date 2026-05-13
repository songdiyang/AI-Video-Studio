#!/bin/sh
set -eu

SITE_ROOT="${NGINX_SITE_ROOT:-/usr/share/nginx/site}"
FRONTEND_MODE="${NGINX_FRONTEND_MODE:-static}"
DIST_DIR="${FRONTEND_DIST_DIR:-/srv/frontend-runtime/current}"
FRONTEND_UPSTREAM="${FRONTEND_UPSTREAM:-http://frontend-dev:5173}"
FRONTEND_SNIPPET="/etc/nginx/snippets/frontend-location.conf"

mkdir -p "$(dirname "${FRONTEND_SNIPPET}")"

write_proxy_snippet() {
  cat > "${FRONTEND_SNIPPET}" <<EOF
location / {
    proxy_pass ${FRONTEND_UPSTREAM};
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
}
EOF
}

write_static_snippet() {
  cat > "${FRONTEND_SNIPPET}" <<'EOF'
location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    try_files $uri $uri/ /index.html;
}
EOF
}

if [ "${FRONTEND_MODE}" = "proxy" ]; then
  write_proxy_snippet
  echo "[nginx] proxying frontend to ${FRONTEND_UPSTREAM}"
  exit 0
fi

# 如果 SITE_ROOT 是挂载的卷（目录），不能直接 rm -rf
# 先尝试取消符号链接，然后清空目录内容
if [ -L "${SITE_ROOT}" ]; then
  rm -f "${SITE_ROOT}"
elif [ -d "${SITE_ROOT}" ]; then
  rm -rf "${SITE_ROOT:?}"/*
fi

if [ -f "${DIST_DIR}/index.html" ]; then
  ln -sfn "${DIST_DIR}" "${SITE_ROOT}"
  write_static_snippet
  echo "[nginx] serving frontend runtime from ${DIST_DIR}"
  exit 0
fi

mkdir -p "${SITE_ROOT}"
write_static_snippet

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
    <h1>未检测到前端运行时版本</h1>
    <p>当前仓库只支持通过运行时发布目录启动前端。请先生成 release bundle 并执行 bootstrap。</p>
    <pre>npm run build:release
npm run release:bootstrap
npm run docker:up</pre>
    <p>期望目录：宿主机 <code>./runtime/frontend/current</code>，容器内 <code>/srv/frontend-runtime/current</code></p>
  </div>
</body>
</html>
EOF

echo "[nginx] frontend runtime missing at ${DIST_DIR}, serving reminder page"
