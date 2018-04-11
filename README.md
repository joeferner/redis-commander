# Redis Commander

Redis management tool written in node.js

# Install and Run

```bash
$ npm install -g redis-commander
$ redis-commander
```

# Usage

```bash
$ redis-commander --help
Options:
  --redis-port                         The port to find redis on.              [string]
  --redis-host                         The host to find redis on.              [string]
  --redis-socket                       The unix-socket to find redis on.       [string]
  --redis-password                     The redis password.                     [string]
  --redis-db                           The redis database.                     [string]
  --http-auth-username, --http-u       The http authorisation username.        [string]
  --http-auth-password, --http-p       The http authorisation password.        [string]
  --http-auth-password-hash, --http-h  The http authorisation password hash.   [string]
  --port, -p                           The port to run the server on.          [string]  [default: 8081]
  --address, -a                        The address to run the server on        [string]  [default: 0.0.0.0]
  --root-pattern, -rp                  The root pattern of the redis keys      [string]  [default: *]
  --use-scan, -sc                      Use scan instead of keys                [boolean] [default: false]
```

## Docker

Available environment variables:

```
REDIS_PORT
REDIS_HOST
REDIS_SOCKET
REDIS_PASSWORD
REDIS_DB
REDIS_HOSTS
HTTP_USER
HTTP_PASSWORD
HTTP_PASSWORD_HASH
PORT
ADDRESS
ROOT_PATTERN
```

Hosts can be optionally specified with a comma separated string by setting the `REDIS_HOSTS` environment variable.

After running the container, `redis-commander` will be available at [localhost:8081](http://localhost:8081).

### Valid host strings

Form should follow one of these templates:

`hostname`

`label:hostname`

`label:hostname:port`

`label:hostname:port:dbIndex`

`label:hostname:port:dbIndex:password`

### With docker-compose

```yml
version: '3'
services:
  redis:
    container_name: redis
    hostname: redis
    image: redis

  redis-commander:
    container_name: redis-commander
    hostname: redis-commander
    image: rediscommander/redis-commander:latest
    build: .
    restart: always
    environment:
    - REDIS_HOSTS=local:redis:6379
    ports:
    - 8081:8081
```

### Without docker-compose

#### Simplest

If you're running redis on `localhost:6379`, this is all you need to get started.

```bash
docker run --rm --name redis-commander -d \
  -p 8081:8081 \
  rediscommander/redis-commander:latest
```

#### Specify single host

```bash
docker run --rm --name redis-commander -d \
  --env REDIS_HOSTS=10.10.20.30 \
  -p 8081:8081 \
  rediscommander/redis-commander:latest
```

#### Specify multiple hosts with labels

```bash
docker run --rm --name redis-commander -d \
  --env REDIS_HOSTS=local:localhost:6379,myredis:10.10.20.30 \
  -p 8081:8081 \
  rediscommander/redis-commander:latest
```

## Kubernetes

An example deployment can be found at [k8s/redis-commander/deployment.yaml](k8s/redis-commander/deployment.yaml).

If you already have a cluster running with `redis` in the default namespace, deploy `redis-commander` with `kubectl apply -f k8s/redis-commander`. If you don't have `redis` running yet, you can deploy a simple pod with `kubectl apply -f k8s/redis`.

Alternatively, you can add a container to a deployment's spec like this:

```
containers:
- name: redis-commander
  image: rediscommander/redis-commander
  env:
  - name: REDIS_HOSTS
    value: instance1:redis:6379
  ports:
  - name: redis-commander
    containerPort: 8081
```
