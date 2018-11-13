#!/usr/bin/env node

'use strict';

let optimist = require('optimist');
let Redis = require('ioredis');
let myUtils = require('../lib/util');
let app = require('../lib/app');

let redisConnections = [];

let args = optimist
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
  .options('redis-label', {
    string: true,
    describe: 'The label to display for the connection.',
    default: 'local'
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
  .options('url-prefix', {
    alias: 'u',
    string: true,
    describe: 'The url prefix to respond on.',
    default: ''
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
    describe: 'clear configuration file.'
  })
  .options('root-pattern', {
      alias: 'rp',
      boolean: false,
      describe: 'default root pattern for redis keys.',
      default: '*'
  })
  .options('use-scan', {
      alias: 'sc',
      boolean: true,
      default: false,
      describe: 'Use SCAN instead of KEYS.'
  })
  .options('scan-count', {
      boolean: false,
      default: 100,
      describe: 'The size of each seperate scan.'
  })
  .options('no-log-data', {
    // through no-  this is a negated param, if set args[log-data]=true
    // internal handling of optimist is diffferent to nosave (without "-")
    boolean: true,
    default: false,
    describe: 'Do not log data values from redis store.'
  })
  .options('folding-char', {
    alias: 'fc',
    boolean: false,
    describe: 'Character to fold keys at for tree view.',
    default: ':'
  })
  .check(function(value) {
      switch (value['folding-char']) {
        case '&':
        case '?':
        case '*':
          throw new Error('Characters &, ? and * are invalid for param folding-char!');
      }
  })
  .argv;

if (args.help) {
  optimist.showHelp();
  return process.exit(-1);
}

if (args['use-scan']) {
  console.log('Using scan instead of keys');
  Object.defineProperty(Redis.prototype, 'keys', {
    value: function(pattern, cb) {
      let keys = [];
      let that = this;
      let scanCB = function(err, res) {
        if (err) {
          cb(err);
        } else {
          let count = res[0], curKeys = res[1];
	      console.log("scanning: " + count + ": " + curKeys.length);
          keys = keys.concat(curKeys);
          if (Number(count) === 0) {
            cb(null, keys);
          } else {
            that.scan(count, 'MATCH', pattern, 'COUNT', args['scan-count'], scanCB);
          }
        }
      };
      return this.scan(0, 'MATCH', pattern, 'COUNT', args['scan-count'], scanCB);
    }
  });
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
    config = myUtils.defaultConfig();
  }
  if (!config.default_connections) {
    config.default_connections = [];
  }
  startDefaultConnections(config.default_connections, function (err) {
    if (err) {
      console.log(err);
      process.exit();
    }
    let db = parseInt(args['redis-db']);
    if (isNaN(db)) {
        db = 0;
    }

    let client;
    if (args['sentinel-host'] || args['redis-host'] || args['redis-port'] || args['redis-socket'] || args['redis-password']) {
      let newDefault = {
        "label": args['redis-label'] || "local",
        "host": args['redis-host'] || "localhost",
        "sentinel_host": args['sentinel-host'],
        "sentinel_port": args['sentinel-port'],
        "port": args['redis-port'] || args['redis-socket'] || "6379",
        "dbIndex": db,
        "password": args['redis-password'] || '',
        "connectionName": "redis-commander"
      };

      if (!myUtils.containsConnection(config.default_connections, newDefault)) {
        if (newDefault.sentinel_host) {
          client = new Redis({
            showFriendlyErrorStack: true,
            sentinels: [{host: newDefault.sentinel_host, port: newDefault.sentinel_port}],
            password: newDefault.password,
            name: 'mymaster',
            connectionName: newDefault.connectionName
          });
        } else {
          client = new Redis({
            port: newDefault.port,
            host: newDefault.host,
            family: 4,
            password: newDefault.password,
            db: newDefault.dbIndex,
            connectionName: newDefault.connectionName
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
    } else if (config.default_connections.length === 0) {
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
      if (!myUtils.containsConnection(redisConnections.map(function(c) {return c.options}), connection)) {
        let client = new Redis({
          port: connection.port,
          host: connection.host,
          family: 4,
          password: connection.password,
          db: connection.dbIndex,
          connectionName: "redis-commander"
        });
        client.label = connection.label;
        redisConnections.push(client);
        setUpConnection(client, connection.dbIndex);
      }
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
  let urlPrefix = args['url-prefix'];
  let httpServerOptions = {username: args["http-auth-username"], password: args["http-auth-password"], passwordHash: args["http-auth-password-hash"], urlPrefix };
  if (args['save']) {
    args['nosave'] = false;
  }
  if (urlPrefix && !urlPrefix.startsWith('/')) {
    console.log("url-prefix must begin with leading '/'");
    process.exit();
  }
  console.log("No Save: " + args["nosave"]);
  let appOptions = {
    noSave: args["nosave"],
    rootPattern: args['root-pattern'],
    noLogData: (args['log-data']===false),
    foldingChar: args['folding-char']
  };
  let appInstance = app(httpServerOptions, redisConnections, appOptions);

  appInstance.listen(args.port, args.address, function() {
    console.log("listening on ", args.address, ":", args.port);
    if (urlPrefix) {
      console.log(`using url prefix ${urlPrefix}/`);
    }
  });
}
