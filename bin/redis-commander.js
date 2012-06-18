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

var redisConnection;
if (args['redis-host']) {
  redisConnection = redis.createClient(args['redis-port'], args['redis-host']);
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
    process.exit(-1);
  });
  redisConnection.on("connect", startWebApp);
} else {
  startWebApp();
}

function startWebApp() {
  app(args.port, redisConnection);
}
