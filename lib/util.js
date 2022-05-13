'use strict';

let fs = require('fs');
let path = require('path');
let crypto = require('crypto');

// NOTE: this a patch until official support is out
const prepareIoredis = require('../lib/ioredis-stream.js');
prepareIoredis();
let Redis = require('ioredis');

function split(str) {
  let results = [];
  let word = '';
  let validWord;
  for (let i = 0; i < str.length;) {
    if (/\s/.test(str[i])) {
      //Skips spaces.
      while (i < str.length && /\s/.test(str[i])) {
        i++;
      }
      results.push(word);
      word = '';
      validWord = false;
      continue;
    }

    if (str[i] === '"') {
      i++;
      while (i < str.length) {
        if (str[i] === '"') {
          validWord = true;
          break;
        }

        if (str[i] === '\\') {
          i++;
          word += str[i++];
          continue;
        }

        word += str[i++];
      }
      i++;
      continue;
    }

    if (str[i] === '\'') {
      i++;
      while (i < str.length) {
        if (str[i] === '\'') {
          validWord = true;
          break;
        }

        if (str[i] === '\\') {
          i++;
          word += str[i++];
          continue;
        }

        word += str[i++];
      }
      i++;
      continue;
    }

    if (str[i] === '\\') {
      i++;
      word += str[i++];
      continue;
    }
    validWord = true;
    word += str[i++];
  }
  if (validWord) {
    results.push(word);
  }
  return results;
}

function distinct(items) {
  let hash = {};
  items.forEach(function (item) {
    hash[item] = true;
  });
  let result = [];
  for (let item in hash) {
    if (hash.hasOwnProperty(item)) result.push(item);
  }
  return result;
}

let encodeHTMLEntities = function (string, callback) {
  callback(string.replace(/[\u00A0-\u2666<>&]/g, function (c) {
    return '&' +
      (encodeHTMLEntities.entityTable[c.charCodeAt(0)] || '#' + c.charCodeAt(0)) + ';';
  }));
};

encodeHTMLEntities.entityTable = {
  34: 'quot',
  38: 'amp',
  39: 'apos',
  60: 'lt',
  62: 'gt'
};

let decodeHTMLEntities = function (string, callback) {
  callback(string.replace(/&(\w)*;/g, function (c) {
    return String.fromCharCode(decodeHTMLEntities.entityTable[c.substring(1, c.indexOf("\;"))]);
  }));
};

decodeHTMLEntities.entityTable = {
  'quot': 34,
  'amp': 38,
  'apos': 39,
  'lt': 60,
  'gt': 62
};

//Gets the last element of an array.
function addElement(newElem, callback) {
  this.push(newElem);
  return callback(this);
}


// Config Util functions - used for old config file inside home dir
// ==========
function hasDeprecatedConfig() {
  return fs.existsSync(getDeprecatedConfigPath());
}

function getDeprecatedConfig(callback) {
  let configPath = getDeprecatedConfigPath();
  fs.readFile(configPath, 'utf8', function (err, data) {
    if (err) {
      callback(err);
      return;
    }
    let newConfig = {};
    try {
      let oldConfig = JSON.parse(data);

      // fallback for old config format - rewrite to new one
      if (oldConfig['sidebarWidth']) {
        newConfig.ui = {
          sidebarWidth: oldConfig['sidebarWidth'],
          cliHeight: oldConfig['CLIHeight'],
          cliOpen: oldConfig['CLIOpen'],
          locked: oldConfig['locked'],
        };
      }
      if (oldConfig['default_connections']) {
        newConfig.connections = oldConfig['default_connections'];
      }
    } catch (e) {
      callback('Failed to unserialize old configuration at ' + configPath + ': ' + e.message);
      return;
    }
    callback(null, newConfig);
  });
}

function deleteDeprecatedConfig(callback) {
  let cfgPath = getDeprecatedConfigPath();
  if (fs.existsSync(cfgPath)) {
    fs.unlink(cfgPath, function(err) {
      if (typeof callback === 'function') callback(err);
    });
  }
  else {
    if (typeof callback === 'function') callback(null);
  }
}

