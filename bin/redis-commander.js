#!/usr/bin/env node

'use strict';

let yargs = require('yargs');
let Redis = require('ioredis');
var isEqual = require('lodash.isequal');
let myUtils = require('../lib/util');

// fix the cwd to project base dir for browserify and config loading
let path = require('path');
process.chdir( path.join(__dirname, '..') );

process.env.ALLOW_CONFIG_MUTATIONS = true;
let config = require('config');

let redisConnections = [];

let args = yargs
  .alias('h', 'help')
  .alias('h', '?')
  .options('redis-port', {
    type: 'number',
    describe: 'The port to find redis on.'
  })
  .options('redis-host', {
    type: 'string',
    describe: 'The host to find redis on.'
  })
  .options('redis-socket', {
    type: 'string',
    describe: 'The unix-socket to find redis on.'
  })
  .options('redis-username', {
    type: 'string',
    describe: 'The redis username.'
  })
  .options('redis-password', {
    type: 'string',
    describe: 'The redis password.'
  })
  .options('redis-db', {
    type: 'number',
    describe: 'The redis database.'
  })
  .options('redis-optional', {
    type: 'boolean',
    describe: 'Set to true if no permanent auto-reconnect shall be done if server is down.',
    default: false
  })
  .options('sentinel-port', {
    type: 'number',
    describe: 'The port to find sentinel on.'
  })
  .options('sentinel-host', {
    type: 'string',
    describe: 'The host to find sentinel on.'
  })
  .options('sentinels', {
    type: 'string',
    describe: 'Comma separated list of sentinels with host:port.'
  })
  .options('sentinel-name', {
    type: 'string',
    describe: 'The sentinel group name to use.'
  })
  .options('sentinel-username', {
    type: 'string',
    describe: 'The sentinel username to use.'
  })
  .options('sentinel-password', {
    type: 'string',
    describe: 'The sentinel password to use.'
  })
  .options('redis-tls', {
    type: 'boolean',
    describe: 'Use TLS for connection to redis server or sentinel.',
    default: false
  })
  .options('noload', {
    alias: 'nl',
    type: 'boolean',
    describe: 'Do not load connections from config.'
  })
  .options('clear-config', {
    alias: 'cc',
    type: 'boolean',
    describe: 'Clear configuration file.'
  })
  .options('migrate-config', {
    type: 'boolean',
    describe: 'Migrate old configuration file in $HOME to new style.'
  })
  .options('test', {
    alias: 't',
    type: 'boolean',
    describe: 'Test final configuration (file, env-vars, command line)'
  })
  .options('open', {
    // open local web-browser to connect to web ui on startup of server daemon too
    type: 'boolean',
    default: false,
    describe: 'Open web-browser with Redis-Commander.'
  })

  // following cli params have equivalent within config file as default
  .options('redis-label', {
    type: 'string',
    describe: 'The label to display for the connection.',
    default: config.get('redis.defaultLabel')
  })
  .options('read-only', {
    type: 'boolean',
    describe: 'Start app in read-only mode.',
    default: config.get('redis.readOnly')
  })
  .options('http-auth-username', {
    alias: "http-u",
    type: 'string',
    describe: 'The http authorisation username.',
    default: config.get('server.httpAuth.username')
  })
  .options('http-auth-password', {
    alias: "http-p",
    type: 'string',
    describe: 'The http authorisation password.',
    default: config.get('server.httpAuth.password')
  })
  .options('http-auth-password-hash', {
    alias: "http-h",
    type: 'string',
    describe: 'The http authorisation password hash.',
    default: config.get('server.httpAuth.passwordHash')
  })
  .options('address', {
    alias: 'a',
    type: 'string',
    describe: 'The address to run the server on.',
    default: config.get('server.address')
  })
  .options('port', {
    alias: 'p',
    type: 'number',
    describe: 'The port to run the server on.',
    default: config.get('server.port')
  })
  .options('url-prefix', {
    alias: 'u',
    type: 'string',
    describe: 'The url prefix to respond on.',
    default: config.get('server.urlPrefix'),
  })
  .options('trust-proxy', {
    type: 'boolean',
    describe: 'App is run behind proxy (enable Express "trust proxy")',
    default: config.get('server.trustProxy')
  })
  .options('max-hash-field-size', {
    type: 'number',
    describe: 'The max number of bytes for a hash field before you must click to view it',
    default: config.get('ui.maxHashFieldSize'),
  })
  .options('nosave', {
    alias: 'ns',
    type: 'boolean',
    describe: 'Do not save new connections to config file.',
    default: config.get('noSave'),
  })
  .options('no-log-data', {
    // through no-  this is a negated param, if set args[log-data]=true
    // internal handling of yargs is different to nosave (without "-")
    type: 'boolean',
    describe: 'Do not log data values from redis store.',
    default: config.get('noLogData')
  })
  .options('folding-char', {
    alias: 'fc',
    type: 'string',
    describe: 'Character to fold keys at for tree view.',
    default: config.get('ui.foldingChar')
  })
  .options('root-pattern', {
    alias: 'rp',
    type: 'string',
    describe: 'Default root pattern for redis keys.',
    default: config.get('redis.rootPattern')
  })
  .options('use-scan', {
    alias: 'sc',
    type: 'boolean',
    describe: 'Use SCAN instead of KEYS.',
    default: config.get('redis.useScan')
  })
  .options('scan-count', {
    type: 'number',
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

    // parser special handling of params starting with "no-"
    // it adds new field without "no-" and set this to "false"
    if (typeof value['log-data'] !== 'undefined') value['no-log-data'] = !value['log-data'];

    // now write back all values into config object to overwrite defaults with cli params
    config.noSave = value['nosave'];
    config.noLogData = value['no-log-data'];
    config.ui.foldingChar = value['folding-char'];
    config.ui.maxHashFieldSize = value['max-hash-field-size'];
    config.redis.useScan = value['use-scan'];
    config.redis.readOnly = value['read-only'];
    config.redis.scanCount = value['scan-count'];
    config.redis.rootPattern = value['root-pattern'];
    config.redis.defaultLabel = value['redis-label'];
    config.server.address = value['address'];
    config.server.port = value['port'];
    config.server.urlPrefix = value['url-prefix'];
    config.server.trustProxy = value['trust-proxy'];
    config.server.httpAuth.username = value['http-auth-username'];
    config.server.httpAuth.password = value['http-auth-password'];
    config.server.httpAuth.passwordHash = value['http-auth-password-hash'];
    return true;
  })
  .usage('Usage: $0 [options]')
  .wrap(yargs.terminalWidth())
  .argv;

