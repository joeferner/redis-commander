FROM mhart/alpine-node:9

ADD docker/entrypoint.sh .
ADD docker/redis-commander.json .

RUN npm install -g @awearsolutions/redis-commander@0.4.5-rc.5 \
 && adduser -S redis-commander \
 && chmod a+x entrypoint.sh \
 && mv entrypoint.sh /home/redis-commander/entrypoint.sh \
 && mv redis-commander.json /home/redis-commander/.redis-commander \
 && chown -R redis-commander /home/redis-commander

USER redis-commander

ENTRYPOINT ["/home/redis-commander/entrypoint.sh"]

EXPOSE 8081
