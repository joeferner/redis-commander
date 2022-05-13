# Redis-Commander CHANGELOG

## Next Version
#### Bugfixes
#### Enhancements

## Version 0.8.0
#### Bugfixes
#### Enhancements
* update dependencies to fix security vulnerabilities in minimist, json-viewer, async, config, clipboard
* make url path of signin route configurable (config file and env var), #467
* add redis username and sentinel username support, #476
* update helm chart to allow setting redis username
* fix json display of big numbers not fitting into javascript "number" type, #400

## Version 0.7.3
#### Bugfixes
#### Enhancements
* minimum node version supported 12.x
* update ejs from 2.7.4 to 3.1.6
* update dependencies to fix vulnerabilities in async, tar, yargs, async, ejs, cached-path-relative
* add new import/export function with redis DUMP command and base64 encoded content to work around problems with
* update base image to Alpine 3.15 with NodeJS 16

## Version 0.7.2
#### Bugfixes
#### Enhancements
* update dependencies to fix vulnerabilities in async, tar, yargs, async, ejs, cached-path-relative
* update documentation regarding command line params and environment variables
* update kubernetes examples for seccomp/apparmor profile and not mounting service account token
* update helm chart for service accounts and account token mount
  multi-line redis values or some special data types and binary values

## Version 0.7.2
#### Bugfixes
#### Enhancements
* check for jwt token algorithms used to reject "none" algorithm 
* update dependencies to fix vulnerabilities in elliptic and some other
* add helper script to generated bcrypt password hash and allow setting http auth password hash from file inside docker, #434
* update base image to alpine:3.12
* switch from node-redis-dump to node-redis-dump2 and remove now obsolete docker build patch

## Version 0.7.1
#### Bugfixes
* update handling of big numbers displayed as json formatted values. For big numbers wrong values may be shown, #400 
* increase width of cli input to use full width available, #404 
* fix problem not setting sentinel password from command line, #416
* fix missing quotes for keys with a backslash, #421
* fix possible bug comparing sentinel connections
* block "monitor" at cli to not block redis connections, #424
* fix bug showing additional white spaces in edit hash popup, #426
* fix bug wih config validation for boolean values
* validate urlPrefix config param given for correct use of slashes (start+trailing), #419

#### Enhancements
* Adding maxHashFieldSize config to limit the size of hash fields, #409 (chrisregnier)
* set user in Dockerfile as numeric value to allow Kubernetes to enforce non-root user
* update Kubernetes examples with security settings for Redis Commander
* add config examples for starting Redis Commander with SystemD or PM2, #158
* allow flagging redis connection as optional, if true no permanant auto-reconnect is tried if server is down, reconnection done on request only, #230
* add basic helm chart for k8s installation, based on PR by @aabdennour, #412
* allow partial export of redis data
* add function to rename existing keys, #378
* update dependencies to fix vulnerabilities in multiple packages
* better handle special chars and spaces inside env vars given to docker container

## Version 0.7.0
#### Bugfixes
* fix error on Windows on getting package installation path, #388
* fix wrong connection info data shown on import and export page (sentinel and sockets)

#### Enhancements
* update dependencies to fix vulnerabilities in multiple packages
* change deprecated package "optimist" to "yargs" to fix prototype pollution in dependent minimist package
* add new route /sso to login with signed Json Web Token from external apps with a PSK

#### Breaking Change
* Base image changed from end-of-life Node-8 to pure Alpine 3.11, booth package managers (npm and yarn)
  are available but installed as system package now under different path (`/usr/bin`).
  This change is relevant only when this image is used as base image for other container.
     
## Version 0.6.7
#### Bugfixes
* do not display content of passwords read from env var or file on docker startup, #372
* fix display errors on early display of import/export page
* dependency updates for security fixes (elliptic) and change runtime umask to 027
* fix problem with sentinel connections without explict group name given, #381
* fix problem not showing all nodes after refresh (menu entry), #382

#### Enhancements
* add new docker env vars to load passwords from file (REDIS_PASSWORD_FILE, SENTINEL_PASSWORD_FILE), #364
* add docker image HEALTHCHECK command
* add basic support to display redis string values as hex values, #140
* add basic support to display ReJSON type data, #371
* switch library to display json objects from "json-tree" to "jquery.json-viewer", #375
* add config value and env var to display valid json data as default as formatted json tree object (VIEW_JSON_DEFAULT), #375  
* add config value and env var to disable display of strings as hexadecimal binary data (BINARY_AS_HEX), #376
* add basic validation to redis connection params given via command line and config files, #377
* allow docker image security scanner to work even if apk related files are removed
* add json formatted view to List, Set and SortedSet elements too

## Version 0.6.6
#### Bugfixes
* fix display bug for keys starting with configured foldingchar, #355
* fix bug where cli params do not overwrite other config params, #354
* fix handling of some special chars inside env vars at docker startup script
* disable MULTI command via redis cli to prevent crashes, #358
* fix double html encoding of key data, #362

#### Enhancements
* dependencies updated to fix security problems
* add valid url on startup to access redis commander via browser
* improve console log message for redis connection errors
* add dialog for auto-detection of used redis databases, #121
* change api content-type of methods to "application/json" and move arrays returned down into json object "data" property

## Version 0.6.5
#### Bugfixes
* fix display of keys having multiple consecutive folding chars, #342
* fix connection id handling for node >= 10.x, #270
* fix setting initial ui.locked, cliOpen and height from config file

#### Enhancements
* add redis stream support (display, add, delete), thanks to Adrian Oanca and vflopes
* fix redis sentinel connection handling and make it configurable via config file too
* allow configuration of max allowed request body size via env var or config file, #352
* add json view to hash sets
* improve logging if run behind http reverse proxy like nginx, add config setting and env var, #348
* some ui improvements
* some dependencies updated to fix security problems
* improve documentation

## Version 0.6.4
#### Bugfixes
* fix redis connections via unix sockets, #270
* build redis server command list dynamically to allow usage of all new redis commands via cli (read-write and read-only mode), #210
#### Enhancements
* some ui improvements
* some dependencies updated to fix security problems

## Version 0.6.3