if (args.help) {
  yargs.help();
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
    myUtils.deleteConfig('connections', function(err2) {
      if (err2) {
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
// end main program / special cli param handling
// functions below...


/** function to check command line arguments given if the contain vaid informations for an redis connection
 *  Some params like port and db are check if they are valid values (if set), otherwise the entire program will exit
 *  with an error message.
 *
 * @param {object} argList object of params as given on command line as parsed by yargs
 * @return {null|object} returns "null" if no usable connection data are found, an object to feed into redis client
 *   otherwise to create a new connection.
 */
function createConnectionObjectFromArgs(argList) {
  // check if ports and dbIndex given are valid, must be done here as redis connection params from cli are not added
  // to config object and tested later together with everything else from config
  let checkPortInvalid = function(portString, paramName) {
    if (portString) {
      if (Number.isNaN(portString) || !Number.isInteger(Number(portString))) {
        console.error(`value given for "${paramName}" is invalid - must be an integer number`);
        return true;
      }
      else if (Number(portString) < 1 || Number(portString) > 65535) {
        console.error(`value given for "${paramName}" is invalid - must be an integer number between 1 and 65535`);
        return true
      }
    }
    return false;
  };
  let checkDbIndexInvalid = function(dbString, paramName) {
    if (dbString) {
      if (Number.isNaN(dbString) || !Number.isInteger(Number(dbString))) {
        console.error(`value given for "${paramName}" is invalid - must be an integer number`);
        return true;
      }
      else if (Number(dbString) < 0) {
        console.error(`value given for "${paramName}" is invalid - must be an positiv integer number`);
        return true
      }
    }
    return false;
  };
  // sometimes redis_port is automatically set to something like 'tcp://10.2.3.4:6379'
  // parse this and update args accordingly
  if (typeof argList['redis-port'] === 'string' && argList['redis-port'].startsWith('tcp://')) {
    console.log('Found long tcp port descriptor with hostname in redis-port param, parse this as host and port value');
    let parts = argList['redis-port'].split(':');
    argList['redis-port'] = parts[2];
    argList['redis-host'] = parts[1].substring(2);
  }
  // now some validity checks - exits on failure with error message
  if (checkPortInvalid(argList['redis-port'], 'redis-port') ||
      checkPortInvalid(argList['sentinel-port'], 'sentinel-port') ||
      checkDbIndexInvalid(argList['redis-db'], 'redis-db')) {
    process.exit(1)
  }

  // now create connection object if enough params are set
  let connObj = null;
  if (argList['sentinel-host'] || argList['sentinels'] || argList['redis-host'] || argList['redis-port'] || argList['redis-socket']
    || argList['redis-username'] || argList['redis-password'] || argList['redis-db']) {

    let db = parseInt(argList['redis-db']);
    connObj = {
      label: config.get('redis.defaultLabel'),
      dbIndex: Number.isNaN(db) ? 0 : db,
      username: argList['redis-username'] || null,
      password: argList['redis-password'] || '',
      connectionName: config.get('redis.connectionName'),
      optional: argList['redis-optional']
    };

    if (argList['redis-socket']) {
      connObj.path = argList['redis-socket'];
    }
    else {
      connObj.host = argList['redis-host'] || 'localhost';
      connObj.port = argList['redis-port'] || 6379;
      connObj.port = parseInt(connObj.port);
      connObj.sentinelUsername = argList['sentinel-username'] || null;
      connObj.sentinelPassword = argList['sentinel-password'] || '';
      if (argList['sentinels']) {
        connObj.sentinels = myUtils.parseRedisSentinel('--sentinels', argList['sentinels']);
        connObj.sentinelName = myUtils.getRedisSentinelGroupName(argList['sentinel-name']);
      }
      else if (argList['sentinel-host']) {
        connObj.sentinels = myUtils.parseRedisSentinel('--sentinel-host or --sentinel-port',
          argList['sentinel-host'] + ':' + argList['sentinel-port']);
        connObj.sentinelName = myUtils.getRedisSentinelGroupName(argList['sentinel-name']);
      }
    }

    if (argList['redis-tls']) {
      connObj.tls = {};
    }
  }
  return connObj;
}


/** function to start all confugred connections from config and command line
 */
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
              console.log('ERROR in redefined "keys" function to use "scan" instead without callback: ' +
                  (err.message ? err.message : JSON.stringify(err)));
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

  // first connection from cli params (redis-host, redis-port, ...)
  // second default connections from config object (to allow override of pw changed and so on)
  let client;
  let newDefault = createConnectionObjectFromArgs(args);
  if (newDefault) {
    client = myUtils.createRedisClient(newDefault);
    redisConnections.push(client);
    setUpConnection(client, newDefault.dbIndex);

    // now check if this one is already part of default connections
    // update it if needed
    let configChanged = false;
    let oldDefault = myUtils.findConnection(config.connections, newDefault);
    if (!oldDefault) {
      config.connections.push(newDefault);
      configChanged = true;
    }
    else {
      // remove connectionId from newDefaults to allow comparison, otherwise non-equal every time
      delete newDefault.connectionId;
      if (!isEqual(oldDefault, newDefault)) {
        myUtils.replaceConnection(config.connections, oldDefault, newDefault);
        configChanged = true;
      }
    }

    if (configChanged && !config.get('noSave')) {
      myUtils.saveConnections(config,function (err) {
        if (err) {
          console.log("Problem saving connection config.");
          console.error(err);
        }
      });
    }
  }
  else if (config.connections.length === 0) {
    // fallback to localhost if nothing else configured
    client = myUtils.createRedisClient({label: config.get('redis.defaultLabel')});
    redisConnections.push(client);
    setUpConnection(client, 0);
  }

  // now start all default connections (if not same as one given via command line)...
  startDefaultConnections(config.connections, function (err) {
    if (err) {
      console.log(err);
      process.exit();
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
        let client = myUtils.createRedisClient(connection);
        redisConnections.push(client);
        setUpConnection(client, connection.dbIndex);
      }
    });
  }
  return callback(null);
}

function setUpConnection (redisConnection, db) {
  redisConnection.on('error', function (err) {
    console.error(`setUpConnection (${redisConnection.options.connectionId}) Redis error`, err.stack);
  });
  redisConnection.on('end', function () {
    console.log(`connection (${redisConnection.options.connectionId}) closed. Attempting to Reconnect...`);
  });
  redisConnection.once('connect', connectToDB.bind(this, redisConnection, db));
}


function connectToDB (redisConnection, db) {
  redisConnection.call('command', function(errCmd, cmdList) {
    if (errCmd || !Array.isArray(cmdList)) {
      console.log(`redis command "command" not supported, cannot build dynamic command list for (${redisConnection.options.connectionId}`);
      return;
    }
    // console.debug('Got list of ' + cmdList.length + ' commands from server ' + redisConnection.options.host + ':' +
    //   redisConnection.options.port);
    redisConnection.options.commandList = {
      all: cmdList.map((item) => (item[0].toLowerCase())),
      ro: cmdList.filter((item) => (item[2].indexOf('readonly') >= 0)).map((item) => (item[0].toLowerCase()))
    };
  });

  redisConnection.select(db, function (err) {
    if (err) {
      console.log(err);
      process.exit();
    }
    let opt = redisConnection.options;
    let hostPort = opt.path ? opt.path : opt.host + ':' + opt.port;
    if (opt.type === 'sentinel') {
      hostPort = `sentinel ${opt.sentinels[0].host}:${opt.sentinels[0].port}:${opt.name}`;
    }
    console.log('Redis Connection ' + hostPort +
      (opt.tls ? ' with TLS' : '') + ' using Redis DB #' + opt.db);
  });
}


function startWebApp () {
  let urlPrefix = config.get('server.urlPrefix');
  console.log("No Save: " + config.get('noSave'));
  let app = require('../lib/app');
  let appInstance = app(redisConnections);

  appInstance.listen(config.get('server.port'), config.get('server.address'), function() {
    console.log(`listening on ${config.get('server.address')}:${config.get('server.port')}`);

    // default ip 0.0.0.0 and ipv6 equivalent cannot be opened with browser, need different one
    // may search for first non-localhost address of server instead of 127.0.0.1...
    let address = '127.0.0.1';
    if (config.get('server.address') !== '0.0.0.0' && config.get('server.address') !== '::') {
      address = config.get('server.address');
    }
    let msg = `access with browser at http://${address}:${config.get('server.port')}`;
    if (urlPrefix) {
      console.log(`using url prefix ${urlPrefix}`);
      msg += urlPrefix;
    }
    console.log(msg);
  });
}
