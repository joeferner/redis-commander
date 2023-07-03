# Redis Commander - Connection Configuration

This file describes all parameters available to configure
connections to redis servers. All connection objects are
stored inside the top-level `connections` list.

## Storing Connection information

The default set of connections to start redis commander with
can be defined inside the `local.json` file (for example).
Whenever a connection is added via Web-UI or command line
a new file `local-<node_env>.json` is created to store the
new list of all connections currently used. This is done to
persist new configuration data over app restarts. To reset the
list to your "original" start, just delete

Attention - list objects are not merged between all config files.
The latest definition of the list is used. E.G. a redefinition
of the `connections` list object inside the `local-<node_env>.json`
overwrites all connections defined inside `<node-env>.json` or
`local.json`.

### Connect via Unix-Socket

Only the "path" parameter is needed with the path to the unix socket to use.
Parameter "host", "port" and all "sentinel*" should not be set.

```json
{
  "connections": [
    {
      "label": "redis-unix-socket",
      "path": "/var/run/redis.socket",
      "password": "<optional>",
      "dbIndex": 0
    }
  ]
}
```

### Connect to normal standalone Redis server

"host" and "port" are needed.
Do not set "path" or one of the "sentinel*" parameter as they have precedence
over "host" and "port"!
"host" can be either an IPv4 address, IPv6 address or a hostname.

```json
{
  "connections": [
    {
      "label": "redis-standalone",
      "host": "192.0.2.1",
      "port": 6379,
      "password": "<optional>",
      "dbIndex": 0
    }
  ]
}
```

### Connect to Redis server via Redis sentinel

Parameter "sentinels" contains a list of one or more Redis sentinels
used for connection. For better failover handling at least two sentinels
should be provided to allow connections if one of them is temporarily not available.
This sentinels can either be set as a String containing `<ip>:<port>` or as an object
with `host` and `port` field. The second variant with an object allows setting more parameter
(as described by ioredis library sentinel connection documentation).
 
If sentinels needs authentication (not auth from redis server itself but sentinel)
the password must be set as "sentinelPassword".
Another optional parameter is "sentinelName" setting the default server group the
client should use to fetch master server data from sentinels. Default is "mymaster" here if not set.

Parameter "path", "host" and "port" are ignored.

The following configuration lists different kind of valid `sentinels` string that will be 
parsed as list of sentinels to connect:
 1. pure comma separated string
 2. stringified json array
 3. array of strings
 4. array of objects

Attention - connecting to a Redis server via IPv6 the form with a list of objects must be used (last example). All other variants do not work due to ":"
being part of the IPv6 address too.

```json
{
  "connections": [
    {
      "label": "redis-sentinel-1",
      "sentinels": "192.0.2.2:26379, 192.0.2.3:26379",
      "sentinelName": "mymaster",
      "password": "<optional-redis-server-pw>",
      "sentinelPassword": "<optional-sentinel-pw>",
      "dbIndex": 0
    },
    {
      "label": "redis-sentinel-2",
      "sentinels": "[192.0.2.2:26379, 192.0.2.3:26379]",
      "sentinelName": "mymaster",
      "password": "<optional-redis-server-pw>",
      "sentinelPassword": "<optional-sentinel-pw>",
      "dbIndex": 0
    },
    {
      "label": "redis-sentinel-3",
      "sentinels": [
        "192.0.2.2:26379",
        "192.0.2.3:26379"
      ],
      "sentinelName": "mymaster",
      "password": "<optional-redis-server-pw>",
      "sentinelPassword": "<optional-sentinel-pw>",
      "dbIndex": 0
    },
    {
      "label": "redis-sentinel-4",
      "sentinels": [
        { "host": "192.0.2.2", "port": 26379 },
        { "host": "192.0.2.3", "port": 26379 },
        { "host": "fd00:2::3", "port": 26379 }
      ],
      "sentinelName": "mymaster",
      "password": "<optional-redis-server-pw>",
      "sentinelPassword": "<optional-sentinel-pw>",
      "dbIndex": 0
    }
  ]
}
```

### Connect to redis server in cluster mode

