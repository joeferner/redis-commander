## SystemD Service Unit

template of service description to register redis-commander
as a systemd service unit.

### Installation

copy the `redis-commander.service` file to the `/etc/systemd/system/` directory
and modify it to fit the local installation of redis commander.

The following lines MUST be modified:

* "Environment" - add as many "Environment" lines as needed, one line per environment variable set
* "ExecStart" - update installation dir to match startup file inside local bin directory (`xxx/bin/redis-commander.js`)
* "User" - add name of unprivileged user to run redis commander under. Do not run this app as user "root"!

Now reload systemd as root to register this service unit:

`systemctl daemon-reload`

Service can now be started or stopped with:
* `systemctl start redis-commander`
* `systemctl stop redis-commander`
