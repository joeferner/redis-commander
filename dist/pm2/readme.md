This directory contains an configuration template for the PM2 process monitor
to start node apps and monitor them with automatic restart if something 
goes wrong.

For more information see here: https://pm2.io/runtime/

The following fields should be updated to fit the local installation of redis commander:
* "cwd" - installation directory of redis commander
* "env" - add all environment variables needed to start redis commander
* "args" - add arguments as needed

The app can be registered at pm2 with the command:

`pm2 deploy /path/to/custom/pm2-config.json`

For running with pm2 either use this config file template adapted to your needs or the
`ecosystem.config.js` file from the applications base directory  
