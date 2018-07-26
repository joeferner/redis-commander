'use strict';

let sf = require('sf');
let async = require('async');
let inflection = require('inflection');
let myutil = require('../util');
let foldingCharacter = ":";
let rootPattern;

module.exports = function (app, urlPrefix) {
  rootPattern = app.rootPattern;
  app.get(`${urlPrefix}/apiv1/server/info`, getServersInfo);
  app.get(`${urlPrefix}/apiv1/key/:connectionId/:key/:index?`, getKeyDetails);
  app.post(`${urlPrefix}/apiv1/key/:connectionId/:key`, postKey);
  app.post(`${urlPrefix}/apiv1/keys/:connectionId/:key`, postKeys);
  app.post(`${urlPrefix}/apiv1/listvalue/`, postAddListValue);
  app.post(`${urlPrefix}/apiv1/setmember/`, postAddSetMember);
  app.post(`${urlPrefix}/apiv1/editListRow`, postEditListRow);
  app.post(`${urlPrefix}/apiv1/editSetMember`, postEditSetMember);
  app.post(`${urlPrefix}/apiv1/editZSetRow`, postEditZSetRow);
  app.post(`${urlPrefix}/apiv1/editHashRow`, postEditHashRow);
  app.post(`${urlPrefix}/apiv1/encodeString/:stringValue`, encodeString);
  app.get(`${urlPrefix}/apiv1/keystree/:connectionId/:keyPrefix`, getKeysTree);
  app.get(`${urlPrefix}/apiv1/keystree/:connectionId`, getKeysTree);
  app.get(`${urlPrefix}/apiv1/keys/:connectionId/:keyPrefix`, getKeys);
  app.post(`${urlPrefix}/apiv1/exec`, postExec);
  app.get(`${urlPrefix}/apiv1/connection`, isConnected);
};

function isConnected (req, res) {
  if (req.app.redisConnections[0]) {
    return res.send(true);
  }
  return res.send(false);
}

function getConnection (redisConnections, connectionId, callback) {
  let connectionIds = connectionId.split(":");
  let desiredHost = connectionIds[0];
  let desiredPort = parseInt(connectionIds[1]);
  let desiredDb = parseInt(connectionIds[2]);
  let con = redisConnections.find(function(connection) {
    return (connection.options.host === desiredHost && connection.options.port === desiredPort && connection.options.db === desiredDb);
  });
  if (!con) console.error('Connection with id ' + connectionId + ' not found.');
  return callback(null, con);
}

function getServersInfo (req, res, next) {
  if (req.app.redisConnections.length > 0) {
    let allServerInfo = [];
    req.app.redisConnections.forEach(function (redisConnection, index) {
      getServerInfo(redisConnection, function (err, serverInfo) {
        if (err) {
          console.error(err);
          return next(err);
        }
        allServerInfo.push(serverInfo);
        if (index === req.app.redisConnections.length - 1) {
          let timeout = setInterval(function () {
            if (allServerInfo.length === req.app.redisConnections.length) {
              clearInterval(timeout);
              return res.send(JSON.stringify(allServerInfo));
            }
          }, 100);
        }
      });
    });
  } else {
    return next("No redis connection");
  }
}

function getServerInfo (redisConnection, callback) {

  redisConnection.info(function (err, serverInfo) {

    if (err) {
      console.error('getServerInfo', err);
      return callback(err);
    }
    let infoLines = serverInfo
      .split('\n')
      .map(function (line) {
        line = line.trim();
        let parts = line.split(':');
        return {
          key: inflection.humanize(parts[0]),
          value: parts.slice(1).join(':')
        };
      });
    let connectionInfo = {
      label: redisConnection.label,
      host: redisConnection.options.host,
      port: redisConnection.options.port,
      db: redisConnection.options.db,
      info: infoLines
    };
    return callback(null, connectionInfo);
  });

}

function postExec (req, res) {
  let cmd = req.body.cmd;
  let connectionId = req.body.connection;
  getConnection(req.app.redisConnections, connectionId, function (err, connection) {
    if (err || !redisConnection) printError(res, null, err, 'postExec');
    let parts = myutil.split(cmd);
    parts[0] = parts[0].toLowerCase();
    let commandName = parts[0].toLowerCase();
    if (!(commandName in connection)) {
        return res.send('ERROR: Invalid Command');
    }
    let args = parts.slice(1);
    args.push(function (err, results) {
        if (err) {
            return res.send(err.message);
        }
        return res.send(JSON.stringify(results));
    });
    connection[commandName].apply(connection, args);
  });
}