function migrateDeprecatedConfig(cbEndMigrate) {
  let oldConfigFile = getDeprecatedConfigPath();
  let newConfigFile = getConfigPath('local');

  if (hasDeprecatedConfig()) {
    getDeprecatedConfig(function(err, oldConfig) {
      if (err) {
        console.log('ERROR reading old config file at ' + oldConfigFile + '. Migration aborted.');
        console.log('ERROR: ' + (err.message ? err.message : JSON.stringify(err)));
        if (typeof cbEndMigrate === 'function') cbEndMigrate();
        return;
      }

      if (oldConfig) {
        // now read new config file if exists and merge booth before writing back
        readNewLocalConfig(function(errNew, newConfig) {
          if (errNew) {
            console.log('ERROR reading existing new config file at ' + newConfigFile + '. ');
            console.log('  Please check file and fix syntax and/or delete it. Migration aborted.');
            console.log('ERROR: ' + (errNew.message ? errNew.message : JSON.stringify(errNew)));
            if (typeof cbEndMigrate === 'function') cbEndMigrate();
            return;
          }

          let c = require('config');
          // extendDeep replaces array - need to merge "connections" before manually
          if (newConfig.connections && oldConfig.connections) {
            newConfig.connections.forEach(function(con) {
                if (!containsConnection(oldConfig.connections, con)) {
                    oldConfig.connections.push(con);
                }
            });
          }
          newConfig = c.util.extendDeep(newConfig, oldConfig);
          saveLocalConfig(newConfig, function(errSave) {
            if (errSave) {
              console.log('ERROR saving new config file to ' + newConfigFile + '. Migration aborted.');
              console.log('ERROR: ' + (errSave.message ? errSave.message : JSON.stringify(errSave)));
              if (typeof cbEndMigrate === 'function') cbEndMigrate();
            }
            else {
              console.log('SUCCESS: Old configuration from ' + oldConfigFile + ' migrated to new config file ' + newConfigFile +'.');
              deleteDeprecatedConfig(deleteOldConfigCB);
            }
          })
        })
      }
      else {
        console.log('SUCCESS: Old configuration is empty. Migration ended.');
        deleteDeprecatedConfig(deleteOldConfigCB);
      }
    });

    let deleteOldConfigCB = function(errDel) {
      if (errDel) {
        console.log('ERROR deleting old config file at ' + oldConfigFile + '. Please delete manually.');
        console.log('ERROR: ' + (errDel.message ? errDel.message : JSON.stringify(errDel)));
      }
      else {
        console.log('SUCCESS: Old config file ' + oldConfigFile + ' deleted.');
      }
      if (typeof cbEndMigrate === 'function') cbEndMigrate();
    };

    let readNewLocalConfig = function(callback) {
      if (fs.existsSync(newConfigFile)) {
        fs.readFile(newConfigFile, 'utf8', function(err, data) {
          // error handling probably not needed as node-config module already tries to read this file and
          // exits with error on failure...
          if (err) {
            err.message = 'ERROR reading configuration file at ' + newConfigFile + ': ' + err.message;
            callback(err);
          }
          try {
            let newConfig = JSON.parse(data);
            callback(null, newConfig);
          }
          catch(e) {
            e.message = 'ERROR unserialize configuration file at ' + newConfigFile + ': ' + e.message;
            callback(e)
          }
        })
      }
      else {
        callback(null, {});
      }
    };
  }
  else {
    console.log('SUCCESS: No old configuration exists at ' + oldConfigFile +'. Migration ended.');
    if (typeof cbEndMigrate === 'function') cbEndMigrate();
  }
}

/** Function to create a new redis client object by given parameter
 *  This one is used by creating clients at startup from command line, config file
 *  or new connections added via UI during runtime.
 *  The redis client created can be either a normal redis client or a sentinel client, base on
 *  configuration given.
 *
  * @param {object} clientConfig - configuration to create client from
 *  @param {function} callback - function with error object and new client created: cb(error, client)
 */
