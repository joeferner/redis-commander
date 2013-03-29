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
  --redis-port                    The port to find redis on.        [string]  [default: 6379]
  --redis-host                    The host to find redis on.        [string]
  --redis-socket                  The unix-socket to find redis on. [string]
  --redis-password                The redis password.               [string]
  --redis-db                      The redis database.               [string]
  --http-auth-username, --http-u  The http authorisation username.  [string]
  --http-auth-password, --http-p  The http authorisation password.  [string]
  --port, -p                      The port to run the server on.    [string]  [default: 8081]
  --auto-reconnect, -a            Optional; Attempt to reconnect.   [boolean]
```
