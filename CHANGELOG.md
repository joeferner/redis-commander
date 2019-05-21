# Redis-Commander CHANGELOG

## next Version

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