function createRedisClient(clientConfig, callback) {
  let c = require('config');
  let client = null;
  let conId = null;
  let conType = null;

  let redisOpts = {
    //showFriendlyErrorStack: true,
    db: clientConfig.dbIndex,
    username: clientConfig.username,
    password: clientConfig.password,
    connectionName: clientConfig.connectionName || c.get('redis.connectionName'),
    retryStrategy: function (times) {
      return times > 10 ? 3000 : 1000;
    }
  };

  if (clientConfig.optional) {
    redisOpts.retryStrategy = null;
  }

  // add tls support (simple and complex)
  // 1) boolean flag - simple tls without cert validation and similiar
  // 2) object - all params allowed for tls socket possible (see https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options)
  if (typeof clientConfig.tls === 'boolean' && clientConfig.tls) {
    redisOpts.tls = {};
  }
  else if (typeof clientConfig.tls === 'object') {
    redisOpts.tls = clientConfig.tls;
  }

  if (clientConfig.sentinels) {
    Object.assign(redisOpts, {
      sentinels: clientConfig.sentinels,
      name: getRedisSentinelGroupName(clientConfig.sentinelName),
      sentinelUsername: clientConfig.sentinelUsername || null,
      sentinelPassword: clientConfig.sentinelPassword || null
    });
    conId = `S:${redisOpts.sentinels[0].host}:${redisOpts.sentinels[0].port}:${redisOpts.name}-${redisOpts.db}`;
    conType = 'sentinel';
  }
  else {
    Object.assign(redisOpts, {
      port: clientConfig.port,
      host: clientConfig.host,
      path: clientConfig.path,
      family: 4
    });
    if (clientConfig.path) {
      // unix-socket:
      // no need for strong crypto here, just short string hopefully unique between different socket paths
      // only needed if someone uses this app with multiple different local redis sockets...
      // ATTN: use no hardcoded algorithm as some systems may not support it. just search for a sha-something
      let hashAlg = crypto.getHashes().find((h) => (h.startsWith('sha')));
      let cid =crypto.createHash(hashAlg).update(clientConfig.path).digest('hex').substring(24);
      conId = `U:${cid}:${redisOpts.db}`;
      conType = 'socket';
    }
    else {
      conId = `R:${redisOpts.host}:${redisOpts.port}:${redisOpts.db}`;
      conType = 'standalone';
    }
  }
  client = new Redis(redisOpts);
  client.label = clientConfig.label;
  client.options.connectionId = clientConfig.connectionId = conId;
  client.options.type = conType;
  if (clientConfig.optional) client.options.isOptional = true;
  return client;
}


// functions related to new config files from node-config
// ==========

/** Helper to save all current connections defined inside config object into
 *  configuration file for connections
 *
 *  @see getConfigPath
 *  @param {object} config - config object to save configurations from
 *  @param {function} callback - callback after save, error object as first param on failure
 */
function saveConnections(config, callback) {
  // only save "connections" part, nothing else from config object
  let saveCfg = {
    connections: config.util.toObject(config.connections).map(function(c) {
      delete c.connectionId;
      return c;
    })
  };
  fs.writeFile(getConfigPath('connections'), JSON.stringify(saveCfg, null, 2), function (err) {
    if (typeof callback === 'function') callback(err ? err : null);
  });
}

function saveLocalConfig(config, callback) {
  fs.writeFile(getConfigPath('local'), JSON.stringify(config, null, 2), function (err) {
    if (typeof callback === 'function') callback(err ? err : null);
  });
}

function deleteConfig(configFile, callback) {
  const cfgPath = getConfigPath(configFile);
  if (fs.existsSync(cfgPath)) {
    fs.unlink(cfgPath, function(err) {
      callback(err);
    });
  }
  else {
    callback(null);
  }
}

/** check if a given connection object is already part of the connections list given as
 *  first parameter, the object found is returned or undefined otherwise.
 *  For comparison of the connection objects the _isSameConnection method is used.
 *
 *  @param {Array} connections list of connections
 *  @param {object} object connection object to search in list
 *  @return {boolean} true if this connection is found.
 */
function findConnection(connections, object) {
  return connections.find(function (element) {
    return _isSameConnection(element, object);
  });
}

/** check if a given connection object is already part of the connections list given as
 *  first parameter.
 *  For comparison of the connection objects the _isSameConnection method is used.
 *
 *  @param {Array} connections list of connections
 *  @param {object} object connection object to search in list
 *  @return {boolean} true if this connection is found.
 */
