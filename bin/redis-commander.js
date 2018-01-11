#!/usr/bin/env node

var optimist = require('optimist');
var Redis = require('ioredis');
var app = require('../lib/app');
var fs = require('fs');
var myUtils = require('../lib/util');

var redisConnections = [];

var args = optimist
  .alias('h', 'help')
  .alias('h', '?')
  .options('redis-port', {
    string: true,
    describe: 'The port to find redis on.'
  })
  .options('sentinel-port', {
    string: true,
    describe: 'The port to find sentinel on.'
  })
  .options('redis-host', {
    string: true,
    describe: 'The host to find redis on.'
  })
  .options('sentinel-host', {
    string: true,
    describe: 'The host to find sentinel on.'
  })
  .options('redis-socket', {
    string: true,
    describe: 'The unix-socket to find redis on.'
  })
  .options('redis-password', {
    string: true,
    describe: 'The redis password.'
  })
  .options('redis-db', {
    string: true,
    describe: 'The redis database.'
  })
  .options('http-auth-username', {
    alias: "http-u",
    string: true,
    describe: 'The http authorisation username.'
  })
  .options('http-auth-password', {
    alias: "http-p",
    string: true,
    describe: 'The http authorisation password.'
  })
  .options('http-auth-password-hash', {
    alias: "http-h",
    string: true,
    describe: 'The http authorisation password hash.'
  })
  .options('address', {
    alias: 'a',
    string: true,
    describe: 'The address to run the server on.',
    default: "0.0.0.0"
  })
  .options('port', {
    alias: 'p',
    string: true,
    describe: 'The port to run the server on.',
    default: 8081
  })
  .options('nosave', {
    alias: 'ns',
    boolean: true,
    describe: 'Do not save new connections to config.',
    default: false
  })
  .options('noload', {
    alias: 'nl',
    boolean: true,
    describe: 'Do not load connections from config.'
  })
  .options('clear-config', {
    alias: 'cc',
    boolean: false,
    describe: 'clear configuration file'
  })
  .options('root-pattern', {
      alias: 'rp',
      boolean: false,
      describe: 'default root pattern for redis keys',
      default: '*'
  })
  .argv;

if (args.help) {
  optimist.showHelp();
  return process.exit(-1);
}


if(args['clear-config']) {
  myUtils.deleteConfig(function(err) {
    if (err) {
      console.log("Failed to delete existing config file.");
    }
  });
}

myUtils.getConfig(function (err, config) {
  if (err) {
    console.dir(err);
    console.log("No config found or was invalid.\nUsing default configuration.");
    config = {
      "sidebarWidth": 250,
      "locked": false,
      "CLIHeight": 50,
      "CLIOpen": false,
      "default_connections": []
    };
  }
  if (!config.default_connections) {
    config.default_connections = [];
  }
  startDefaultConnections(config.default_connections, function (err) {
    if (err) {
      console.log(err);
      process.exit();
    }
    if (args['sentinel-host'] || args['redis-host'] || args['redis-port'] || args['redis-socket'] || args['redis-password']) {
      var db = parseInt(args['redis-db']);
      if (!db) {
        db = 0;
      }

      newDefault = {
        "label": args['redis-label'] || "local",
        "host": args['redis-host'] || "localhost",
        "sentinel_host": args['sentinel-host'],
        "sentinel_port": args['sentinel-port'],
        "port": args['redis-port'] || args['redis-socket'] || "6379",
        "dbIndex": db,
        "password": args['redis-password'] || '',
      };

      if (!myUtils.containsConnection(config.default_connections, newDefault)) {
        var client;
        if (newDefault.sentinel_host) {
          client = new Redis({
            showFriendlyErrorStack: true,
            sentinels: [{host: newDefault.sentinel_host, port: newDefault.sentinel_port}],
            password: newDefault.password,
            name: 'mymaster'
          });
        } else {
          client = new Redis({
            port: newDefault.port,
            host: newDefault.host,
            family: 4,
            password: newDefault.password,
            db: newDefault.dbIndex
          });
        }
        client.label = newDefault.label;
        redisConnections.push(client);
        config.default_connections.push(newDefault);
        if (!args.nosave) {
          myUtils.saveConfig(config, function (err) {
            if (err) {
              console.log("Problem saving config.");
              console.error(err);
            }
          });
        }
        setUpConnection(client, db);
      }
    } else if (config.default_connections.length == 0) {
      var db = parseInt(args['redis-db']);
      if (!db) {
        db = 0
      }
      client = new Redis();
      client.label = args['redis-label'] || "local";
      
      redisConnections.push(client);
      setUpConnection(client, db);
    }
  });
  return startWebApp();
});

function startDefaultConnections (connections, callback) {
  if (connections) {
    connections.forEach(function (connection) {
      var client = new Redis({
        port: connection.port,
        host: connection.host,
        family: 4,
        password: connection.password,
        dbIndex: connection.dbIndex
      });
      client.label = connection.label;
      redisConnections.push(client);
      setUpConnection(client, connection.dbIndex);
    });
  }
  return callback(null);
}

function setUpConnection (redisConnection, db) {
  redisConnection.on("error", function (err) {
    console.error("setUpConnection Redis error", err.stack);
  });
  redisConnection.on("end", function () {
    console.log("Connection closed. Attempting to Reconnect...");
  });
  redisConnection.once("connect", connectToDB.bind(this, redisConnection, db));
}

function connectToDB (redisConnection, db) {
  redisConnection.select(db, function (err) {
    if (err) {
      console.log(err);
      process.exit();
    }
    console.log("Redis Connection " + redisConnection.options.host + ":" + redisConnection.options.port + " Using Redis DB #" + redisConnection.options.db);
  });
}

function startWebApp () {
  httpServerOptions = {username: args["http-auth-username"], password: args["http-auth-password"], passwordHash: args["http-auth-password-hash"]};
  console.log("No Save: " + args["nosave"]);
  var appInstance = app(httpServerOptions, redisConnections, args["nosave"], args['root-pattern']);

  appInstance.listen(args.port, args.address);
  console.log("listening on ", args.address, ":", args.port);
}
