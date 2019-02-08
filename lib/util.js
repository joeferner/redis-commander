'use strict';

let fs = require('fs');
let path = require('path');
let os = require('os');

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


// functions related to new config files from node-config
// ==========
function saveConnections(config, callback) {
  // only save "connections" part, nothing else from config object
  let saveCfg = {
    connections: config.util.toObject(config.connections)
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
  let cfgPath = getConfigPath(configFile);
  if (fs.existsSync(cfgPath)) {
    fs.unlink(cfgPath, function(err) {
      callback(err);
    });
  }
  else {
    callback(null);
  }
}


function containsConnection(connections, object) {
  return connections.some(function (element) {
    if (element.host === object.host && element.port == object.port) {
      // dbIndex for configuration item
      // db for ioredis client options object
      if (typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) {
        return true;
      }
      else if (typeof element.db !== 'undefined' && element.db == object.dbIndex) {
        return true;
      }
    }
    return false;
  });
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
  let c = require('config');
  let configPath = c.util.getEnv('NODE_CONFIG_DIR');
  if (configFile === 'local') {
    return path.join(configPath, 'local.json');
  }
  else {  // connections
    return path.join(configPath, 'local-' + c.util.getEnv('NODE_ENV') + '.json');
  }
}


function validateConfig() {
  let c = require('config');
  let errCount = 0;

  let hasError = function(msg) {
    errCount++;
    console.error(msg);
  };

  let convertBoolean = function(key) {
    if (c.has(key)) {
      let value = c.get(key);
      switch (typeof value) {
        case 'boolean':
          return;

        case 'number':
          if (value === 0) c.util.setPath(c, key.split('.'), false);
          else if (value === 1) c.util.setPath(c, key.split('.'), true);
          else hasError('config key "' + key + '" has invalid value. key must be boolean!');
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
              hasError('config key "' + key + '" has invalid value. key must be boolean!');
          }
          break;

        default:
          hasError('config key "' + key + '" has invalid value. key must be boolean!');
      }
    }
  };

  let convertNumbers = function(key) {
    if (c.has(key)) {
      let value = c.get(key);
      switch (typeof value) {
        case 'number':
          return;
        case 'string':
          if (isNaN(value))
            return hasError('config key "' + key + '" has invalid value (current: ' + value + '). Key must be number!');

          c.util.setPath(c, key.split('.'), Number(value));
          break;
        default:
          return hasError('config key "' + key + '" has invalid value (current: ' + value + '). key must be number!');
      }
    }
  };

  let validateNumbers = function(key, isInteger, minValue, maxValue) {
    if (c.has(key)) {
      let value = c.get(key);
      if (isInteger && !Number.isInteger(value))
        return hasError('config key "' + key + '" value (current: ' + value + ') must be an integer number!');

      if (value < minValue || value > maxValue)
        return hasError('config key "' + key + '" value (current: ' + value + ') must be in range ' +
            minValue + ' - ' + maxValue + '!');
    }
  };

  // hard-coded list of all boolean config values so far...
  // try to convert if string or similiar to "real" boolean.
  // is a string if set via env var, boolean for json config file
  ['noSave', 'noLogData', 'ui.locked', 'ui.cliOpen', 'redis.flushOnImport', 'redis.readOnly', 'redis.useScan'].forEach(convertBoolean);

  // convert numbers and check if within valid range (e.g. ports)
  ['ui.sidebarWidth', 'ui.cliHeight', 'redis.scanCount', 'server.port'].forEach(convertNumbers);

  validateNumbers('ui.sidebarWidth', true, 1, Number.MAX_VALUE);
  validateNumbers('ui.cliHeight', true, 1, Number.MAX_VALUE);
  validateNumbers('redis.scanCount', true, 0, Number.MAX_VALUE);
  validateNumbers('server.port', true, 1, 65535);

  // validation of numbers at connections specific settings
  for (let index = 0; index < c.get('connections').length; ++index) {
    convertNumbers('connections.' + index + '.dbIndex');
    validateNumbers('connections.' + index + '.dbIndex', true, 0, Number.MAX_VALUE); // we do not know real server config, allow max...
    convertNumbers('connections.' + index + '.port');
    validateNumbers('connections.' + index + '.port', true, 1, 65535);

    // special case tsl, can either be a boolean or object or stringified JSON
    let tlsKey = 'connections.' + index + '.tls';
    if (c.has(tlsKey)) {
      let tlsProp = c.get(tlsKey);
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
              hasError('Invalid type for key ' + tlsKey + ': must be either boolean or object with tls socket params or json parsable string');
            }
          }
          else convertBoolean(tlsKey);
          break;
        default:
          hasError('Invalid type for key ' + tlsKey + ': must be either boolean or object with tls socket params');
      }
    }
  }

  if (errCount > 0) {
    throw new Error('Configuration invalid - ' + errCount + ' errors found.');
  }
}


exports.split = split;
exports.distinct = distinct;
exports.decodeHTMLEntities = decodeHTMLEntities;
exports.encodeHTMLEntities = encodeHTMLEntities;
exports.addElement = addElement;

exports.hasDeprecatedConfig = hasDeprecatedConfig;
exports.getDeprecatedConfig = getDeprecatedConfig;
exports.getDeprecatedConfigPath = getDeprecatedConfigPath;
exports.deleteDeprecatedConfig = deleteDeprecatedConfig;
exports.migrateDeprecatedConfig = migrateDeprecatedConfig;

exports.containsConnection = containsConnection;
exports.saveConnections = saveConnections;
exports.saveLocalConfig = saveLocalConfig;
exports.deleteConfig = deleteConfig;
exports.validateConfig = validateConfig;
