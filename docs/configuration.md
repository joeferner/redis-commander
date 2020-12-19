# Redis Commander - Configuration

This file describes all parameters settable at the
configuration files inside the `config` folder.

Redis Commander uses the node "config" module (https://github.com/lorenwest/node-config)
More information about possible file formats and config file names
as well as there evaluation order can be found in the wiki of the node-config
project.

## Configuration data

### 1. General Parameter

All top-level configuration data are

| Name | Type | Default | Description |
|---|---|---|---|
| noSave | boolean | false | do not persist changes in active connection list  |
| noLogData | boolean | false | do not log values of redis keys to console |
| ui | object |  | see section 2. User interface parameter|
| redis | object |  | see section 3. General Redis connection parameter |
| server | object |  | see section 4. Express HTTP Server parameter |
| connections | list | [] | see section 5. Redis Connections |


### 2. User interface parameter

The `ui` object contains configuration values regarding the web user
interface of Redis Commander.

| Name | Type | Default | Description |
|---|---|---|---|
| ui.sidebarWidth |number | 250 | start width in pixel of the tree view on the left side of the ui. |
| ui.locked | boolean | false | if "true" do not change height of command line, otherwise increase height if cli is active |
| ui.cliHeight | number | 320 | start height in pixel of the command line at the bottom (if opened) |
| ui.cliOpen | boolean | false | start with maximized cli height on "true", with minimized one on "false" |
| ui.foldingChar | string | ':' | character to use for creation of a virtual hierarchical tree of all keys. e.g key 'top/sub/mykey' is divided into a folder 'top' containing the folder 'sub' with the key 'mykey' inside it. |
| ui.jsonViewAsDefault | string list | 'none' | comma separated list of data types where valid json data should be displayed as JSON tree object instead of plain string. Default '' or 'none' displays no data as string, 'all' displays all data-types supported as JSON objects.<br>Example: "string,hash" only displays these two types as JSON if possible per default<br>Values supported: '', 'none', 'all', 'string', 'list', 'set', 'zset', 'hash'
| ui.binaryAsHex | boolean | true | do not display binary data as string but in hexadecimal view |
| ui.maxHashFieldSize | number | 0 | The max number of bytes for a hash field before you must click to view it. Defaults to 0, which is disabled

### 3. General Redis connection parameter

| Name | Type | Default | Description |
|---|---|---|---|
| redis.readOnly | boolean | false | use Redis Commander in read-only mode - if set to "true" no commands modifying data are allowed (ui and command line) |
| redis.flushOnImport | boolean | false | flag to either check "flush" checkbox (true) on import page or uncheck (false) it. If "true" the entire database is flushed before bulk importing the data. |
| redis.useScan | boolean | true | use redis "SCAN" command instead of "KEYS" to enumerate all keys inside db for display |
| redis.scanCount | number | 100 | number of keys read when using SCAN cursor instead of KEYS (useScan must be true) |
| redis.rootPattern | string | '*' | filter pattern to use at start, can be used to exclude some date inside redis db |
| redis.connectionName | string | 'redis-commander' | connection name to set at redis client for easier identification of clients at redis server (command "client list") |
| redis.defaultLabel | string | 'local' | default label to display for a connection if no label is specified (e.g. for connection from env vars or command line) |
| redis.defaultSentinelGroup | string | 'mymaster' | default redis database group if using sentinels to connect and no special database group via connection param 'sentinelName' is given. |

### 4. Express HTTP Server parameter

| Name | Type | Default | Description |
|---|---|---|---|
| server.address | string | '0.0.0.0' | ip address of interface to bind http server to, use 0.0.0.0 to bind to all interfaces |
| server.port | number | 8081 | port to listen on for HTTP server |
| server.urlPrefix | string | '' | path prefix to run Redis Commander at, can be used if run behind a reverse proxy with different path set (e.g. /rc), if set must start with '/' |
| server.trustProxy | boolean or string | false | should be set to true if run behind a reverse proxy and 'X-Forwarded-For' headers shall be trusted to get real client ip for logging, this parameter maps directly to the Express "trust proxy" setting (https://expressjs.com/de/guide/behind-proxies.html)|
| server.clientMaxBodySize | number or string | '100kb' | number in bytes or a string with size and SI-unit, this parameter maps to the "limit" options of body-parser (https://github.com/expressjs/body-parser#limit) |
| server.auth | object |  | see section 4.1 Authentication  |

#### 4.1 Authentication configuration for HTTP server

To enable HTTP authentication inside Redis Commander set a username
and either a password (clear text) or a passwordHash.

If username is empty Redis Commander does not use any authentication leaving
all your redis keys accessible to anyone. This mode may be used
if a HTTP reverse proxy in front of Redis commander performs
the user authentication.

Please be aware that using an HTTP reverse proxy for authentication and
not using Redis Commander builtin auth allows (at least) all users having
accounts on the server running Redis Commander to connect via localhost directly
to via app port (e.g. 8081) unauthenticated!

| Name | Type | Default | Description |
|---|---|---|---|
| server.httpAuth.username | string | '' | set a username and either password or passwordHash to |
| server.httpAuth.password | string | '' | clear text password to use for HTTP Basic auth (either password or passwordHash allowed) |
| server.httpAuth.passwordHash | string | '' | password hash to use for HTTP Basic auth (either password or passwordHash allowed) |
| server.httpAuth.jwtSecret | string | '' | Shared Secret used to sign JWT tokens for all future requests after initial login to not send HTTP basic auth header on all requests. If this value is empty a random value is generated on every startup. |


### 5. Redis Connections

All Connections use be redis commander are defined as
entries of the "connections" list. The possible
values for a connection are described in the [connections.md]()
file.

## Environment Variables

All possible environment variables with their mapping
to configuration data are defined inside the file
[custom-environment-variables.json](../config/custom-environment-variables.json).
This file can be extended if there is any need to define
more environment variables for custom config data like
connection configs.
