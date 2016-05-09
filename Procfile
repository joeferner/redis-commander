#web: bin/redis-commander.js --nosave --clear-config --sentinel-host redis-sentinel  --setinel-port 26379
#web: bin/redis-commander.js --nosave --clear-config --redis-host 10.244.1.17  --redis-port 6379 --port $PORT
web: DEBUG=ioredis:* bin/redis-commander.js --nosave --clear-config --sentinel-host redis-sentinel.default --sentinel-port 26379 --port $PORT
