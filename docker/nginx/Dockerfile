ARG BASE_IMAGE=nginx:1.27-alpine
FROM ${BASE_IMAGE}

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/nginx/40-prepare-frontend.sh /docker-entrypoint.d/40-prepare-frontend.sh

RUN chmod +x /docker-entrypoint.d/40-prepare-frontend.sh \
  && mkdir -p /usr/share/nginx/site /srv/frontend-runtime /etc/nginx/snippets
