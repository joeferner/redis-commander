# Redis Commander - Connection Configuration

This file describes all parameters available to configure
connections to redis servers. All connection objects are
stored inside the top-level `connections` list.

## Storing Connection informations

The default set of connrections to start redis commander with
can be defined inside the `local.json` file (for example).
Whenever a connection is added via Web-UI or command line 
a new file `local-<node_env>.json` is created to store the
new list of all connections currently used. This is done to
persist new configuration data over app restarts. To reset the
list to your "original" start, just delete  

Attention - list object are not merged between all config files.
The latest definition of the list is used. E.G. a redefinition
of the `connections` list object inside the `local-<node_env>.json`
overwrites all connections defined inside `<node-env>.json` or
`local.json`.

### Connect via Unix-Socket

Only the "path" parameter is needed with the path to the unix socket to use. 
Parameter "host", "port" and all "sentinel*" should not be set.

TODO config examples

### Connect to normal standalone redis server

"host" and "port" are needed.
Do not set "path" or one of the "sentinel*" parameter as they have precedence 
over "host" and "port"!

TODO config examples
 
### Connect to redis server via redis sentinel

Parameter "sentinels" contains a list of one or more Redis sentinels
used for connection. For better failover handling at least two sentinels
should be provided to allow connections if one of them is temporarily not available.

If sentinels needs authentication (not auth from redis server itself but sentinel)
the password must be set as "sentinelPassword".
Another optional parameter is "sentinelName".

Parameter "path", "host" and "port" are ignored.

TODO config examples

### Connect to redis server in cluster mode

This connection mode is currently not support (PR welcome)
For guidance just as at one of the cluster support tickets.

## Connection Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| path | string | '' | path to the redis server socket, e.g. '/var/run/redis/redis.sock' |
| host | string | localhost | hostname or ip address of redis server (standalone mode)|
| port | number | 6379 | port number where redis server listens (standalone mode) |
| password | string | '' | optional password of the redis server itself (socket, standalone, sentinel or cluster mode) |
| sentinels | string or list | '' | string: comma separated list of sentinels with "host:port" (sentinel mode) |
| sentinelName | string | 'mymaster' | name of redis database group to connect to via sentinel (sentinel mode) |
| sentinelPassword | string |  | password to connect to sentinels itself. This is not the password of the redis server (sentinel mode) |
| db | number | 0 | Number of database, starting with 0, max allowed db number is configured server-side (default 15) |
| connectionName | string | '' | use special connection name at this redis client to identify it with redis "CLIENT LIST" command. If not set default connection name from config param `redis.connectionName` is used |
| tls | boolean or object | false | set to true to enable TLS secured connections to the redis server, for more specific configurations (allowed algorithms, server certificate checks and so on) this parameter can be an object directly use at Node tls sockets (https://github.com/luin/ioredis#tls-options) |
| label | string | '' | display label to us to identify this connection within the Web-UI |