function getKeyDetails (req, res, next) {
  let connectionId = req.params.connectionId;
  let key = req.params.key;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) printError(res, null, err, 'getKeyDetails');
    console.log(sf('loading key "{0}" from "{1}"', key, connectionId));
    redisConnection.type(key, function (err, type) {
      if (err) {
        console.error('getKeyDetails', err);
        return next(err);
      }

      switch (type) {
        case 'string':
          return getKeyDetailsString(key, redisConnection, res, next);
        case 'list':
          return getKeyDetailsList(key, redisConnection, req, res, next);
        case 'zset':
          return getKeyDetailsZSet(key, redisConnection, req, res, next);
        case 'hash':
          return getKeyDetailsHash(key, redisConnection, res, next);
        case 'set':
          return getKeyDetailsSet(key, redisConnection, res, next);
      }

      let details = {
        key: key,
        type: type
      };
      res.send(JSON.stringify(details));
    });
  });
}

function sendWithTTL(details, key, redisConnection, res) {
    redisConnection.ttl(key, function (err, ttl) {
        if (err) {
            // TTL is not fatal
            console.error(err);
        }
        myutil.encodeHTMLEntities(JSON.stringify(Object.assign({ ttl }, details)), function (string) {
            res.send(string);
        });
    });
}

function getKeyDetailsString (key, redisConnection, res, next) {
  redisConnection.get(key, function (err, val) {
    if (err) {
      console.error('getKeyDetailsString', err);
      return next(err);
    }

    let details = {
      key: key,
      type: 'string',
      value: val
    };
    sendWithTTL(details, key, redisConnection, res);
  });
}

function getKeyDetailsList (key, redisConnection, req, res, next) {
  let startIdx = parseInt(req.params.index, 10);
  if (typeof(startIdx) === 'undefined' || isNaN(startIdx) || startIdx < 0) {
    startIdx = 0;
  }
  let endIdx = startIdx + 19;
  redisConnection.lrange(key, startIdx, endIdx, function (err, items) {
    if (err) {
      console.error('getKeyDetailsList', err);
      return next(err);
    }

    let i = startIdx;
    items = items.map(function (item) {
      return {
        number: i++,
        value: item
      }
    });
    redisConnection.llen(key, function (err, length) {
      if (err) {
        console.error('getKeyDetailsList', err);
        return next(err);
      }
      let details = {
        key: key,
        type: 'list',
        items: items,
        beginning: startIdx <= 0,
        end: endIdx >= length - 1,
        length: length
      };
      sendWithTTL(details, key, redisConnection, res);
    });
  });
}

function getKeyDetailsHash (key, redisConnection, res, next) {
  redisConnection.hgetall(key, function (err, fieldsAndValues) {
    if (err) {
      console.error('getKeyDetailsHash', err);
      return next(err);
    }

    let details = {
      key: key,
      type: 'hash',
      data: fieldsAndValues
    };
    sendWithTTL(details, key, redisConnection, res);
  });
}

function getKeyDetailsSet (key, redisConnection, res, next) {
  redisConnection.smembers(key, function (err, members) {
    if (err) {
      console.error('getKeyDetailsSet', err);
      return next(err);
    }

    let details = {
      key: key,
      type: 'set',
      members: members
    };
    sendWithTTL(details, key, redisConnection, res);
  });
}

function getKeyDetailsZSet (key, redisConnection, req, res, next) {
  let startIdx = parseInt(req.params.index, 10);
  if (typeof(startIdx) === 'undefined' || isNaN(startIdx) || startIdx < 0) {
    startIdx = 0;
  }
  let endIdx = startIdx + 19;
  redisConnection.zrevrange(key, startIdx, endIdx, 'WITHSCORES', function (err, items) {
    if (err) {
      console.error('getKeyDetailsZSet', err);
      return next(err);
    }

    items = mapZSetItems(items);

    let i = startIdx;
    items.forEach(function (item) {
      item.number = i++;
    });
    redisConnection.zcount(key, "-inf", "+inf", function (err, length) {
      let details = {
        key: key,
        type: 'zset',
        items: items,
        beginning: startIdx <= 0,
        end: endIdx >= length - 1,
        length: length
      };
      sendWithTTL(details, key, redisConnection, res);
    });
  });
}
function postAddListValue (req, res, next) {
  let key = req.body.key;
  let value = req.body.stringValue;
  let type = req.body.type;
  let connectionId = req.body.listConnectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postAddListValue');
    addListValue(redisConnection, key, value, type, res, next);
  });
}

