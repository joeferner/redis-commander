FROM node:9-alpine

WORKDIR /redis-commander

RUN  apk update \
  && apk add ca-certificates wget \
  && update-ca-certificates    \
  && wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.1/dumb-init_1.2.1_amd64 \
  && chmod +x /usr/local/bin/dumb-init

COPY package.json .
RUN npm install --production -s
COPY lib ./lib
COPY web ./web
COPY bin ./bin
COPY docker/entrypoint.sh .
COPY docker/redis-commander.json .redis_commander

ENTRYPOINT ["/usr/local/bin/dumb-init", "--"]
CMD ["/redis-commander/entrypoint.sh"]

EXPOSE 8081
