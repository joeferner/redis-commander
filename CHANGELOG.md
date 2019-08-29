# Redis-Commander CHANGELOG

## next Version
#### Enhancements
* add new docker env vars to load passwords from file (REDIS_PASSWORD_FILE, SENTINEL_PASSWORD_FILE), #364

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
