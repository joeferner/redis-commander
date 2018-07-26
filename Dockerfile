FROM node:8-alpine

WORKDIR /redis-commander
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
  && update-ca-certificates \
  && adduser ${SERVICE_USER} -h ${HOME} -S \
  && chown -R ${SERVICE_USER} ${HOME} \
  && npm install --production -s \
  && rm -rf /tmp/* /root/.??* /root/cache /var/cache/apk/* \
  && ${HOME}/docker/harden.sh

USER ${SERVICE_USER}

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/redis-commander/docker/entrypoint.sh"]

EXPOSE 8081

