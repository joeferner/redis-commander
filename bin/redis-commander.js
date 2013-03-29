#!/usr/bin/env node

var optimist = require('optimist');
var redis = require('redis');
var app = require('../lib/app');

var args = optimist
  .alias('h', 'help')
  .alias('h', '?')
  .options('redis-port', {
    string: true,
    describe: 'The port to find redis on.',
    default: 6379
  })
  .options('redis-host', {
    string: true,
    describe: 'The host to find redis on.'
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
    describe: 'The redis database.',
    default: 0
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
  .options('auto-reconnect', {
    alias: 'a',
    boolean: true,
    describe: 'Attempts to reconnect to the redis database in the event of a disconnection.'
  })
  .argv;

if (args.help) {
  optimist.showHelp();
  return process.exit(-1);
}

var redisConnection;
if (args['redis-host']) {
  redisConnection = redis.createClient(args['redis-port'], args['redis-host']);
  if (args['redis-password']) {
    redisConnection.auth(args['redis-password'], function(err) {
      if (err) {
        console.log(err);
        process.exit();
      }
    });
  }
} else if(args['redis-socket']) {
  redisConnection = redis.createClient(args['redis-socket']);
} else {
  redisConnection = redis.createClient();
}
if (args['auto-reconnect']) {
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
  });
  redisConnection.on("end", function (blah) {
    console.log("Connection closed. Attempting to Reconnect...");
  });
  redisConnection.once("connect", connectToDB);

} else {
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
    process.exit(-1);
  });
  redisConnection.on("end", function (blah) {
    console.log("connection closed");
  });
  redisConnection.once("connect", connectToDB);
}


function connectToDB() {
  var db = parseInt(args['redis-db']);
  if (db == null || isNaN(db)) {
    db = 0
  }
  redisConnection.select(db, function(err, res) {
    if (err) {
      console.log(err);
      process.exit();
    }
    console.log("Using Redis DB #" + db);
    startWebApp();
  });
}

function startWebApp() {
  httpServerOptions = {webPort: args.port, username: args["http-auth-username"], password: args["http-auth-password"]}
  app(httpServerOptions, redisConnection);
}
