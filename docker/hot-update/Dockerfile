ARG BASE_IMAGE=node:20-bookworm-slim
FROM ${BASE_IMAGE}

ARG NPM_REGISTRY=https://registry.npmmirror.com/

WORKDIR /app/hot_update

ENV NODE_ENV=production

COPY hot_update/package*.json ./

RUN npm config set registry "${NPM_REGISTRY}" \
  && npm ci --omit=dev \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker.io \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY hot_update/src ./src

EXPOSE 4205

CMD ["npm", "start"]