To connect to a redis cluster two possible ways can be used

1. just define connection parameter to one cluster member with regular `--redis-*` configuration parameters and
   set the `--is-cluster` flag. The disadvance is that there is no fallback list of other cluster members for INITIAL
   connection if this member is not reachable. As soon as a connection is established the other cluster members are read
   by ioredis and used on reconnect.
```shell
$ redis-commander --host localhost --port 6579 --tls --is-cluster
```
   Connection definition within the config JSON file:
```json
{
  "connections": [
    {
      "label": "simple-redis-cluster",
      "host": "localhost",
      "port": 6379,
      "password": "<optional-redis-server-pw>",
      "dbIndex": 0,
      "isCluster": true
    },
```

2. Define a comma-separated list of multiple cluster members with "host:port" values on startup. Giving cluster members explicit 
   the "--is-cluster" flag is not needed.
```shell
$ redis-commander --clusters 192.0.2.2:6379:6379,192.0.2.3:6379 --tls
```
   Connection definition within the config JSON file. The syntax of the server list is the same as for Redis sentinel
   connections:
      1. pure comma separated string with "host:port" entries
      2. stringified json array
      3. array of strings
      4. array of objects

```json
{
  "connections": [
    {
      "label": "cluster-1",
      "clusters": "192.0.2.2:6379,192.0.2.3:6379",
      "password": "<optional-redis-server-pw>",
      "dbIndex": 0
    },
    {
      "label": "cluster-2",
      "clusters": "[192.0.2.2:6379, 192.0.2.3:6379]",
      "password": "<optional-redis-server-pw>",
      "dbIndex": 0
    },
    {
      "label": "cluster-3",
      "sentinels": [
        "192.0.2.2:6379",
        "192.0.2.3:6379"
      ],
      "password": "<optional-redis-server-pw>",
      "dbIndex": 0
    },
    {
      "label": "cluster-4",
      "sentinels": [
        { "host": "192.0.2.2", "port": 6379 },
        { "host": "192.0.2.3", "port": 6379 },
        { "host": "fd00:2::3", "port": 6379 }
      ],
      "password": "<optional-redis-server-pw>",
      "dbIndex": 0
    }
```

Independent on the way the cluster members are defined the TLS settings for Redis server are used for them, there
are no special Cluster-TLS settings available.

### Certificate Error [ERR_TLS_CERT_ALTNAME_INVALID] or "ClusterAllFailedError" for cluster connections

Connection to AWS MemoryDB with TLS secured routes might fail with the error `[ERR_TLS_CERT_ALTNAME_INVALID]`
or a more generic `ClusterAllFailedError: Failed to refresh slots cache`.

This happens for `ioredis` after connection to the main server node and trying to connect ot all other nodes of
the cluster where the name of the TLS certificate used is not the server ioredis connects too. And the IP address
of the node is also not part of the certificate, hence the `[ERR_TLS_CERT_ALTNAME_INVALID]`.

To fix this error the connection property `clusterNoTlsValidation=true` shall be set.

```json
{
  "connections": [
    {
      "label": "aws-memorydb",
      "host": "redis",
      "port": 6379,
      "tls": true, 
      "clusterNoTlsValidation": true
    }
  ]
}
```
Or on the command line to start the app or a docker container:

```shell
# local start of application from command line to MemoryDB
$ redis-commander --redis-host redis --redis-port 6379 --redis-tls --cluster-no-tls-validation ...
```

```shell
# running inside docker container
$ docker run -e REDIS_TLS=1 -e REDIS_HOST=redis -e REDIS_PORT=6379 -e CLUSTER_NO_TLS_VALIDATION=true ... ghcr.io/joeferner/redis-commander
```

_ATTENTION:_ The generic `ClusterAllFailedError` might have different reasons, e.g. initial connection to a node not allowed to
return IP addresses or names of other cluster nodes or similar. Therefor setting this connection properties does not
help every time. The "ioredis" `ClusterAllFailedError` often hides the real reason for this error. To check what might
be the real reason start Redis-Commander with the following NodeJS debug environment variable to see more output from "ioredis". 
Be warned: this will print the configured password to StdOut too!