function postEditListRow (req, res, next) {
  let key = req.body.listKey;
  let index = req.body.listIndex;
  let value = req.body.listValue;
  let connectionId = req.body.listConnectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postEditListRow');
    editListRow(redisConnection, key, index, value, res, next);
  });
}

function postEditSetMember (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMember;
  let oldMember = req.body.setOldMember;
  let connectionId = req.body.setConnectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postEditSetMember');
    editSetMember(redisConnection, key, member, oldMember, res, next);
  });
}

function postEditZSetRow (req, res, next) {
  let key = req.body.zSetKey;
  let score = req.body.zSetScore;
  let value = req.body.zSetValue;
  let oldValue = req.body.zSetOldValue;
  let connectionId = req.body.zSetConnectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postEditZSetRow');
    editZSetRow(redisConnection, key, score, value, oldValue, res, next);
  });
}

function postEditHashRow (req, res, next) {
  let key = req.body.hashKey;
  let field = req.body.hashField;
  let value = req.body.hashFieldValue;
  let connectionId = req.body.hashConnectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postEditHashRow');
    editHashRow(redisConnection, key, field, value, res, next);
  });
}

function postAddSetMember (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMemberName;
  let connectionId = req.body.setConnectionId;
  getConnection(req.app.redisConnections, connectionId, function(err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postAddSetMember');
    addSetMember(redisConnection, key, member, res, next);
  });
}

function addSetMember (redisConnection, key, member, res, next) {
  myutil.decodeHTMLEntities(member, function (decodedString) {
    member = decodedString;
  });
  return redisConnection.sadd(key, member, function (err) {
    if (err) {
      console.error('addSetMember', err);
      return next(err);
    }
    res.send('ok');
  });
}

function addSortedSetValue (redisConnection, key, score, value, res, next) {
  return redisConnection.zadd(key, score, value, function (err) {
    if (err) {
      console.error('addZSetValue', err);
      return next(err);
    }
    res.send('ok');
  });
}

function addListValue (redisConnection, key, value, type, res, next) {
  let callback = function (err) {
    if (err) {
      console.error('addListValue', err);
      return next(err);
    }
    return res.send('ok');
  };
  myutil.decodeHTMLEntities(value, function (decodedString) {
    value = decodedString;
  });
  switch (type) {
    case 'lpush':
      return redisConnection.lpush(key, value, callback);
    case 'rpush':
      return redisConnection.rpush(key, value, callback);
    default:
      let err = new Error("invalid type");
      console.error('addListValue', err);
      return next(err);
  }
}

function editListRow (redisConnection, key, index, value, res, next) {
  myutil.decodeHTMLEntities(value, function (decodedString) {
    value = decodedString;
    redisConnection.lset(key, index, value, function (err) {
      if (err) {
        console.error('editListRow', err);
        return next(err);
      }
      if (value === "REDISCOMMANDERTOMBSTONE") {
        redisConnection.lrem(key, 0, value, function (err) {
          if (err) {
            console.error('removeListRow', err);
            return next(err);
          }
          res.send('ok');
        });
      } else {
        res.send('ok');
      }
    });
  });
}

function editSetMember (redisConnection, key, member, oldMember, res, next) {
  myutil.decodeHTMLEntities(oldMember, function (decodedString) {
    oldMember = decodedString;

    redisConnection.srem(key, oldMember, function (err) {
      if (err) {
        console.error('editSetMember', err);
        return next(err);
      }
      if (member === "REDISCOMMANDERTOMBSTONE") {
        return res.send('ok');
      } else {
        myutil.decodeHTMLEntities(member, function (decodedString) {
          member = decodedString;
          redisConnection.sadd(key, member, function (err) {
            if (err) {
              console.error('editSetMember', err);
              return next(err);
            }
            return res.send('ok');
          });
        });
      }
    });
  });
}

function editZSetRow (redisConnection, key, score, value, oldValue, res, next) {
  myutil.decodeHTMLEntities(oldValue, function (decodedString) {
    oldValue = decodedString;

    redisConnection.zrem(key, oldValue, function (err) {
      if (err) {
        console.error('editZSetRow', err);
        return next(err);
      }
      if (value === "REDISCOMMANDERTOMBSTONE") {
        return res.send('ok');
      } else {
        myutil.decodeHTMLEntities(value, function (decodedString) {
          value = decodedString;
          redisConnection.zadd(key, score, value, function (err) {
            if (err) {
              console.error('editZSetRow', err);
              return next(err);
            }
            return res.send('ok');
          });
        });
      }
    });
  });
}

