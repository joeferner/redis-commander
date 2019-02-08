#!/usr/bin/env node

'use strict';

let optimist = require('optimist');
let Redis = require('ioredis');
let myUtils = require('../lib/util');

// fix the cwd to project base dir for browserify and config loading
let path = require('path');
process.chdir( path.join(__dirname, '..') );

process.env.ALLOW_CONFIG_MUTATIONS = true;
let config = require('config');

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
  .options('sentinel-port', {
    string: true,
    describe: 'The port to find sentinel on.'
  })
  .options('sentinel-host', {
    string: true,
    describe: 'The host to find sentinel on.'
  })
  .options('redis-tls', {
    boolean: true,
    describe: 'Use TLS for connection to redis server.',
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
  .options('migrate-config', {
    boolean: false,
    describe: 'migrate old configuration file in $HOME to new style.'
  })
  .options('test', {
    alias: 't',
    boolean: false,
    describe: 'test final configuration (file, env-vars, command line)'
  })
  .options('open', {
    // open local web-browser to connect to web ui on startup of server daemon too
    boolean: true,
    default: false,
    describe: 'Open web-browser with Redis-Commander.'
  })

  // following cli params have equivalent within config file as default
  .options('redis-label', {
    string: true,
    describe: 'The label to display for the connection.',
    default: config.get('redis.defaultLabel')
  })
  .options('read-only', {
    booelan: true,
    describe: 'Start app in read-only mode.',
    default: config.get('redis.readOnly')
  })
  .options('http-auth-username', {
    alias: "http-u",
    string: true,
    describe: 'The http authorisation username.',
    default: config.get('server.httpAuth.username')
  })
  .options('http-auth-password', {
    alias: "http-p",
    string: true,
    describe: 'The http authorisation password.',
    default: config.get('server.httpAuth.password')
  })
  .options('http-auth-password-hash', {
    alias: "http-h",
    string: true,
    describe: 'The http authorisation password hash.',
    default: config.get('server.httpAuth.passwordHash')
  })
  .options('address', {
    alias: 'a',
    string: true,
    describe: 'The address to run the server on.',
    default: config.get('server.address')
  })
  .options('port', {
    alias: 'p',
    string: true,
    describe: 'The port to run the server on.',
    default: config.get('server.port')
  })
  .options('url-prefix', {
    alias: 'u',
    string: true,
    describe: 'The url prefix to respond on.',
    default: config.get('server.urlPrefix'),
  })
  .options('nosave', {
    alias: 'ns',
    boolean: true,
    describe: 'Do not save new connections to config.',
    default: config.get('noSave'),
  })
  .options('no-log-data', {
    // through no-  this is a negated param, if set args[log-data]=true
    // internal handling of optimist is different to nosave (without "-")
    boolean: true,
    describe: 'Do not log data values from redis store.',
    default: config.get('noLogData')
  })
  .options('folding-char', {
    alias: 'fc',
    boolean: false,
    describe: 'Character to fold keys at for tree view.',
    default: config.get('ui.foldingChar')
  })
  .options('root-pattern', {
    alias: 'rp',
    boolean: false,
    describe: 'default root pattern for redis keys.',
    default: config.get('redis.rootPattern')
  })
  .options('use-scan', {
    alias: 'sc',
    boolean: true,
    describe: 'Use SCAN instead of KEYS.',
    default: config.get('redis.useScan')
  })
  .options('scan-count', {
    boolean: false,
    describe: 'The size of each separate scan.',
    default: config.get('redis.scanCount'),

  })
  .check(function(value) {
    switch (value['folding-char']) {
      case '&':
      case '?':
      case '*':
        throw new Error('Characters &, ? and * are invalid for param folding-char!');
    }
    // special handling of no* by optimist module needed
    if (value['save']) value['nosave'] = false;

    // now write back all values into config object to overwrite defaults with cli params
    config.noSave = value['nosave'];
    config.noLogData = (value['log-data']===false);  // due to special negated param
    config.ui.foldingChar = value['folding-char'];
    config.redis.useScan = value['use-scan'];
    config.redis.readOnly = value['read-only'];
    config.redis.scanCount = value['scan-count'];
    config.redis.rootPattern = value['root-pattern'];
    config.redis.defaultLabel = value['redis-label'];
    config.server.address = value['address'];
    config.server.port = value['port'];
    config.server.urlPrefix = value['url-prefix'];
    config.server.httpAuth.username = value['http-auth-username'];
    config.server.httpAuth.password = value['http-auth-password'];
    config.server.httpAuth.passwordHash = value['http-auth-password-hash'];
  })
  .argv;

if (args.help) {
  optimist.showHelp();
  return process.exit(-1);
}

// var to distinguish between commands that exit right after doing some stuff
// and other to startup http server
let startServer = true;


if(args['migrate-config']) {
  startServer = false;
  myUtils.migrateDeprecatedConfig(function() {
    process.exit();
  });
}


if(args['clear-config']) {
  startServer = false;
  myUtils.deleteDeprecatedConfig(function(err) {
    if (err) {
      console.log('Failed to delete existing deprecated config file.');
    }
  });
  myUtils.deleteConfig('local', function(err) {
    if (err) {
      console.log('Failed to delete existing local.json config file.');
    }
    myUtils.deleteConfig('connections', function(err) {
      if (err) {
        console.log('Failed to delete existing local-<hostname>.json config file.');
      }

      // now restart app to reload config files and reapply env vars and cli params
      const spawn = require('child_process').spawn;
      let processArgs =  process.argv.slice(1);
      processArgs.splice(processArgs.indexOf('--clear-config'), 1);
      const subprocess = spawn(process.argv[0], processArgs, {detached: true});
      subprocess.unref();
      process.exit();
    });
  });
}


if(args['test']) {
  startServer = false;
  try {
    myUtils.validateConfig();
    console.log('Configuration created from files, env-vars and command line is valid.');
    process.exit(0);
  }
  catch(e) {
    console.error(e.message);
    process.exit(2);
  }
}


if (startServer) {
  // check if old deprecated config exists and merge into current one
  if (myUtils.hasDeprecatedConfig()) {
    console.log('==================================================================================================');
    console.log('DEPRECATION WARNING: Old style configuration file found at ' + myUtils.getDeprecatedConfigPath());
    console.log('  Please delete file or migrate to new format calling app with "--migrate-config" parameter');
    console.log('==================================================================================================');

    myUtils.getDeprecatedConfig(function(err, oldConfig) {
      // old config only contains some ui parameters or connection definitions
      config.ui = config.util.extendDeep(config.ui, oldConfig.ui);
      if (Array.isArray(oldConfig.connections) && oldConfig.connections.length > 0) {
        oldConfig.connections.forEach(function(cfg) {
          if (!myUtils.containsConnection(config.connections, cfg)) {
            config.connections.push(cfg);
          }
        });
      }
      startAllConnections();
    });
  }
  else {
    startAllConnections();
  }
}


// ==============================================
// end main programm / special cli param handling
// functions below...

function startAllConnections() {
  try {
    myUtils.validateConfig();
  }
  catch(e) {
    console.error(e.message);
    process.exit(2);
  }

  // redefine keys method before connections are started
  if (config.get('redis.useScan')) {
    console.log('Using scan instead of keys');
    Object.defineProperty(Redis.prototype, 'keys', {
      value: function(pattern, cb) {
        let keys = [];
        let that = this;
        let scanCB = function(err, res) {
          if (err) {
            if (typeof cb === 'function') cb(err);
            else {
              console.log('ERROR in redefined "keys" function to use "scan" instead without callback: ' + JSON.stringify(err));
            }
          }
          else {
            let count = res[0], curKeys = res[1];
            console.log("scanning: " + count + ": " + curKeys.length);
            keys = keys.concat(curKeys);
            if (Number(count) === 0) {
              if (typeof cb === 'function') cb(null, keys);
              else {
                console.log('ERROR in redefined "keys" function to use "scan" instead - no callback given!');
              }
            }
            else {
              that.scan(count, 'MATCH', pattern, 'COUNT', config.get('redis.scanCount'), scanCB);
            }
          }
        };
        return this.scan(0, 'MATCH', pattern, 'COUNT', config.get('redis.scanCount'), scanCB);
      }
    });
  }

  // first default connections from config object
  // second connection from cli params (redis-host, redis-port, ...)
  startDefaultConnections(config.connections, function (err) {
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
        "label": config.get('redis.defaultLabel'),
        "host": args['redis-host'] || "localhost",
        "sentinel_host": args['sentinel-host'],
        "sentinel_port": args['sentinel-port'],
        "port": args['redis-port'] || args['redis-socket'] || "6379",
        "dbIndex": db,
        "password": args['redis-password'] || '',
        "connectionName": config.get('redis.connectionName')
      };
      if (args['redis-tls']) {
        newDefault.tls = {};
      }
      if (!myUtils.containsConnection(config.connections, newDefault)) {
        if (newDefault.sentinel_host) {
          client = new Redis({
            showFriendlyErrorStack: true,
            sentinels: [{host: newDefault.sentinel_host, port: newDefault.sentinel_port}],
            tls: newDefault.tls,
            password: newDefault.password,
            name: 'mymaster',
            connectionName: newDefault.connectionName,
            retryStrategy: function (times) {
              return 1000;
            }
          });
        } else {
          client = new Redis({
            port: newDefault.port,
            host: newDefault.host,
            tls: newDefault.tls,
            family: 4,
            password: newDefault.password,
            db: newDefault.dbIndex,
            connectionName: newDefault.connectionName,
            retryStrategy: function (times) {
              return 1000;
            }
          });
        }
        client.label = newDefault.label;
        redisConnections.push(client);
        config.connections.push(newDefault);
        if (!config.get('noSave')) {
          myUtils.saveConnections(config,function (err) {
            if (err) {
              console.log("Problem saving connection config.");
              console.error(err);
            }
          });
        }
        setUpConnection(client, db);
      }
    } else if (config.connections.length === 0) {
      // fallback to localhost if nothing els configured
      client = new Redis();
      client.label = config.get('redis.defaultLabel');

      redisConnections.push(client);
      setUpConnection(client, db);
    }

    return startWebApp();
  });

  // wait a bit before starting browser to let http server start
  if (args['open']) {
    setTimeout(function() {
      let address = '127.0.0.1';
      if (config.get('server.address') !== '0.0.0.0' && config.get('server.address') !== '::') {
        address = config.get('server.address');
      }
      require('opener')('http://' + address + ':' + config.get('server.port'));
    }, 1000);
  }
}


