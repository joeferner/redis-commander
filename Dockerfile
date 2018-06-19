FROM node:9-alpine

WORKDIR /redis-commander
ENV SERVICEUSER=redis

RUN  apk update \
  && apk upgrade \
  && apk add ca-certificates wget dumb-init \
  && update-ca-certificates \
  && adduser $SERVICEUSER -h /redis-commander -S \
  && chown -R $SERVICEUSER /redis-commander

COPY package.json .
RUN npm install --production -s
COPY lib ./lib
COPY web ./web
COPY bin ./bin
COPY docker/entrypoint.sh .
COPY docker/redis-commander.json .redis_commander

USER $SERVICEUSER
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/redis-commander/entrypoint.sh"]

EXPOSE 8081
