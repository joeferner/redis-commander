FROM node:8-alpine

WORKDIR /redis-commander

# optional build arg to let the hardening process revomve the apk too to not allow installation
# of packages anymore, default: do not remove "apk" to allow others to use this as a base image
# for own images
ARG REMOVE_APK=0

ENV SERVICE_USER=redis
ENV HOME=/redis-commander
ENV NODE_ENV=production

# only single copy command for most parts as other files are ignored via .dockerignore
# to create less layers
COPY . .
COPY docker/redis-commander.json .redis_commander

RUN  apk update \
  && apk upgrade \
  && apk add --no-cache ca-certificates dumb-init \
  && apk add --no-cache --virtual .patch-dep patch \
  && update-ca-certificates \
  && adduser ${SERVICE_USER} -h ${HOME} -S \
  && chown -R ${SERVICE_USER} ${HOME} \
  && npm install --production -s \
  && patch -p0 < docker/redis-dump.diff \
  && apk del .patch-dep \
  && rm -rf /tmp/* /root/.??* /root/cache /var/cache/apk/* \
  && ${HOME}/docker/harden.sh

USER ${SERVICE_USER}

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/redis-commander/docker/entrypoint.sh"]

EXPOSE 8081

