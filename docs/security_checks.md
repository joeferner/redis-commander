# Security Considerations

Some points to check for a secure usage of this image.
Some of these are more general, some are relevant only using redis commander
as container (marked with "Docker" below but relevant for Kubernetes and similiar too)

### Use Authentication for Web-Access

per Default Redis Commander does not active HTTP authentication - everyone being able
to access the web frontend can do whatever he likes to your redis databases configure
(read: DELETE all keys or modify as he likes)

Redis Commander does not has a full blown user manangement, only basic support for 
authentication. No external user store like LDAP or similiar is possible.
(If such feature is required please create an issue to discuss implementation before posting a Pull Request)

#### a) HTTP Basic authentication
One user account (username/password) can be configured to protect the web page.
This account has full rights on the database (as much as redis server allows).
* command line: `--http-user <username>` and `--http-pass <password>`
* environment variables: `HTTP_USER` and `HTTP_PASSWORD` or `HTTP_PASSWORD_HASH`
* config file: `server.httpAuth.username` and `server.httpAuth.password` or `server.httpAuth.passwordHash`
Booth values must be given (username and either password or password hash)

the passwords can be given as the content of files too for the docker container. Just set the env vars
`HTTP_PASSWORD_FILE` or `HTTP_PASSWORD_HASH_FILE` to the name of the files containing the passwords/hash.
 
#### b) SSO login via JSON Web Token (JWT)
Alternative authentication of different users can be transfered to other web apps 
which generate a JSON web token (see RFC ) that is given when calling redis commander.
The url to call for this SSO feature is `https://<ip>:<port>/sso` with the JWT token send as parameter `access_token`
either via HTTP GET or HTTP POST:

example: `HTTP GET https://<ip>:<port>/sso?access_token=dfgfdg.token...`

The parameters to validate the jwt are configured in the config file below the 
`sso` config object. Currently only JWT signing with a shared secret is supported. 
Alternative configuration can be done via environment variables: `SSO_ENABLED`,
`SSO_JWT_SECRET`, `SSO_ISSUER`, `SSO_AUDIENCE`, `SSO_SUBJECT`.

SSO JWT login must be enabled explicitly within the configuration and all values to check the 
token validity for should be set. SSO JWT login is disabled as default.
 
### Use TLS 
Redis commander does not support TLS encryption out-of-the box. To add TLS encryption
a reverse proxy like NGinx, Apache, Traefik or similiar with working HTTPS setup must
be put in front of Redis Commander to handle the HTTP encryption.
Only if used from localhost alone TLS encryption may be dropped.

### Use Read-Only Mode if possible
The default setup of Redis Commander allows read-write access to the redis databases.
With a confg switch it is possible to start redis-commander in read-only mode and disallow
all redis commands that do modify data.

Configuration parameters:
* command line: `--read-only`
* environment variable: `READ_ONLY`
* config file: `redis.readOnly`

If read-only as well as read-write access via Redis Commander is needed
it is possible to start two instances of this app, one normal and ane with read-only mode
enabled.

Technical info how this is implemented:
* After database connect the `command` command is issued to the server and the list returned
is parsed for read-only commands that will be allowed (see redis doc: https://redis.io/commands/command).
Due to this redis servers with custom plugins should work as expected too.
* If `command` execution failes a hard-coded whitelist of commands allowed is used 
(file `lib/redisCommands/redisCore.js` all lists starting with `_readCmds...`)

### Remove all Package Manager (Docker)
Whenever the image is final and no modifications during container runtime to install or update 
software are needed (should be the case!) all package managers can be removed final step of the 
container image build.

For production usage this image should be build by yourself and stored in a trusted registry.
For the build the docker build-arg `REMOVE_APK=1` should be set - this deletes all package
managers (apk, npm, yarn) at the end of the build before finalizing the image.

The image published on Dockerhub does not remove package manager to allow others 
to create new iages based on this one (`REMOVE_APK=0`).

### Do not run image as root (Docker)
Current image is build to run as a unprivileged user and not as root.

### Set passwords as secrets (Docker)
Do not set passwords (http auth, redis server, ...) as normal command line parameter (even if supported)
but either use custom config files with correct file protection modes or set them
as Kubernetes Secrets / Docker Secrets.

An alternative is mounting files (with restrictive permissions on them) into the container which
where the passwords is stored in. The name o f the files can be set via docker image environment variables
`HTTP_PASSWORD_FILE`, `HTTP_PASSWORD_HASH_FILE`, `REDIS_PASSWORD_FILE` and `SENTINEL_PASSWORD_FILE`.