function containsConnection(connections, object) {
  return connections.some(function (element) {
    return _isSameConnection(element, object);
  });
}

/** Replace one object from connection list with another object.
 *  The list is search and the first object found matching oldObject is removed and
 *  replace with newObject. For comparison of the connection objects the _isSameConnection method is used.
 *
 *  This method changes the list as parameter.
 *
 *  @param {Array} connections list of connections
 *  @param {object} oldObject connection object to search in list to remove
 *  @param {object} newObject new connection object to add to list instead of old one.
 */
function replaceConnection(connections, oldObject, newObject) {
  const idx = connections.findIndex(function(element) {
    return _isSameConnection(element, oldObject);
  });
  if (idx >= 0) connections.splice(idx, 1, newObject);
}

/** This method compares two redis connection objects if they refer to the same server connection.
 *  Only fields needed to create the network/socket connection are compared.
 *
 *  Compared are the following fields only:
 *  <ul>
 *    <li> db or dbIndex </li>
 *    <li> sentinels list - at least one host entry must match together with the sentinelName </li>
 *    <li> host and port </li>
 *    <li> path </li>
 *  </ul>
 *  Not compared are the following fields like: password, tls, connectionName, label, connectionId
 *
 *  @param {object} element first connection object for comparison
 *  @param {object} object second connection object for comparison
 *  @return {boolean} true if same connection is found
 *  @private
 */
function _isSameConnection(element, object) {
  if (object.sentinels && Array.isArray(object.sentinels) && object.sentinels.length > 0) {
    // sentinels list may not contain ALL sentinels, only some
    // now check booth lists to check if there is AT LEAST on matching hostname/ip
    // => it must be the same connection than
    if (element.sentinels && Array.isArray(element.sentinels) && element.sentinels.length > 0) {
      // our config names it "sentinelName", ioredis stores it at more general "name" properties
      // attribute used depends if this is a config item or a existing redis client
      const oName = (object.sentinelName ? object.sentinelName : object.name);
      const eName = (element.sentinelName ? element.sentinelName : element.name);
      if (eName.toLowerCase() === oName.toLowerCase()) {
        const found = object.sentinels.find(function(oItem) {
          const found2 = element.sentinels.find(function(eItem) {
            if (oItem.host.toLowerCase() === eItem.host.toLowerCase() && oItem.port == eItem.port) {
              if (typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) {
                return true;
              }
              else {
                return (typeof element.db !== 'undefined' && element.db == object.dbIndex);
              }
            }
            return false;
          });
          return typeof found2 !== 'undefined';
        });
        if (found) return true;
      }
    }
    return false;
  }
  else if (object.host) {
    if (element.host === object.host && element.port == object.port) {
      // dbIndex for configuration item
      // db for ioredis client options object
      if ((typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) ||
          (typeof element.db !== 'undefined' && element.db == object.dbIndex)) {
        return true;
      }
    }
  }
  else if (object.path && element.path === object.path) {
    if ((typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) ||
        (typeof element.db !== 'undefined' && element.db == object.dbIndex)) {
      return true;
    }
  }
  return false;
}

/** check if the given array of connections already contains a connection with this connectionId
 *  value.
 *  @param {Array} connections list of all connection objects to check
 *  @param {string} conId connectionId to search in list
 *  @return {boolean} true if this connectionId is found in list
 */
function containsConnectionId(connections, conId) {
  return connections.some(function (element) {
    return (element.connectionId === conId);
  });
}

/** this function gets a connection object and converts this to a new object
 *  unable to display at the UI visible to users.
 *  This method takes care of special all the different kind of connections (socket, sentinel, ...)
 *  and all the different attributes needed to describe them and creates an object usable to display
 *  this information in a common way to not duplicate all this if-then decisions client-side (e.g. treeview,
 *  import/export connection drop-down).
 *
 *  @param {object} connection connection information object as used in global app.locals.redisConnections array
 *  @return {{options: {db: *}, conId: *, label: *}} new object usable to display to users
 */
