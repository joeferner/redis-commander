'use strict';
var fs = require('fs');
var path = require('path');

exports.split = function (str) {
  var results = [];
  var word = '';
  var validWord;
  for (var i = 0; i < str.length;) {
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
};

exports.distinct = function (items) {
  var hash = {};
  items.forEach(function (item) {
    hash[item] = true;
  });
  var result = [];
  for (var item in hash) {
    result.push(item);
  }
  return result;
};

var encodeHTMLEntities = function (string, callback) {
  callback(string.replace(/[\u00A0-\u2666<>\&]/g, function (c) {
    return '&' +
      (encodeHTMLEntities.entityTable[c.charCodeAt(0)] || '#' + c.charCodeAt(0)) + ';';
  }));
};

exports.encodeHTMLEntities = encodeHTMLEntities;

encodeHTMLEntities.entityTable = {
  34: 'quot',
  38: 'amp',
  39: 'apos',
  60: 'lt',
  62: 'gt'
};
var decodeHTMLEntities = function (string, callback) {
  callback(string.replace(/\&(\w)*\;/g, function (c) {
    return String.fromCharCode(decodeHTMLEntities.entityTable[c.substring(1, c.indexOf("\;"))]);
  }));
};

exports.decodeHTMLEntities = decodeHTMLEntities;

decodeHTMLEntities.entityTable = {
  'quot': 34,
  'amp': 38,
  'apos': 39,
  'lt': 60,
  'gt': 62
};

//Gets the last element of an array.
exports.addElement = function (newElem, callback) {
  this.push(newElem);
  return callback(this);
};

//Config Util functions
exports.getConfig = function (callback) {
  var configPath = getConfigPath();
  fs.readFile(configPath, 'utf8', function (err, data) {
    if (err) {
      callback(err);
      return;
    }
    var config;
    try {
      config = JSON.parse(data);
    } catch (e) {
      callback('Failed to unserialize configuration at ' + configPath + ': ' + e.message);
      return;
    }
    callback(null, config);
  });
};

exports.saveConfig = function (config, callback) {
  fs.writeFile(getConfigPath(), JSON.stringify(config), function (err) {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
};

exports.deleteConfig = function (callback) {
  fs.unlink(getConfigPath(), function (err) {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
};

exports.defaultConfig = function() {
  return {
    "sidebarWidth": 250,
    "locked": false,
    "CLIHeight": 50,
    "CLIOpen": false,
    "default_connections": []
  };
};

exports.containsConnection = function(connections, object) {
  var contains = false;
  connections.forEach(function (element) {
    if (element.host === object.host && element.port == object.port) {
      // dbIndex for configuration item
      // db for ioredis client options object
      if (typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) {
        contains = true;
      }
      else if (typeof element.db !== 'undefined' && element.db == object.dbIndex) {
        contains = true;
      }
    }
  });
  return contains;
};

function getConfigPath () {
  var homePath = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  if (typeof homePath === 'undefined') {
    console.log('Home directory not found for configuration file. Using current directory as fallback.');
    homePath = '.';
  }
  return path.join(homePath, '.redis-commander');
}
