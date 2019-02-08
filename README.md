# Redis Commander

Redis management tool written in node.js

# Install and Run

```bash
$ npm install -g redis-commander
$ redis-commander
```

# Usage

```
$ redis-commander --help
Options:
  --redis-port                         The port to find redis on.               [string]
  --redis-host                         The host to find redis on.               [string]
  --redis-socket                       The unix-socket to find redis on.        [string]
  --redis-password                     The redis password.                      [string]
  --redis-db                           The redis database.                      [string]
  --redis-label                        The label to display for the connection. [string]
  --sentinel-port                      The port to find redis sentinel on.      [string]
  --sentinel-host                      The host to find redis sentinel on.      [string]
  --http-auth-username, --http-u       The http authorisation username.         [string]
  --http-auth-password, --http-p       The http authorisation password.         [string]
  --http-auth-password-hash, --http-h  The http authorisation password hash.    [string]
  --address, -a                        The address to run the server on.        [string]  [default: 0.0.0.0]
  --port, -p                           The port to run the server on.           [string]  [default: 8081]
  --url-prefix, -u                     The url prefix to respond on.            [string]  [default: ""]
  --root-pattern, --rp                 The root pattern of the redis keys.      [string]  [default: "*"]
  --read-only                          Start app in read-only mode.             [boolean] [default: false]
  --nosave, --ns                       Do not save new connections to config.   [boolean] [default: true]
  --noload, --nl                       Do not load connections from config.     [boolean] [default: false]
  --use-scan, --sc                     Use scan instead of keys.                [boolean] [default: false]
  --clear-config, --cc                 clear configuration file.
  --migrate-config                     migrate old configuration file in $HOME to new style.
  --scan-count, --sc                   The size of each seperate scan.          [integer] [default: 100]
  --no-log-data                        Do not log data values from redis store. [boolean] [default: false]
  --open                               Open web-browser with Redis-Commander.   [boolean] [default: false]
  --folding-char, --fc                 Character to fold keys at in tree view.  [character] [default: ":"]
  --test, -t                           test final configuration (file, env-vars, command line)
```

The connection can be established either via direct connection to redis server or indirect 
via a sentinel instance.

## Configuration

Redis Commander can be configured by configuration files, environment variables or using command line 
parameters. The different types of config values overwrite each other, only the last (most important)
value is used.

For configuration files the `node-config` module (https://github.com/lorenwest/node-config) is used, with default to json syntax.

The order of precedence for all configuration values (from least to most important) is:

- Configuration files
 
  `default.json` - this file contains all default values and SHOULD NOT be changed

  `local.json` - optional file, all local overwrites for values inside default.json should be placed here as well
  as a list of redis connections to use at startup

  `local-<NODE_ENV>.json` - Do not add anything else than connections to this file! Redis Commander will overwrite this whenever a
  connection is added or removed via user interface. Inside docker container this file is used to store
  all connections parsed from REDIS_HOSTS env var. 
  This file overwrites all connections defined inside `local.json`
  
  There are some more possible files available to use - please check the node-config Wiki
  for an complete list of all possible file names (https://github.com/lorenwest/node-config/wiki/Configuration-Files) 

- Environment variables - the full list of env vars possible (except the docker specific ones)
  can be get from the file `config/custom-environment-variables.json` together with their mapping 
  to the respective configuration key.

- Command line parameters - Overwrites everything

To check the final configuration created from files, env-vars set and command line param overwrites 
start redis commander with additional param "--test". All invalid configuration keys will be listed
in the output. The config test does not check if hostnames or ip addresses can be resolved.

## Environment Variables

These environment variables can be used starting Redis Commander as normal
application or inside docker container (defined inside file `config/custom-environment-variables.json`):

```
HTTP_USER
HTTP_PASSWORD
HTTP_PASSWORD_HASH
ADDRESS
PORT
READ_ONLY
URL_PREFIX
ROOT_PATTERN
NOSAVE
NO_LOG_DATA
FOLDING_CHAR
USE_SCAN
SCAN_COUNT
FLUSH_ON_IMPORT
REDIS_CONNECTION_NAME
REDIS_LABEL
```

## Docker

All environment variables listed at "Environment Variables" can be used running image
with Docker. The following additional environment variables are available too (defined inside
docker startup script):

```
REDIS_PORT
REDIS_HOST
REDIS_SOCKET
REDIS_TLS
REDIS_PASSWORD
REDIS_DB
REDIS_HOSTS
SENTINEL_PORT
SENTINEL_HOST
K8S_SIGTERM
```

The K8S_SIGTERM variable (default "0") can be set to "1" to work around kubernetes specificas
to allow pod replacement with zero downtime. More information on how kubernetes handles termination of old pods and the
setup of new ones can be found within the thread [https://github.com/kubernetes/contrib/issues/1140#issuecomment-290836405]

Hosts can be optionally specified with a comma separated string by setting the `REDIS_HOSTS` environment variable.

After running the container, `redis-commander` will be available at [localhost:8081](http://localhost:8081).

### Valid host strings

the REDIS_HOSTS environment variable is a comma separated list of host definitions,
where each host should follow one of these templates: 

`hostname`

`label:hostname`

`label:hostname:port`

`label:hostname:port:dbIndex`

`label:hostname:port:dbIndex:password`

Connection strings defined with `REDIS_HOSTS` variable do not support TLS connections.
If remote redis server needs TLS write all connections into a config file instead
of using `REDIS_HOSTS`.
 
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
    restart: always
    environment:
    - REDIS_HOSTS=local:redis:6379
    ports:
    - "8081:8081"
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

## OpenShift V3

To use the stock Node.js image builder do the following.

1. Open Catalog and select the Node.js template
1. Specify the name of the application and the URL to the [redis-command github repository](https://github.com/joeferner/redis-commander.git)
1. Click the ```advanced options``` link
1. (optional) specify the hostname for the route - _if one is not specified it will be generated_
1. In the Deployment Configuration section
   * Add ```REDIS_HOST``` environment variable whose value is the name of the redis service - e.g., ```redis```
   * Add ```REDIS_PORT``` environment variable whose value is the port exposed of the redis service - e.g., ```6379```
   * Add value from secret generated by the [redis template](https://github.com/sclorg/redis-container/blob/master/examples/redis-persistent-template.json):
     * name: ```REDIS_PASSWORD```
     * resource: ```redis```
     * key: ```database-password```
1. (optional) specify a label such as ```appl=redis-commander-dev1```
   * _this label will be applied on all objects created allowing for easy deletion later via:_
   ```bash
   oc delete all --selector appl=redis-commander-dev1
   ```

## Build images based on this one

To use this images as a base image for other images you need to call "apk update" inside your Dockerfile
before adding other apk packages with "apk add foo". Afterwards, to reduce your image size, you may
remove all temporary apk configs too again as this Dockerfile does.
