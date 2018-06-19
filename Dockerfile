FROM node:9-alpine

WORKDIR /redis-commander

RUN  apk update \
  && apk add ca-certificates wget dumb-init \
  && update-ca-certificates

COPY package.json .
RUN npm install --production -s
COPY lib ./lib
COPY web ./web
COPY bin ./bin
COPY docker/entrypoint.sh .
COPY docker/redis-commander.json .redis_commander

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/redis-commander/entrypoint.sh"]

EXPOSE 8081