function convertConnectionInfoForUI(connection) {
  let retObj = {
    'label': connection.label,
    'conId': connection.options.connectionId,
    'options': {
      'db': connection.options.db
    }
  };
  if (connection.options.type === 'socket') {
    retObj.options.host = 'UnixSocket';
    retObj.options.port = '-';
  }
  else if (connection.options.type === 'sentinel') {
    retObj.options.host = connection.options.sentinels[0].host;
    retObj.options.port = connection.options.sentinels[0].port;
    retObj.options.db = connection.options.name + '-' + connection.options.db;
  }
  else {
    retObj.options.host = connection.options.host;
    retObj.options.port = connection.options.port;
  }
  return retObj;
}

function getDeprecatedConfigPath() {
  let homePath = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  if (typeof homePath === 'undefined') {
    console.log('Home directory not found for configuration file. Using current directory as fallback.');
    homePath = '.';
  }
  return path.join(homePath, '.redis-commander');
}


function getConfigPath (configFile) {
  const c = require('config');
  const configPath = c.util.getEnv('NODE_CONFIG_DIR');
  if (configFile === 'local') {
    return path.join(configPath, 'local.json');
  }
  else {  // connections
    return path.join(configPath, 'local-' + c.util.getEnv('NODE_ENV') + '.json');
  }
}


