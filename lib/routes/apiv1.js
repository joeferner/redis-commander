'use strict';

var sf = require('sf');
var async = require('async');
var inflection = require('inflection');
var myutil = require('../util');
var foldingCharacter = ":";

module.exports = function (app) {
  app.get('/apiv1/server/info', getServersInfo);
  app.get('/apiv1/key/:connectionId/:key/:index?', getKeyDetails);
  app.post('/apiv1/key/:connectionId/:key', postKey);
  app.post('/apiv1/keys/:connectionId/:key', postKeys);
  app.post('/apiv1/listvalue/', postAddListValue);
  app.post('/apiv1/setmember/', postAddSetMember);
  app.post('/apiv1/editListRow', postEditListRow);
  app.post('/apiv1/editSetMember', postEditSetMember);
  app.post('/apiv1/editZSetRow', postEditZSetRow);
  app.post('/apiv1/editHashRow', postEditHashRow);
  app.get('/apiv1/keystree/:connectionId/:keyPrefix', getKeysTree);
  app.get('/apiv1/keystree/:connectionId', getKeysTree);
  app.get('/apiv1/keys/:connectionId/:keyPrefix', getKeys);
  app.post('/apiv1/exec', postExec);
  app.get('/apiv1/connection', isConnected);
};

function isConnected (req, res) {
  if (req.redisConnections[0]) {
    return res.send(true);
  }
  return res.send(false);
}

function getConnection (redisConnections, connectionId, callback) {
  var connectionIds = connectionId.split(":");
  var desiredHost = connectionIds[0];
  var desiredPort = connectionIds[1];
  var desiredDb = connectionIds[2];
  redisConnections.forEach(function (connection) {
    if (connection.host == desiredHost && connection.port == desiredPort && connection.selected_db == desiredDb) {
      return callback(null, connection);
    }
  });
}

function getServersInfo (req, res, next) {
  if (req.redisConnections.length > 0) {
    var allServerInfo = [];
    req.redisConnections.forEach(function (redisConnection, index) {
      getServerInfo(redisConnection, function (err, serverInfo) {
        if (err) {
          return next(err);
        }
        allServerInfo.push(serverInfo);
        if (index === req.redisConnections.length - 1) {
          var timeout = setInterval(function () {
            if (allServerInfo.length === req.redisConnections.length) {
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
    var infoLines = serverInfo
      .split('\n')
      .map(function (line) {
        line = line.trim();
        var parts = line.split(':');
        return {
          key: inflection.humanize(parts[0]),
          value: parts.slice(1).join(':')
        };
      });
    var connectionInfo = {
      label: redisConnection.label,
      host: redisConnection.host,
      port: redisConnection.port,
      db: redisConnection.selected_db,
      info: infoLines
    };
    return callback(null, connectionInfo);
  });

}

function postExec (req, res) {
  var cmd = req.body.cmd;
  var connectionId = req.body.connection;
  var redisConnection;
  getConnection(req.redisConnections, connectionId, function (err, connection) {
    redisConnection = connection;
  });
  var parts = myutil.split(cmd);
  if (!redisConnection[parts[0]]) {
    return res.send("ERROR: Invalid command");
  }

  var commandName = parts[0];
  var args = parts.slice(1);
  args.push(function (err, results) {
    if (err) {
      return res.send(err.message);
    }
    return res.send(JSON.stringify(results));
  });
  redisConnection[commandName].apply(redisConnection, args);
}

function getKeyDetails (req, res, next) {
  var connectionId = req.params.connectionId;
  var key = req.params.key;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
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

      var details = {
        key: key,
        type: type
      };
      res.send(JSON.stringify(details));
    });
  });
}

function getKeyDetailsString (key, redisConnection, res, next) {
  redisConnection.get(key, function (err, val) {
    if (err) {
      console.error('getKeyDetailsString', err);
      return next(err);
    }

    var details = {
      key: key,
      type: 'string',
      value: val
    };
    myutil.encodeHTMLEntities(JSON.stringify(details), function (string) {
      res.send(string);
    })
  });
}

function getKeyDetailsList (key, redisConnection, req, res, next) {
  var startIdx = parseInt(req.params.index, 10);
  if (typeof(startIdx) == 'undefined' || isNaN(startIdx) || startIdx < 0) {
    startIdx = 0;
  }
  var endIdx = startIdx + 19;
  redisConnection.lrange(key, startIdx, endIdx, function (err, items) {
    if (err) {
      console.error('getKeyDetailsList', err);
      return next(err);
    }

    var i = startIdx;
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
      var details = {
        key: key,
        type: 'list',
        items: items,
        beginning: startIdx <= 0,
        end: endIdx >= length - 1,
        length: length
      };
      myutil.encodeHTMLEntities(JSON.stringify(details), function (string) {
        res.send(string);
      })
    });
  });
}

function getKeyDetailsHash (key, redisConnection, res, next) {
  redisConnection.hgetall(key, function (err, fieldsAndValues) {
    if (err) {
      console.error('getKeyDetailsHash', err);
      return next(err);
    }

    var details = {
      key: key,
      type: 'hash',
      data: fieldsAndValues
    };
    myutil.encodeHTMLEntities(JSON.stringify(details), function (string) {
      res.send(string);
    })
  });
}

function getKeyDetailsSet (key, redisConnection, res, next) {
  redisConnection.smembers(key, function (err, members) {
    if (err) {
      console.error('getKeyDetailsSet', err);
      return next(err);
    }

    var details = {
      key: key,
      type: 'set',
      members: members
    };
    myutil.encodeHTMLEntities(JSON.stringify(details), function (string) {
      res.send(string);
    })
  });
}

function getKeyDetailsZSet (key, redisConnection, req, res, next) {
  var startIdx = parseInt(req.params.index, 10);
  if (typeof(startIdx) == 'undefined' || isNaN(startIdx) || startIdx < 0) {
    startIdx = 0;
  }
  var endIdx = startIdx + 19;
  redisConnection.zrange(key, startIdx, endIdx, 'WITHSCORES', function (err, items) {
    if (err) {
      console.error('getKeyDetailsZSet', err);
      return next(err);
    }

    items = mapZSetItems(items);

    var i = startIdx;
    items.forEach(function (item) {
      item.number = i++;
    });
    redisConnection.zcount(key, "-inf", "+inf", function (err, length) {
      var details = {
        key: key,
        type: 'zset',
        items: items,
        beginning: startIdx <= 0,
        end: endIdx >= length - 1,
        length: length
      };
      myutil.encodeHTMLEntities(JSON.stringify(details), function (string) {
        res.send(string);
      })
    });
  });
}
function postAddListValue (req, res, next) {
  var key = req.body.key;
  var value = req.body.stringValue;
  var type = req.body.type;
  var connectionId = req.body.listConnectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    addListValue(redisConnection, key, value, type, res, next);
  });
}