function editHashRow (redisConnection, key, field, value, res, next) {
  myutil.decodeHTMLEntities(field, function (decodedField) {
    myutil.decodeHTMLEntities(value, function (decodedValue) {
      if (value === "REDISCOMMANDERTOMBSTONE") {
        redisConnection.hdel(key, decodedField, function (err) {
          if (err) {
            console.error('editHashRow', err);
            return next(err);
          }
          return res.send('ok');
        });
      } else {
        redisConnection.hset(key, decodedField, decodedValue, function (err) {
          if (err) {
            console.error('editHashRow', err);
            return next(err);
          }
          return res.send('ok');
        })
      }
    });
  });
}


function postKey (req, res, next) {
  let connectionId = req.params.connectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postKey');
    if (req.query.action === 'delete') {
      deleteKey(redisConnection, req, next, res);
    } else if (req.query.action === 'decode') {
      decodeKey(redisConnection, req, next, res);
    } else {
      saveKey(redisConnection, req, next, res);
    }
  });
}

function saveKey (redisConnection, req, next, res) {
  let key = req.params.key;
  console.log(sf('saving key "{0}"', key));
  redisConnection.type(key, function (err, type) {
    if (err) {
      console.error('saveKey', err);
      return next(err);
    }
    let value = req.body.stringValue;
    myutil.decodeHTMLEntities(value, function (decodedString) {
      value = decodedString;
    });
    let score = parseInt(req.body.keyScore, 10);
    let formType = req.body.keyType;
    type = typeof(formType) === 'undefined' ? type : formType;
    switch (type) {
      case 'string':
      case 'none':
        return posKeyDetailsString(redisConnection, key, req, res, next);
      case 'list':
        return addListValue(redisConnection, key, value, 'lpush', res, next);
      case 'set':
        return addSetMember(redisConnection, key, value, res, next);
      case 'zset':
        return addSortedSetValue(redisConnection, key, score, value, res, next);
      default:
        return next(new Error("Unhandled type " + type));
    }
  });
}

function decodeKey (redisConnection, req, next, res) {
  let key = req.params.key;

  redisConnection.get(key, function (err, val) {
    if (err) {
      console.error('decodeKey', err);
      return next(err);
    }

    let decoded = "";

    if (typeof Buffer.toString === "function") {
      // Node 5.10+
      decoded = Buffer(val, "base64").toString("ascii");
    } else {
      // older Node versions
      decoded = new Buffer(val, "base64").toString("ascii");
    }

    return res.send(decoded)
  });
}

function encodeString (req, res, next) {
  let val = req.params.stringValue;
  let encoded = "";

  if (typeof Buffer.from === "function") {
    // Node 5.10+
    encoded = Buffer(val).toString('base64');
  } else {
    // older Node versions
    encoded = new Buffer(val).toString('base64');
  }

  return res.send(encoded)
}

function deleteKey (redisConnection, req, next, res) {
  let key = req.params.key;
  console.log(sf('deleting key "{0}"', key));
  redisConnection.del(key, function (err) {
    if (err) {
      console.error('deleteKey', err);
      return next(err);
    }

    return res.send('ok');
  });
}

function posKeyDetailsString (redisConnection, key, req, res, next) {
  let val = req.body.stringValue;
  myutil.decodeHTMLEntities(val, function (decodedString) {
    val = decodedString;
    console.log("after:", val);
  });
  redisConnection.set(key, val, function (err) {
    if (err) {
      console.error('posKeyDetailsString', err);
      return next(err);
    }
    res.send('OK');
  });
}

function getKeys (req, res, next) {
  let connectionId = req.params.connectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'getKeys');
    let prefix = req.params.keyPrefix;
    let limit = req.params.limit || 100;
    console.log(sf('loading keys by prefix "{0}"', prefix));
    redisConnection.keys(prefix, function (err, keys) {
      if (err) {
        console.error('getKeys', err);
        return next(err);
      }
      console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

      if (keys.length > 1) {
        keys = myutil.distinct(keys.map(function (key) {
          let idx = key.indexOf(foldingCharacter, prefix.length);
          if (idx > 0) {
            return key.substring(0, idx + 1);
          }
          return key;
        }));
      }

      if (keys.length > limit) {
        keys = keys.slice(0, limit);
      }

      keys = keys.sort();
      res.send(JSON.stringify(keys));
    });
  });
}

