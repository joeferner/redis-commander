# Simple Dockerfile to execute redis-commander from docker
# build it with like: docker build -t redis-commander .
# to run: docker run -d --name redis-commander -p 8081:8081 redis-commander -- --redis-host your-redis-host
FROM node

RUN mkdir -p /usr/src
WORKDIR /usr/src

RUN git clone https://github.com/joeferner/redis-commander.git \
	&& cd redis-commander \
	&& npm install -g redis-commander

ENTRYPOINT [ "redis-commander" ]

EXPOSE 8081
