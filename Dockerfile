FROM node:9-alpine

WORKDIR /redis-commander

COPY package.json .
RUN npm install --production -s
COPY lib ./lib
COPY web ./web
COPY bin ./bin
COPY docker/entrypoint.sh .
COPY docker/redis-commander.json .redis_commander

ENTRYPOINT ["/redis-commander/entrypoint.sh"]

EXPOSE 8081