function getKeysTree (req, res, next) {
  let connectionId = req.params.connectionId;
  let prefix = req.params.keyPrefix;
  console.log(sf('loading keys by prefix "{0}"', prefix));
  let search;
  if (prefix) {
    search = prefix.replace("*", "\\*") + foldingCharacter + '*';
  } else {
    search = rootPattern;
  }
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
      if (err || !redisConnection) return printError(res, next, err, 'getKeysTree');
      redisConnection.keys(search, function (err, keys) {
      if (err) {
        console.error('getKeys', err);
        return next(err);
      }
      console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

      let lookup = {};
      let reducedKeys = [];
      keys.forEach(function (key) {
        let fullKey = key;
        if (prefix) {
          key = key.substr((prefix + foldingCharacter).length);
        }
        let parts = key.split(foldingCharacter);
        let firstPrefix = parts[0];
        if (lookup.hasOwnProperty(firstPrefix)) {
          lookup[firstPrefix].count++;
        } else {
          lookup[firstPrefix] = {
            attr: { id: firstPrefix },
            count: parts.length === 1 ? 0 : 1
          };
          lookup[firstPrefix].fullKey = fullKey;
          if (parts.length === 1) {
            lookup[firstPrefix].leaf = true;
          }
          reducedKeys.push(lookup[firstPrefix]);
        }
      });

      reducedKeys.forEach(function (data) {
        if (data.count === 0) {
          data.data = data.attr.id;
        } else {
          data.data = data.attr.id + ":* (" + data.count + ")";
          data.state = "closed";
        }
      });

      async.forEachLimit(reducedKeys, 10, function (keyData, callback) {
        if (keyData.leaf) {
          redisConnection.type(keyData.fullKey, function (err, type) {
            if (err) {
              return callback(err);
            }
            keyData.attr.rel = type;
            let sizeCallback = function (err, count) {
              if (err) {
                return callback(err);
              } else {
                keyData.data += " (" + count + ")";
                callback();
              }
            };
            if (type === 'list') {
              redisConnection.llen(keyData.fullKey, sizeCallback);
            } else if (type === 'set') {
              redisConnection.scard(keyData.fullKey, sizeCallback);
            } else if (type === 'zset') {
              redisConnection.zcard(keyData.fullKey, sizeCallback);
            } else {
              callback();
            }
          });
        } else {
          callback();
        }
      }, function (err) {
        if (err) {
          console.error('getKeys', err);
          return next(err);
        }
        reducedKeys = reducedKeys.sort(function (a, b) {
          return a.data > b.data ? 1 : -1;
        });
        res.send(JSON.stringify(reducedKeys));
      });
    });
  });
}

function postKeys (req, res, next) {
  let key = req.params.key;
  let connectionId = req.params.connectionId;
  getConnection(req.app.redisConnections, connectionId, function (err, redisConnection) {
    if (err || !redisConnection) return printError(res, next, err, 'postKeys');
    if (req.query.action === 'delete') {
      deleteKeys(key, redisConnection, res, next);
    } else {
      next(new Error("Invalid action '" + req.query.action + "'"));
    }
  });
}

function deleteKeys (keyQuery, redisConnection, res, next) {
  redisConnection.keys(keyQuery, function (err, keys) {
    if (err) {
      console.error('deleteKeys', err);
      return next(err);
    }

    async.forEachLimit(keys, 10, function (key, callback) {
      redisConnection.del(key, callback);
    }, function (err) {
      if (err) {
        console.error('deleteKeys', err);
        return next(err);
      }
      return res.send('ok');
    })
  });
}

function mapZSetItems (items) {
  let results = [];
  for (let i = 0; i < items.length; i += 2) {
    results.push({
      score: items[i + 1],
      value: items[i]
    });
  }
  return results;
}

function printError(res, next, err, errFuncName) {
    console.error('On ' + errFuncName + ': - no connection');
    if (err) {
        console.error('Got error ' + JSON.stringify(err));
        return (typeof next === 'function') ? next(err) : res.send('ERROR: Invalid Connection: ' + JSON.stringify(err));
    }
    else {
        return res.send('ERROR: Invalid Connection');
    }
}