function validateConfig() {
  const c = require('config');
  let errCount = 0;

  let hasError = function(msg) {
    errCount++;
    console.error(msg);
  };

  let convertBoolean = function(key, ignoreError) {
    if (c.has(key)) {
      const value = c.get(key);
      switch (typeof value) {
        case 'boolean':
          return;

        case 'number':
          if (value === 0) c.util.setPath(c, key.split('.'), false);
          else if (value === 1) c.util.setPath(c, key.split('.'), true);
          else if (ignoreError !== true) hasError(`Config key "${key}" has invalid value. Value must be boolean!`);
          break;

        case 'string':
          switch (value.toLowerCase()) {
            case 'true':
            case 'yes':
            case 'on':
            case '1':
              c.util.setPath(c, key.split('.'), true);
              break;
            case 'false':
            case 'no':
            case 'off':
            case '0':
              c.util.setPath(c, key.split('.'), false);
              break;
            default:
              if (ignoreError !== true) hasError(`Config key "${key}" has invalid value. Value must be boolean!`);
          }
          break;

        default:
          if (ignoreError !== true) hasError(`Config key "${key}" has invalid value. Value must be boolean!`);
      }
    }
  };

  let convertNumbers = function(key) {
    if (c.has(key)) {
      const value = c.get(key);
      switch (typeof value) {
        case 'number':
          return;
        case 'string':
          if (isNaN(value))
            return hasError(`Config key "${key}" has invalid value (current: ${value}). Value must be a number!`);

          c.util.setPath(c, key.split('.'), Number(value));
          break;
        default:
          return hasError(`Config key "${key}" has invalid value (current: ${value}). Value must be a number!`);
      }
    }
  };

  let validateNumbers = function(key, isInteger, minValue, maxValue) {
    if (c.has(key)) {
      const value = c.get(key);
      if (isInteger && !Number.isInteger(value))
        return hasError(`Config key "${key}" value (current: ${value}) must be an integer number!`);

      if (value < minValue || value > maxValue)
        return hasError(`Config key "${key}" value (current: ${value}) must be in range ${minValue} - ${maxValue}!`);
    }
  };

  // hard-coded list of all boolean config values so far...
  // try to convert if string or similar to "real" boolean.
  // is a string if set via env var, boolean for json config file
  ['noSave', 'noLogData', 'ui.locked', 'ui.cliOpen', 'ui.binaryAsHex',
   'redis.flushOnImport', 'redis.readOnly', 'redis.useScan', 'sso.enabled'].forEach(convertBoolean);

  // following config key MAY be a boolean or a real string, throw no error if not a boolean but do convert 0/1/true/..
  convertBoolean('server.trustProxy', true);

  // convert numbers and check if within valid range (e.g. ports)
  ['ui.sidebarWidth', 'ui.cliHeight', 'redis.scanCount', 'server.port', 'ui.maxHashFieldSize'].forEach(convertNumbers);

  validateNumbers('ui.sidebarWidth', true, 1, Number.MAX_VALUE);
  validateNumbers('ui.cliHeight', true, 1, Number.MAX_VALUE);
  validateNumbers('ui.maxHashFieldSize', true, 0, Number.MAX_VALUE);
  validateNumbers('redis.scanCount', true, 0, Number.MAX_VALUE);
  validateNumbers('server.port', true, 1, 65535);

  // validation of numbers at connections specific settings
  for (let index = 0; index < c.get('connections').length; ++index) {
    convertNumbers('connections.' + index + '.dbIndex');
    validateNumbers('connections.' + index + '.dbIndex', true, 0, Number.MAX_VALUE); // we do not know real server config, allow max...

    // check - port needs to be defined for "normal" redis, ignored for sentinel
    const sentinelsKey = 'connections.' + index + '.sentinels';
    if (c.has(sentinelsKey) && c.get(sentinelsKey)) {
      try {
        c.util.setPath(c, sentinelsKey.split('.'), parseRedisSentinel(sentinelsKey, c.get(sentinelsKey)));
      }
      catch (e) {
        hasError(e.message);
      }
      const groupName = 'connections.' + index + '.sentinelName';
      if (!c.has(groupName)) c.util.setPath(c, groupName.split('.'), c.get('redis.defaultSentinelGroup'));
    }
    else {
      convertNumbers('connections.' + index + '.port');
      validateNumbers('connections.' + index + '.port', true, 1, 65535);
    }

    // special case tls, can either be a boolean or object or stringified JSON
    const tlsKey = 'connections.' + index + '.tls';
    if (c.has(tlsKey)) {
      const tlsProp = c.get(tlsKey);
      switch (typeof tlsProp) {
        case 'boolean':
          break;
        case 'object':
          break;
        case 'number':
          convertBoolean(tlsKey);
          break;
        case 'string':
          if (tlsProp.startsWith('{')) {
            try {
              c.util.setPath(c, tlsKey.split('.'), JSON.parse(tlsProp));
            }
            catch(e) {
              hasError(`Invalid type for key ${tlsKey}: must be either boolean or object with tls socket params or json parsable string`);
            }
          }
          else convertBoolean(tlsKey);
          break;
        default:
          hasError(`Invalid type for key ${tlsKey}: must be either boolean or object with tls socket params`);
      }
    }
  }

  // check url prefix - must start with / and must not end with it (just remove it than for easier cases)
  let urlPrefix = c.get('server.urlPrefix');
  if (urlPrefix === '/' || urlPrefix === '//') {
    c.util.setPath(c, ['server', 'urlPrefix'], '');
    urlPrefix = '';
  }
  if (urlPrefix && !urlPrefix.startsWith('/')) {
    hasError(`Config key "server.urlPrefix" value must start with leading "/" (current: "${urlPrefix}")`);
  }
  else if (urlPrefix.length > 1 && urlPrefix.endsWith('/')) {
    if (urlPrefix.endsWith('//'))
      hasError(`Config key "server.urlPrefix" value must not end with "/" (current: "${urlPrefix}")`);
    else
      c.util.setPath(c, ['server', 'urlPrefix'], urlPrefix.slice(0, -1));
  }

  // check url signin path - must not be empty and not start with slash
  let signinPath = c.get('server.signinPath');
  if (signinPath === '' || signinPath.startsWith('/')) {
    hasError(`Config key "server.signinPath" value must not be empty and not start with leading "/" (current: "${signinPath}")`);
  }

  // check optional list of jwt singing algorithms used for sso from external app - must be a list (or empty string for all)
  if (! Array.isArray(c.get('sso.jwtAlgorithms'))) {
    const alg = String(c.get('sso.jwtAlgorithms')).trim();
    if (alg === "" || alg.toLowerCase() === "none") {
      console.warn('Attention - insecure "none" algorithm allowed to check external SSO JWT token');
    }
    if (alg) c.util.setPath(c, ['sso', 'jwtAlgorithms'], [alg]);
    else c.util.setPath(c, ['sso', 'jwtAlgorithms'], "");
  }

  if (errCount > 0) {
    throw new Error(`Configuration invalid - ${errCount} errors found.`);
  }
}

