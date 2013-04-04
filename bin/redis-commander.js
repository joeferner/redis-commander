#!/usr/bin/env node

var optimist = require('optimist');
var redis = require('redis');
var app = require('../lib/app');
var fs = require('fs');
var myUtils = require('../lib/util');

var redisConnections = [];
redisConnections.getLast = myUtils.getLast;

var args = optimist
  .alias('h', 'help')
  .alias('h', '?')
  .options('redis-port', {
    string: true,
    describe: 'The port to find redis on.'
  })
  .options('redis-host', {
    string: true,
    describe: 'The host to find redis on.'
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
  .options('port', {
    alias: 'p',
    string: true,
    describe: 'The port to run the server on.',
    default: 8081
  })
  .argv;

if (args.help) {
  optimist.showHelp();
  return process.exit(-1);
}

myUtils.getConfig(function (err, config) {
  if (err) {
    console.log("No config found.\nUsing default configuration.");
    config = {
      "sidebarWidth": 250,
      "locked": false,
      "CLIHeight": 50,
      "CLIOpen": false,
      "default_connections": []
    };
  }
  startDefaultConnections(config.default_connections, function (err) {
    if (err) {
      console.log(err);
      process.exit();
    }
    if (args['redis-host']) {
      var db = parseInt(args['redis-db']);
      if (db == null || isNaN(db)) {
        db = 0
      }
      newDefault = {
        "host": args['redis-host'],
        "port": args['redis-port'] || 6379,
        "password": args['redis-password'] || "",
        "dbIndex": db
      };
      if (!myUtils.containsConnection(config.default_connections, newDefault)) {
        redisConnections.push(redis.createClient(args['redis-port'] || 6379, args['redis-host']));
        if (args['redis-password']) {
          redisConnections.getLast().auth(args['redis-password'], function (err) {
            if (err) {
              console.log(err);
              process.exit();
            }
          });
        }
        config.default_connections.push(newDefault);
        myUtils.saveConfig(config, function (err) {
          if (err) {
            console.log("Problem saving config.");
            console.error(err);
          }
        });
        setUpConnection(redisConnections.getLast(), db);
      }
    } else if (config.default_connections.length == 0) {
      redisConnections.push(redis.createClient());
      setUpConnection(redisConnections.getLast(), 0);
    }
  });
  return startWebApp();
});

function startDefaultConnections (connections, callback) {
  connections.forEach(function (connection) {
    redisConnections.push(redis.createClient(connection.port, connection.host));
    if (connection.password) {
      redisConnections.getLast().auth(connection.password, function (err) {
        if (err) {
          return callback(err);
        }
      });
    }
    setUpConnection(redisConnections.getLast(), connection.dbIndex);
  });
  return callback(null);
}

function setUpConnection (redisConnection, db) {
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
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
    console.log("Redis Connection " + redisConnection.host + ":" + redisConnection.port + " Using Redis DB #" + db);
  });
}

function startWebApp () {
  httpServerOptions = {webPort: args.port, username: args["http-auth-username"], password: args["http-auth-password"]};
  app(httpServerOptions, redisConnections);
}