ARG BASE_IMAGE=node:20-bookworm-slim
FROM ${BASE_IMAGE}

WORKDIR /app/backend

ENV NODE_ENV=production

COPY docker/backend/entrypoint.sh /usr/local/bin/nanostory-backend-entrypoint.sh

RUN chmod +x /usr/local/bin/nanostory-backend-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["nanostory-backend-entrypoint.sh"]
CMD ["npm", "start"]
