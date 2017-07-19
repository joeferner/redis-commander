FROM mhart/alpine-node:8

COPY . /src/redis-commander

RUN cd /src/redis-commander \
 && npm install \
 && adduser -S redis-commander \
 && chmod a+x /src/redis-commander/docker/entrypoint.sh \
 && mv /src/redis-commander/docker/entrypoint.sh /usr/bin/entrypoint \
 && mv /src/redis-commander/docker/redis-commander.json /home/redis-commander/.redis-commander \
 && chown -R redis-commander /home/redis-commander /src/redis-commander

USER redis-commander

ENTRYPOINT entrypoint

EXPOSE 8081