function postEditListRow (req, res, next) {
  var key = req.body.listKey;
  var index = req.body.listIndex;
  var value = req.body.listValue;
  var connectionId = req.body.listConnectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    editListRow(redisConnection, key, index, value, res, next);
  });
}

function postEditSetMember (req, res, next) {
  var key = req.body.setKey;
  var member = req.body.setMember;
  var oldMember = req.body.setOldMember;
  var connectionId = req.body.setConnectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    editSetMember(redisConnection, key, member, oldMember, res, next);
  });
}

function postEditZSetRow (req, res, next) {
  var key = req.body.zSetKey;
  var score = req.body.zSetScore;
  var value = req.body.zSetValue;
  var oldValue = req.body.zSetOldValue;
  var connectionId = req.body.zSetConnectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    editZSetRow(redisConnection, key, score, value, oldValue, res, next);
  });
}

function postEditHashRow (req, res, next) {
  var key = req.body.hashKey;
  var field = req.body.hashField;
  var value = req.body.hashFieldValue;
  var connectionId = req.body.hashConnectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    editHashRow(redisConnection, key, field, value, res, next);
  });
}

function postAddSetMember (req, res, next) {
  var key = req.body.setKey;
  var member = req.body.setMemberName;
  var connectionId = req.body.setConnectionId;
  getConnection(req.redisConnections, connectionId, function(err, redisConnection) {
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
  var callback = function (err) {
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
      var err = new Error("invalid type");
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
  var connectionId = req.params.connectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    if (req.query.action === 'delete') {
      deleteKey(redisConnection, req, next, res);
    } else {
      saveKey(redisConnection, req, next, res);
    }
  });
}

function saveKey (redisConnection, req, next, res) {
  var key = req.params.key;
  console.log(sf('saving key "{0}"', key));
  redisConnection.type(key, function (err, type) {
    if (err) {
      console.error('saveKey', err);
      return next(err);
    }
    var value = req.body.stringValue;
    myutil.decodeHTMLEntities(value, function (decodedString) {
      value = decodedString;
    });
    var score = parseInt(req.body.keyScore, 10);
    var formType = req.body.keyType;
    type = typeof(formType) == 'undefined' ? type : formType;
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

function deleteKey (redisConnection, req, next, res) {
  var key = req.params.key;
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
  var val = req.body.stringValue;
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
  var connectionId = req.params.connectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    var prefix = req.params.keyPrefix;
    var limit = req.params.limit || 100;
    console.log(sf('loading keys by prefix "{0}"', prefix));
    redisConnection.keys(prefix, function (err, keys) {
      if (err) {
        console.error('getKeys', err);
        return next(err);
      }
      console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

      if (keys.length > 1) {
        keys = myutil.distinct(keys.map(function (key) {
          var idx = key.indexOf(foldingCharacter, prefix.length);
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
  var connectionId = req.params.connectionId;
  var prefix = req.params.keyPrefix;
  console.log(sf('loading keys by prefix "{0}"', prefix));
  var search;
  if (prefix) {
    search = prefix + foldingCharacter + '*';
  } else {
    search = '*';
  }
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
    redisConnection.keys(search, function (err, keys) {
      if (err) {
        console.error('getKeys', err);
        return next(err);
      }
      console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

      var lookup = {};
      var reducedKeys = [];
      keys.forEach(function (key) {
        var fullKey = key;
        if (prefix) {
          key = key.substr((prefix + foldingCharacter).length);
        }
        var parts = key.split(foldingCharacter);
        var firstPrefix = parts[0];
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
            var sizeCallback = function (err, count) {
              if (err) {
                return callback(err);
              } else {
                keyData.data += " (" + count + ")";
                callback();
              }
            };
            if (type == 'list') {
              redisConnection.llen(keyData.fullKey, sizeCallback);
            } else if (type == 'set') {
              redisConnection.scard(keyData.fullKey, sizeCallback);
            } else if (type == 'zset') {
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
  var key = req.params.key;
  var connectionId = req.params.connectionId;
  getConnection(req.redisConnections, connectionId, function (err, redisConnection) {
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
  var results = [];
  for (var i = 0; i < items.length; i += 2) {
    results.push({
      score: items[i + 1],
      value: items[i]
    });
  }
  return results;
}