function startDefaultConnections (connections, callback) {
  if (connections && Array.isArray(connections)) {
    connections.forEach(function (connection) {
      if (!myUtils.containsConnection(redisConnections.map(function(c) {return c.options}), connection)) {
        let opts = {
          port: connection.port,
          host: connection.host,
          family: 4,
          password: connection.password,
          db: connection.dbIndex,
          connectionName: config.get('redis.connectionName')
        };
        // add tls support (simple and complex)
        // 1) boolean flag - simple tls without cert validation and similiar
        // 2) object - all params allowed for tls socket possible (see https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)
        if (typeof connection.tls === 'boolean' && connection.tls) {
          opts.tls = {};
        }
        else if (typeof connection.tls === 'object') {
          opts.tls = connection.tls;
        }

        let client = new Redis(opts);
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
    console.log('Redis Connection ' + redisConnection.options.host + ':' + redisConnection.options.port +
      (redisConnection.options.tls ? ' with TLS' : '') +
      ' using Redis DB #' + redisConnection.options.db);
  });
}


function startWebApp () {
  let urlPrefix = config.get('server.urlPrefix');
  if (urlPrefix && !urlPrefix.startsWith('/')) {
    console.log("url-prefix must begin with leading '/'");
    process.exit();
  }
  console.log("No Save: " + config.get('noSave'));
  let app = require('../lib/app');
  let appInstance = app(redisConnections);

  appInstance.listen(config.get('server.port'), config.get('server.address'), function() {
    console.log("listening on ", config.get('server.address'), ":", config.get('server.port'));
    if (urlPrefix) {
      console.log(`using url prefix ${urlPrefix}/`);
    }
  });
}