```shell
$ export NODE_DEBUG="ioredis:*"
$ redis-commander --redis-host redis --redis-port 6379 --redis-tls
```
Setting the DEBUG env var for ioredis shows much more debig information diring ioredis trying to connect to the server
with some other helpful error message to solve the problem.


## Connection Parameters

The FIRST connection can be configured from the command line or via environment variables as listed below.

Configuring multiple connections either use the `--redis-hosts` (plural) cli param, `REDIS_HOSTS` env var inside docker or (much better)
configure them directly inside your own custom json config file.

*THE `--redis-...` / `--sentinel-...` COMMAND LINE PARAMS AND THE RESPECTIVE ENVIRONMENT VARIABLES WORK FOR THE FIRST CONNECITON ONLY!*

*The environment variables work for the docker image only, not for the stand-alone app!*

| Name                   | Type              | Default    | Cli                         | Environment-Var (Docker only) | Description                                                                                                                                                                                                                                                                                                                                                                      |
|------------------------|-------------------|------------|-----------------------------|------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| path                   | string            | ''         | --redis-socket              | REDIS_SOCKET                 | path to the redis server socket, e.g. '/var/run/redis/redis.sock'                                                                                                                                                                                                                                                                                                                |
| host                   | string            | localhost  | --redis-host                | REDIS_HOST                   | hostname or ipv4/ipv6 address of redis server (standalone mode)                                                                                                                                                                                                                                                                                                                  |
| port                   | number            | 6379       | --redis-port                | REDIS_PORT                   | port number where redis server listens (standalone mode)                                                                                                                                                                                                                                                                                                                         |
| username               | string            | ''         | --redis-username            | REDIS_USERNAME               | optional username of the redis server itself (socket, standalone, sentinel or cluster mode - supported since Redis 6.0)                                                                                                                                                                                                                                                          |
| password               | string            | ''         | --redis-password            | REDIS_PASSWORD               | optional password of the redis server itself (socket, standalone, sentinel or cluster mode)                                                                                                                                                                                                                                                                                      |
| label                  | string            | ''         | --redis-label               |                              | display label to us to identify this connection within the Web-UI                                                                                                                                                                                                                                                                                                                |
| db                     | number            | 0          | --redis-db                  | REDIS_DB                     | Number of database, starting with 0, max allowed db number is configured server-side (default 15)                                                                                                                                                                                                                                                                                |
| connectionName         | string            | ''         |                             |                              | use special connection name at this redis client to identify it with redis "CLIENT LIST" command. If not set default connection name from config param `redis.connectionName` is used                                                                                                                                                                                            |
| foldingChar            | string            | ''         |                             |                              | set connection specific value for the folding character, overwrites global config parameter 'ui.foldingChar'                                                                                                                                                                                                                                                                     |
| sentinels              | string or list    | ''         | --sentinels                 | SENTINELS                    | string: comma separated list of sentinels with "host:port" (sentinel mode) or list of "host:port" strings                                                                                                                                                                                                                                                                        |
| sentinelName           | string            | 'mymaster' | --sentinel-name             | SENTINEL_NAME                | name of redis database group to connect to via sentinel. The default name of 'mymaster' can be change via global redis configuration value 'redis.defaultSentinelGroup' (sentinel mode)                                                                                                                                                                                          |
| sentinelUsername       | string            |            | --sentinel-username         | SENTINEL_USERNAME            | optional username to connect to sentinels itself. This is not the username of the redis server (sentinel mode - supported since Redis 6.0)                                                                                                                                                                                                                                       |
| sentinelPassword       | string            |            | --sentinel-password         | SENTINEL_PASSWORD            | password to connect to sentinels itself. This is not the password of the redis server (sentinel mode)                                                                                                                                                                                                                                                                            |
| clusters               | string or list    | ''         | --clusters                  | CLUSTERS                     | string: comma separated list of cluster nodes with "host:port" (sentinel mode) or list of "host:port" strings                                                                                                                                                                                                                                                                    |
| isCluster              | boolean           | ''         | --is-cluster                | IS_CLUSTER                   | boolean flag to use the values from "host" and "port" for connection setup                                                                                                                                                                                                                                                                                                       |
| clusterNoTlsValidation | boolean           | false      | --cluster-no-tls-validation | CLUSTER_NO_TLS_VALIDATION    | booleanflag to disable TLS certifiacte checks for matching names. Needed e.g. for AWS MemoryDB cluster where certificate errors appear otherwise. This flag disdables TLS certificate validation only for auto-discovered direct cluster node access, not for the initial connection                                                                                             |
| insecureCertificate    | boolean           | false      | --insecure-certificate      | NODE_TLS_REJECT_UNAUTHORIZED | globaly dsable all certificate checks for this connection, This flag is insecure and should only used for test seups with self-signed certificates where it is not possible to set a custom server tls.caCert                                                                                                                                                                    |
| tls                    | boolean or object | false      | --redis-tls                 | REDIS_TLS                    | set to true to enable TLS secured connections to the redis server, for more specific configurations (allowed algorithms, server certificate checks and so on) this parameter can be an object directly use at Node tls sockets (https://github.com/luin/ioredis#tls-options)                                                                                                     |
| tls.caCert             | string            | ''         | --redis-tls-ca-cert         | REDIS_TLS_CA_CERT            | PEM encoded ca certificate used by the Redis server to verify the server certificate on connect. Using this parameter "redis-tls" must be set to "true" too                                                                                                                                                                                                                      |  
|                        | string            | ''         | --redis-tls-ca-cert-file    | REDIS_TLS_CA_CERT_FILE       | file name holding the PEM encoded server certificate from Redis to verify the server certificate on connect. The content of the file is read and overrides the tls.caCert connection parameter. Using this parameter "redis-tls" must be set to "true" too                                                                                                                       |  
| tls.cert               | string            | ''         | --redis-tls-cert            | REDIS_TLS_CERT               | PEM encoded client certificate for certificate based authentication if required by the Redis server. Using this parameter "redis-tls" must be set to "true" too                                                                                                                                                                                                                  |  
|                        | string            | ''         | --redis-tls-cert-file       | REDIS_TLS_CERT_FILE          | file name holding the PEM encoded client certificate requested by the Redis server for certificate based authentication. The content of the file is read and overrides the tls.cert connection parameter. Using this parameter "redis-tls" must be set to "true" too                                                                                                             |  
| tls.key                | string            | ''         | --redis-tls-key             | REDIS_TLS_KEY                | PEM encoded client certificate private key used for client authentication. Using this parameter "redis-tls" must be set to "true" too                                                                                                                                                                                                                                            |  
|                        | string            | ''         | --redis-tls-key-file        | REDIS_TLS_KEY_FILE           | file name holding the PEM encoded client certificate private key requested by the Redis server client authentication. The content of the file is read and overrides the tls.key connection parameter. Using this parameter "redis-tls" must be set to "true" too                                                                                                                 |  
| tls.servername         | string            | ''         | --redis-tls-server-name     | REDIS_TLS_SERVER_NAME        | FQDN used for SNI (server name indication) on connection to secured Redis server. Using this parameter "redis-tls" must be set to "true" too                                                                                                                                                                                                                                     |  
| sentinelTLS            | boolean or object | false      | --sentinel-tls              | SENTINEL_TLS                 | set to true to enable TLS secured connections to the sentinel, for more specific configurations (allowed algorithms, server certificate checks and so on) this parameter can be an object directly use at Node tls sockets (https://github.com/luin/ioredis#tls-options). If this value is a boolean the same TLS settings are reused as defined for the redis server connection. |
| sentinelTLS.caCert     | string            | ''         | --sentinel-tls-ca-cert      | SENTINEL_TLS_CA_CERT         | PEM encoded ca certificate used by the Sentinel server to verify the server certificate on connect. Using this parameter "sentinel-tls" must be set to "true" too                                                                                                                                                                                                                |  
|                        | string            | ''         | --sentinel-tls-ca-cert-file | SENTINEL_TLS_CA_CERT_FILE    | file name holding the PEM encoded server certificate from Sentinel to verify the server certificate on connect. The content of the file is read and overrides the sentinelTls.caCert connection parameter. Using this parameter "sentinel-tls" must be set to "true" too                                                                                                         |  
| sentinelTLS.cert       | string            | ''         | --sentinel-tls-cert         | SENTINEL_TLS_CERT            | PEM encoded client certificate for certificate based authentication if required by the Sentinel server. Using this parameter "sentinel-tls" must be set to "true" too                                                                                                                                                                                                            |  
|                        | string            | ''         | --sentinel-tls-cert-file    | SENTINEL_TLS_CERT_FILE       | file name holding the PEM encoded client certificate requested by the Sentinel server for certificate based authentication. The content of the file is read and overrides the sentinelTls.cert connection parameter. Using this parameter "sentinel-tls" must be set to "true" too                                                                                               |  
| sentinelTLS.key        | string            | ''         | --sentinel-tls-key          | SENTINEL_TLS_KEY             | PEM encoded client certificate private key used for client authentication. Using this parameter "sentinel-tls" must be set to "true" too                                                                                                                                                                                                                                         |  
|                        | string            | ''         | --sentinel-tls-key-file     | SENTINEL_TLS_KEY_FILE        | file name holding the PEM encoded client certificate private key requested by the Sentinel server client authentication. The content of the file is read and overrides the sentinelTls.key connection parameter. Using this parameter "sentinel-tls" must be set to "true" too                                                                                                   |  
| sentinelTLS.servername | string            | ''         | --sentinel-tls-server-name  | REDIS_TLS_SERVER_NAME        | FQDN used for SNI (server name indication) on connection to secured Redis server. Using this parameter "redis-tls" must be set to "true" too                                                                                                                                                                                                                                     |  
| optional               | boolean           | false      | --redis-optional            | REDIS_OPTIONAL               | set to true to not auto-reconnect on connection lost. Reconnect will be done if data are fetch from UI on user request                                                                                                                                                                                                                                                           |

## More complex configurations examples

### Configure TLS Support

Using docker container to start Redis Commander its only possible to connect to
one single Redis server with TLS activated. It is not possible to use the `REDIS_HOSTS`
env var to connect to multiple Redis servers where one or more are using TLS.

The most common TLS settings are made available as environment variables inside the 
docker container and as command line parameters (enable TLS, custom CA certificate and X.509 client authentication).

Attention: for TLS secured Sentinel connection `--sentinel-tls` must be set. If this falg is used as a boolean to just 
enable TLS the configuration reuses all TLS configurations done for Redis server for the Sentinel.
If this parameter contains an object the values from this object are used to create a custom TLS configuration 
for the Sentinel connections different from the one used to connect to the Redis server itself.

And using some special TLS configuration command line parameter or environment variables (on Docker) requires setting the
`--redis-tls` and/or '--sentinel-tls' config set. Without enabling TLS support for the respective connection the special 
parameter like custom CA certificate are ignored.

### Basic TLS usage

TLS must be enabled for Redis server and Sentinel independent of each other. The most simple use case is enable TLS support
without special CA certificates or client authentication:

```shell
# local start of application from command line
$ redis-commander --redis-tls --sentinel-tls ...
```

```shell
# running inside docker container
$ docker run -e REDIS_TLS=1 -e SENTINEL_TLS=1 ... ghcr.io/joeferner/redis-commander
```

### TLS with custom CA server certificates

Requiring a special CA certificate (e.g. not stored in systems default certificate store) on connection to Redis server.
Redis Sentinel is using the same CA certificate as the server does. The certificate is store in local file "cacert.pem".

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-ca-cert-file=cacert.pem --sentinel-tls ...
```

```shell
# running inside docker container
$ docker run -v "./cacert.pem:/tmp/cacert.pem" -e REDIS_TLS=1 -e REDIS_TLS_CA_CERT_FILE=/tmp/cacert.pem -e SENTINEL_TLS=1 ... ghcr.io/joeferner/redis-commander
```

And if content of the CA certificate file is stored inside an environment variable use env var "REDIS_TLS_CA_CERT"
instead.

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-ca-cert="${CA_CERT}" --sentinel-tls ...
```

If, for some reasons the Redis server and the Sentinel server use different CA certificates specify booth at the command line.
Here only cli example is given, Docker one is similar.

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-ca-cert-file=cacert.pem --sentinel-tls --sentinel-tls-ca-cert-file=othercacert.pem ...
```

### TLS certificate based client authentication

When booth Redis server and Redis sentinel require same client certificate, set the files with following parameters.
The public certificate part and the private certificate key must be stored in different files (e.g. clientCert.pem and clientKey.pem)

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-cert-file=clientCert.pem --redis-tls-key-file=clientKey.pem --sentinel-tls ...
```

Example for Redis server (clientCert.pem/clientKey.pem) and Sentinel server (sentinelCert.pem / sentinelKey.pem) with
different client certificates:

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-cert-file=clientCert.pem --redis-tls-key-file=clientKey.pem --sentinel-tls --sentinel-tls-cert-file=sentinelCert.pem --sentinel-tls-key-file=sentinelKey.pem ...
```

### Set SNI name for TLS secured connections

Booth Redis server TLS connection and Sentinel server TLS connection can set a special full qualified domain name to
use with server base SNI (Server Name Indication) to set up TLS with correct server certificate:

```shell
# local start of application from command line
$ redis-commander --redis-tls --redis-tls-server-name=redis.example.org --sentinel-tls --sentinel-tls-server-name=sentinel.example.org ...
```


### Connect to TLS secured Redis inside docker container (most flexible config)

Using docker container to start Redis Commander its only possible to connect to
one single Redis server with TLS activated. It is not possible to use the `REDIS_HOSTS`
env var to connect to multiple Redis servers where one or more are using TLS.

To support this scenario a custom redis configuration file must be created and 
mounted into the docker container. It does not matter if it is a real file, a docker config object
or (using Kubernetes) a configmap or secret to get file content from.

The following example assumes we want to connect to two different Redis servers,
booth using TLS with docker-compose. Using pure docker or Kubernetes instead follows the
same logic.

Important: Do not set the `REDIS_HOSTS` env var in this case, define all connections
needed inside the new config file.

Create a new config file (e.g. `myconnections.json`) with the following content:
```json
{
  "connections": [
    {
      "label": "first-db",
      "host": "redis",
      "port": 6379,
      "password": "pass-x",
      "dbIndex": 0,
      "tls": true
    },
    {
      "label": "second-db",
      "host": "redis1",
      "port": 6379,
      "password": "pass-y",
      "dbIndex": 0,
      "tls": true
    }
  ]
}
```
Additional new default parameters for Redis Commander like HTTP-Auth or read-only mode and so on
can be set here too if needed.

Now mount this file into the container as `/redis-commander/config/local-production.json`
(Attention if docker engine is remote, the json config file must be referenced absolute and available one the remote docker host at this path!)

```yaml
version: "3"
services:
  redis-commander:
    container_name: redis-commander
    hostname: redis-commander
    image: ghcr.io/joeferner/redis-commander:latest
    restart: always
    volumes:
      - ./myconnections.json:/redis-commander/config/local-production.json
    ports:
      - "8081:8081"
```

The file must be mounted read-write as all changes to the connection configurations (add or delete
servers via web-UI) will be saved inside this file too to persist changed across
docker container restarts.

If this file needs to be read-only mount it as `local.json` inside the container, e.g.:
```yaml
services:
  redis-commander:
    ...
    volumes:
      - ./myconnections.json:/redis-commander/config/local.json:ro
```

### DEVELOPMENT ONLY - disable all certificate checks

To disable all certificate checks (might be needed using self-signed certificate on test setup) either set the global
NodeJS runtime environment variable `NODE_TLS_REJECT_UNAUTHORIZED=1` or add the `--insecure-certificate` flag to the 
redis commander command-line parameter. Booth ways disable certificate checks and allow every certificate.

Attention - using this flag opens possibility for man-in-the-middle attacs with forged certificates!