/** Get default Redis sentinel group name from config
 *  This method checks if a string is given as input and returns this, otherwise
 *  the default value from config files is used
 *
 *  @param {string|null} sentinelName possible sentinel group name to use or null
 *  @return {string} default name from config for sentinel groups
 */
function getRedisSentinelGroupName(sentinelName) {
  return sentinelName || require('config').get('redis.defaultSentinelGroup');
}


/** Parse a string with redis sentinel servers and ports to an objects as needed
 *  by ioredis for connections.
 *
 *  Allowed formats are:
 *  <ul>
 *    <li>comma separated list of <code>hostname:port</code> values, port is optional</li>
 *    <li>JSON-String with list of <code>hostname:port</code> string entries</li>
 *    <li>JSON-String with list of sentinel objects <code>{"host":"localhost", "port": 26379}</code>
 *  </ul>
 *
 *  The return value is a list with sentinel objects, e.g.: <code>{"host":"localhost", "port": 26379}</code>.
 *  The list is sorted (needed for easier comparison if this connection is already known)
 *
 *  @param {string} key configuration key
 *  @param {string} sentinelsString string or list object to check for valid sentinel connection data
 *  @return {object} ioredis sentinel list
 *  @private
 */
function parseRedisSentinel(key, sentinelsString) {
  if (!sentinelsString) return [];

  // convert array entries from string to object if needed
  if (Array.isArray(sentinelsString)) {
    sentinelsString.forEach(function(entry, index) {
      if (typeof entry === 'string') {
        const tmp = entry.trim().split(':');
        sentinelsString[index] = {host: tmp[0].toLowerCase(), port: parseInt(tmp[1])};
      }
    });
    return sentinelsString.sort((i1, i2) => ((i1.host.toLowerCase()) > i2.host.toLowerCase() || i1.port - i2.port));
  }

  if (typeof sentinelsString !== 'string') {
    throw new Error(`Invalid type for key ${key}: must be either comma separated string with sentinels or list of them`);
  }

  try {
    const sentinels = [];
    if (sentinelsString.startsWith('[')) {
      const obj = JSON.parse(sentinelsString);
      obj.forEach(function(sentinel) {
        if (typeof sentinel === 'object') sentinels.push(sentinel);
        else {
          const tmp = sentinel.trim().split(':');
          sentinels.push({host: tmp[0].toLowerCase(), port: parseInt(tmp[1])});
        }
      });
    }
    else {
      // simple string, comma separated list of host:port
      const obj = sentinelsString.split(',');
      obj.forEach(function(sentinel) {
        if (sentinel && sentinel.trim()) {
          const tmp = sentinel.trim().split(':');
          sentinels.push({host: tmp[0].toLowerCase(), port: parseInt(tmp[1])});
        }
      });
    }
    return sentinels.sort((i1, i2) => ((i1.host.toLowerCase()) > i2.host.toLowerCase() || i1.port - i2.port));
  }
  catch (e) {
    throw new Error(`Invalid type for key ${key}: Cannot parse redis sentinels string - ${e.message}`);
  }
}


exports.split = split;
exports.distinct = distinct;
exports.decodeHTMLEntities = decodeHTMLEntities;
exports.encodeHTMLEntities = encodeHTMLEntities;
exports.addElement = addElement;

exports.createRedisClient = createRedisClient;

exports.hasDeprecatedConfig = hasDeprecatedConfig;
exports.getDeprecatedConfig = getDeprecatedConfig;
exports.getDeprecatedConfigPath = getDeprecatedConfigPath;
exports.deleteDeprecatedConfig = deleteDeprecatedConfig;
exports.migrateDeprecatedConfig = migrateDeprecatedConfig;

exports.containsConnection = containsConnection;
exports.findConnection = findConnection;
exports.replaceConnection = replaceConnection;
exports.saveConnections = saveConnections;
exports.convertConnectionInfoForUI = convertConnectionInfoForUI;
exports.saveLocalConfig = saveLocalConfig;
exports.deleteConfig = deleteConfig;
exports.validateConfig = validateConfig;
exports.getRedisSentinelGroupName = getRedisSentinelGroupName;
exports.parseRedisSentinel = parseRedisSentinel;
