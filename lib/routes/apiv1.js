'use strict';

let sf = require('sf');
let async = require('async');
let inflection = require('inflection');
let myutil = require('../util');
let foldingCharacter;
let rootPattern;
const tombStone = "REDISCOMMANDERTOMBSTONE";

module.exports = function (app) {
  rootPattern = app.locals.rootPattern;
  foldingCharacter = app.locals.foldingCharacter;
  const express = require('express');
  const routerV1 = express.Router();
  const routerV2 = express.Router();

  // ATTN: behaviour of (*) in route name will change in Express 5.x
  //   https://github.com/expressjs/express/issues/2495
  //
  // syntax /key/:key(*) is used to allow redis keys with "/" in it too
  // example: redis key a/b/c -> url /key/a/b/c -> param key='a/b/c'
  // route tester ui: https://wesleytodd.github.io/express-route-tester/
  routerV1.get('/server/info', getServersInfo);
  // moved index url param to query param to allow keys with '/'
  routerV1.get('/key/:connectionId/:key(*)', getKeyDetails);
  routerV1.post('/key/:connectionId/:key(*)', postKey);
  routerV1.post('/keys/:connectionId/:key(*)', postKeys);

  // modify entries - legacy api
  routerV1.post('/listvalue/', postAddListValueOld);
  routerV1.post('/setmember/', postAddSetMemberOld);
  routerV1.post('/editListValue', postEditListValueOld);
  routerV1.post('/editSetMember', postEditSetMemberOld);
  routerV1.post('/editZSetMember', postEditZSetMemberOld);
  routerV1.post('/editHashRow', postEditHashFieldOld);

  // helpers and get values
  routerV1.post('/encodeString/:stringValue', encodeString);
  routerV1.get('/keystree/:connectionId/:keyPrefix(*)', getKeysTree);
  routerV1.get('/keystree/:connectionId', getKeysTree);
  routerV1.get('/keys/:connectionId/:keyPrefix(*)', getKeys);
  routerV1.post('/exec/:connectionId', postExec);
  routerV1.get('/connection', isConnected);

  routerV1.param('connectionId', getConnection);

  // ================
  // new version 2 api, routes to modify redis entries has changed
  // ================
  // common functions and key retrieval identical to v1 api
  routerV2.get('/server/info', getServersInfo);
  routerV2.get('/key/:connectionId/:key(*)', getKeyDetails);
  routerV2.post('/key/:connectionId/:key(*)', postKey);
  routerV2.post('/keys/:connectionId/:key(*)', postKeys);
  // modify entries - newer api with post/put/del and additional POST equivalents
  // and unified form params

  routerV2.post('/list/value', postAddListValue);
  routerV2.put('/list/value', postEditListValue);
  routerV2.delete('/list/value', postDeleteListValue);
  routerV2.post('/list/value/add', postAddListValue);
  routerV2.post('/list/value/edit', postEditListValue);
  routerV2.post('/list/value/delete', postDeleteListValue);

  routerV2.post('/set/member', postAddSetMember);
  routerV2.put('/set/member', postEditSetMember);
  routerV2.delete('/set/member', postDeleteSetMember);
  routerV2.post('/set/member/add', postAddSetMember);
  routerV2.post('/set/member/edit', postEditSetMember);
  routerV2.post('/set/member/delete', postDeleteSetMember);

  routerV2.post('/zset/member', postAddZSetMember);
  routerV2.put('/zset/member', postEditZSetMember);
  routerV2.delete('/zset/member', postDeleteZSetMember);
  routerV2.post('/zset/member/add', postAddZSetMember);
  routerV2.post('/zset/member/edit', postEditZSetMember);
  routerV2.post('/zset/member/delete', postDeleteZSetMember);

  routerV2.post('/hash/field', postAddHashField);
  routerV2.put('/hash/field', postEditHashField);
  routerV2.delete('/hash/field', postDeleteHashField);
  routerV2.post('/hash/field/add', postAddHashField);
  routerV2.post('/hash/field/edit', postEditHashField);
  routerV2.post('/hash/field/delete', postDeleteHashField);

  // helpers and stuff same as v1 api
  routerV2.post('/encodeString/:stringValue', encodeString);
  routerV2.get('/keystree/:connectionId/:keyPrefix(*)', getKeysTree);
  routerV2.get('/keystree/:connectionId', getKeysTree);
  routerV2.get('/keys/:connectionId/:keyPrefix(*)', getKeys);
  routerV2.post('/exec/:connectionId', postExec);
  routerV2.get('/connection', isConnected);

  routerV2.param('connectionId', getConnection);

  return {
    apiv1: routerV1,
    apiv2: routerV2
  };
};

function isConnected (req, res) {
  if (req.app.locals.redisConnections[0]) {
    return res.send(true);
  }
  return res.send(false);
}

/** method called to extract url parameter 'connectionId' from all routes.
 *  The connection object found is attached to the res.locals.connection variable for all
 *  following routes to work with. The connectionId param is attached to res.locals.connectionId.
 *
 *  This method exits with JSON error response if no connection is found.
 *
 * @param {object} req Express request object
 * @param {object} res Express response object
 * @param {function} next The next middleware function to call
 * @param {string} connectionId The value of the connectionId parameter.
 */
function getConnection (req, res, next, connectionId) {
  let connectionIds = connectionId.split(":");
  let desiredHost = connectionIds[0];
  let desiredPort = parseInt(connectionIds[1]);
  let desiredDb = parseInt(connectionIds[2]);
  let con = req.app.locals.redisConnections.find(function(connection) {
    return (connection.options.host === desiredHost && connection.options.port === desiredPort && connection.options.db === desiredDb);
  });
  if (con) {
    res.locals.connection = con;
    res.locals.connectionId = connectionId;
  }
  else {
    console.error('Connection with id ' + connectionId + ' not found.');
    return printError(res, next, null, req.originalUrl);
  }
  next();
}


function getServersInfo (req, res, next) {
  if (req.app.locals.redisConnections.length > 0) {
    let allServerInfo = [];
    // change from Array.forEach to async.each to not error out if one connection is not available atm!
    async.each(req.app.locals.redisConnections, function (redisConnection, callback) {
      let redis = redisConnection;
      getServerInfo(redisConnection, function (err, serverInfo) {
        if (err) {
          console.error('Error checking info for a connection: ' + serverInfo.host + ':' +
              serverInfo.port + ':' + serverInfo.db + ' - ' + JSON.stringify(err));
          // add if basic info is available, mark as unavailble
          if (serverInfo) {
            serverInfo.disabled = true;
            allServerInfo.push(serverInfo);
          }
          return callback(null)
        }
        allServerInfo.push(serverInfo);
        callback(null);
      });
    }, function(errObj) {
      // ignore errors, just send (possible) empty array
      return res.send(JSON.stringify(allServerInfo));
    });
  } else {
    return next("No redis connections");
  }
}

function getServerInfo (redisConnection, callback) {

  redisConnection.info(function (err, serverInfo) {

    let connectionInfo = {
        label: redisConnection.label,
        host: redisConnection.options.host,
        port: redisConnection.options.port,
        db: redisConnection.options.db,
    };
    if (err) {
      console.error('getServerInfo', err);
      connectionInfo.error = err.message;
      return callback(err, connectionInfo);
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
    connectionInfo.info = infoLines;
    return callback(null, connectionInfo);
  });

}

function postExec (req, res) {
  let cmd = req.body.cmd;
  let connection = res.locals.connection;
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
}

function getKeyDetails (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;
  console.log(sf('loading key "{0}" from "{1}"', key, res.locals.connectionId));
  redisConnection.type(key, function (err, type) {
    if (err) {
      console.error('getKeyDetails', err);
      return next(err);
    }

    switch (type) {
      case 'string':
        return getKeyDetailsString(key, res, next);
      case 'list':
        return getKeyDetailsList(key, req, res, next);
      case 'zset':
        return getKeyDetailsZSet(key, req, res, next);
      case 'hash':
        return getKeyDetailsHash(key, res, next);
      case 'set':
        return getKeyDetailsSet(key, res, next);
    }

    let details = {
      key: key,
      type: type
    };
    res.send(JSON.stringify(details));
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

function getKeyDetailsString (key, res, next) {
  let redisConnection = res.locals.connection;
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

function getKeyDetailsList (key, req, res, next) {
  let redisConnection = res.locals.connection;
  let startIdx = parseInt(req.query.index, 10);
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

function getKeyDetailsHash (key, res, next) {
  let redisConnection = res.locals.connection;
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

function getKeyDetailsSet (key, res, next) {
  let redisConnection = res.locals.connection;
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

function getKeyDetailsZSet (key, req, res, next) {
  let redisConnection = res.locals.connection;
  let startIdx = parseInt(req.query.index, 10);
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

// legacy
function postAddListValueOld (req, res, next) {
  let key = req.body.key;
  let value = req.body.stringValue;
  let type = req.body.type;
  let connectionId = req.body.listConnectionId;
  getConnection(req, res, function () {
    addListValue(key, value, type, res, next);
  }, connectionId);
}

function postEditListValueOld (req, res, next) {
  let key = req.body.listKey;
  let index = req.body.listIndex;
  let value = req.body.listValue;
  let connectionId = req.body.listConnectionId;
  getConnection(req, res, function () {
    editListValue(key, index, value, res, next);
  }, connectionId);
}

function postAddSetMemberOld (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMemberName;
  let connectionId = req.body.setConnectionId;
  getConnection(req, res, function() {
    addSetMember(key, member, res, next);
  }, connectionId);
}

function postEditSetMemberOld (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMember;
  let oldMember = req.body.setOldMember;
  let connectionId = req.body.setConnectionId;
  getConnection(req, res, function () {
    editSetMember(key, member, oldMember, res, next);
  }, connectionId);
}

function postEditZSetMemberOld (req, res, next) {
  let key = req.body.zSetKey;
  let score = req.body.zSetScore;
  let value = req.body.zSetValue;
  let oldValue = req.body.zSetOldValue;
  let connectionId = req.body.zSetConnectionId;
  getConnection(req, res, function () {
    editZSetMember(key, score, value, oldValue, res, next);
  }, connectionId);
}

function postEditHashFieldOld (req, res, next) {
    let key = req.body.hashKey;
    let field = req.body.hashField;
    let value = req.body.hashFieldValue;
    let connectionId = req.body.hashConnectionId;
    getConnection(req, res, function () {
        editHashField(key, field, value, res, next);
    }, connectionId);
}

// legacy api end
// ===================


// ===================
// new v2
// ===================
// list
function postAddListValue (req, res, next) {
    let key = req.body.key;
    let value = req.body.value;
    let type = req.body.type;
    let connectionId = req.body.connectionId;
    getConnection(req, res, function () {
        addListValue(key, value, type, res, next);
    }, connectionId);
}

function postEditListValue (req, res, next) {
    let key = req.body.key;
    let index = req.body.index;
    let value = req.body.value;
    let connectionId = req.body.connectionId;
    getConnection(req, res, function () {
        editListValue(key, index, value, res, next);
    }, connectionId);
}

function postDeleteListValue (req, res, next) {
    let key = req.body.key;
    let index = req.body.index;
    let value = tombStone;
    let connectionId = req.body.connectionId;
    getConnection(req, res, function () {
        editListValue(key, index, value, res, next);
    }, connectionId);
}

// sorted set
function postAddZSetMember (req, res, next) {
    let key = req.body.key;
    let score = req.body.score;
    let value = req.body.value;
    let connectionId = req.body.connectionId;
    getConnection(req, res, function () {
        addZSetMember(key, score, value, res, next);
    }, connectionId);
}

function postEditZSetMember (req, res, next) {
  let key = req.body.key;
  let score = req.body.score;
  let value = req.body.value;
  let oldValue = req.body.oldValue;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
      editZSetMember(key, score, value, oldValue, res, next);
  }, connectionId);
}

function postDeleteZSetMember (req, res, next) {
  let key = req.body.key;
  let value = tombStone;
  let oldValue = req.body.value;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
      editZSetMember(key, 0, value, oldValue, res, next);
  }, connectionId);
}

// hash
function postAddHashField (req, res, next) {
  postEditHashField(req, res, next);
}

function postEditHashField (req, res, next) {
  let key = req.body.key;
  let field = req.body.field;
  let value = req.body.value;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
    editHashField(key, field, value, res, next);
  }, connectionId);
}

function postDeleteHashField (req, res, next) {
  let key = req.body.key;
  let field = req.body.field;
  let value = tombStone;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
      editHashField(key, field, value, res, next);
  }, connectionId);
}

// set
function postAddSetMember (req, res, next) {
  let key = req.body.key;
  let member = req.body.value;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function() {
    addSetMember(key, member, res, next);
  }, connectionId);
}

function postEditSetMember (req, res, next) {
  let key = req.body.key;
  let value = req.body.value;
  let oldValue = req.body.oldValue;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
    editSetMember(key, value, oldValue, res, next);
  }, connectionId);
}

function postDeleteSetMember (req, res, next) {
  let key = req.body.key;
  let value = tombStone;
  let oldValue = req.body.value;
  let connectionId = req.body.connectionId;
  getConnection(req, res, function () {
    editSetMember(key, value, oldValue, res, next);
  }, connectionId);
}

// end new api v2
// ========


function addSetMember (key, member, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(member, function (decodedString) {
    return redisConnection.sadd(key, decodedString, function (err) {
        if (err) {
            console.error('addSetMember', err);
            return next(err);
        }
        res.send('ok');
    });
  });
}


function addListValue (key, value, type, res, next) {
  let redisConnection = res.locals.connection;
  let callback = function (err) {
    if (err) {
      console.error('addListValue', err);
      return next(err);
    }
    return res.send('ok');
  };
  myutil.decodeHTMLEntities(value, function (decodedString) {
    switch (type) {
      case 'lpush':
          return redisConnection.lpush(key, decodedString, callback);
      case 'rpush':
          return redisConnection.rpush(key, decodedString, callback);
      default:
          let err = new Error("invalid type");
          console.error('addListValue', err);
          return next(err);
    }
  });
}

function editListValue (key, index, value, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(value, function (decodedString) {
    value = decodedString;
    // for deletion - first set this specific index to TOMBSTONE and than delete all TOMBSTONES
    // otherwise all list entries with this old value will be deleted...
    redisConnection.lset(key, index, value, function (err) {
      if (err) {
        console.error('editListValue', err);
        return next(err);
      }
      if (value === tombStone) {
        redisConnection.lrem(key, 0, value, function (err) {
          if (err) {
            console.error('removeListValue', err);
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

function editSetMember (key, member, oldMember, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(oldMember, function (decodedString) {
    oldMember = decodedString;

    redisConnection.srem(key, oldMember, function (err) {
      if (err) {
        console.error('editSetMember', err);
        return next(err);
      }
      if (member === tombStone) {
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

function addZSetMember (key, score, value, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(value, function (decodedString) {
    value = decodedString;
    redisConnection.zadd(key, score, value, function (err) {
      if (err) {
        console.error('addZSetMember', err);
        return next(err);
      }
      return res.send('ok');
    });
  });
}

function editZSetMember (key, score, value, oldValue, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(oldValue, function (decodedString) {
    oldValue = decodedString;

    redisConnection.zrem(key, oldValue, function (err) {
      if (err) {
        console.error('editZSetMember', err);
        return next(err);
      }
      if (value === tombStone) {
        return res.send('ok');
      } else {
        addZSetMember(key, score, value, res, next);
      }
    });
  });
}

function editHashField (key, field, value, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(field, function (decodedField) {
    myutil.decodeHTMLEntities(value, function (decodedValue) {
      if (value === tombStone) {
        redisConnection.hdel(key, decodedField, function (err) {
          if (err) {
            console.error('editHashField', err);
            return next(err);
          }
          return res.send('ok');
        });
      } else {
        redisConnection.hset(key, decodedField, decodedValue, function (err, count) {
          if (err) {
            console.error('editHashField', err);
            return next(err);
          }
          // count = 0 - field modified, 1 - field added
          return res.send('ok');
        })
      }
    });
  });
}

function postKey (req, res, next) {
  if (req.query.action === 'delete') {
    deleteKey(req, res, next);
  } else if (req.query.action === 'decode') {
    decodeKey(req, res, next);
  } else {
    saveKey(req, res, next);
  }
}

function saveKey (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;

  console.log(sf('saving key "{0}"', key));
  redisConnection.type(key, function (err, type) {
    if (err) {
      console.error('saveKey', err);
      return next(err);
    }
    myutil.decodeHTMLEntities(req.body.stringValue, function (value) {
      let score = parseInt(req.body.keyScore, 10);
      let field = req.body.fieldName;
      let formType = req.body.keyType;
      type = typeof(formType) === 'undefined' ? type : formType;
      switch (type) {
          case 'string':
          case 'none':
              return posKeyDetailsString(key, value, req, res, next);
          case 'list':
              return addListValue(key, value, 'lpush', res, next);
          case 'set':
              return addSetMember(key, value, res, next);
          case 'zset':
              return addZSetMember(key, score, value, res, next);
          case 'hash':
              return editHashField(key, field, value, res, next);
          default:
              return next(new Error("Unhandled type " + type));
      }
    });
  });
}

function decodeKey (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;

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

function deleteKey (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;
  console.log(sf('deleting key "{0}"', key));
  redisConnection.del(key, function (err) {
    if (err) {
      console.error('deleteKey', err);
      return next(err);
    }

    return res.send('ok');
  });
}

function posKeyDetailsString (key, value, req, res, next) {
  if (!req.app.locals.noLogData) console.log('new value for key: ', value);
  let redisConnection = res.locals.connection;
  redisConnection.set(key, value, function (err) {
    if (err) {
      console.error('posKeyDetailsString', err);
      return next(err);
    }
    res.send('OK');
  });
}

function getKeys (req, res, next) {
  let prefix = req.params.keyPrefix;
  let limit = req.params.limit || 100;
  let redisConnection = res.locals.connection;
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
}

function getKeysTree (req, res, next) {
  let prefix = req.params.keyPrefix;
  let redisConnection = res.locals.connection;
  console.log(sf('loading keys by prefix "{0}"', prefix));
  let search;
  if (prefix) {
    search = prefix.replace(/[\*\[\]\?]/, '\\$&') + '*';
  } else {
    search = rootPattern;
  }

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
        key = key.substr(prefix.length);
      }
      let parts = key.split(foldingCharacter);
      // attn: key may begin with folding char - then add string after folding char too
      // otherwise will get endless loop with ui
      // to distinguish between exact key and "folder" add foldingChar to firstPart
      let firstPart = parts[0];
      if (parts.length > 1) {
          if (key.startsWith(foldingCharacter)) {
              firstPart = foldingCharacter + parts[1];
          }
          firstPart += foldingCharacter;
      }

      if (lookup.hasOwnProperty(firstPart)) {
        lookup[firstPart].count++;
      } else {
        // must provide unique id over all connections for jstree to work correctly
        let nodeId = '';
        if (prefix) {
          nodeId = res.locals.connectionId + ":" + prefix + firstPart;
        }
        else {
          nodeId = res.locals.connectionId + ":" + firstPart;
        }
        lookup[firstPart] = {
          id: nodeId,
          text: firstPart,
          count: parts.length === 1 ? 0 : 1,
          keyName: firstPart,
          fullKey: fullKey
        };
        if (parts.length !== 1) {
          lookup[firstPart].children = true;
        }
        reducedKeys.push(lookup[firstPart]);
      }
    });

    reducedKeys.forEach(function (data) {
      if (data.count !== 0) {
        data.text = data.text + '* (' + data.count + ')';
        data.state = {
          opened: false
        };
      }
    });

    async.eachLimit(reducedKeys, 10, function (keyData, callback) {
      if (!keyData.children) {
        redisConnection.type(keyData.fullKey, function (err, type) {
          if (err) {
            return callback(err);
          }
          keyData.rel = type;
          let sizeCallback = function (err, count) {
            if (err) {
              return callback(err);
            } else {
              keyData.text += " (" + count + ")";
              delete keyData.fullKey;
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
            delete keyData.fullKey;
            callback();
          }
        });
      } else {
        delete keyData.fullKey;
        async.setImmediate(callback);
      }
    }, function (err) {
      if (err) {
        console.error('getKeys', err);
        return next(err);
      }
      reducedKeys = reducedKeys.sort(function (a, b) {
        return a.text > b.text ? 1 : -1;
      });
      res.send(JSON.stringify(reducedKeys));
    });
  });
}

function postKeys (req, res, next) {
  let key = req.params.key;
  if (req.query.action === 'delete') {
    deleteKeys(key, res, next);
  } else {
    next(new Error("Invalid action '" + req.query.action + "'"));
  }
}

function deleteKeys (keyQuery, res, next) {
  let redisConnection = res.locals.connection;
  console.log(sf('deleting keys by prefix "{0}"', keyQuery));
  redisConnection.keys(keyQuery, function (err, keys) {
    if (err) {
      console.error('deleteKeys', err);
      return next(err);
    }

    async.eachLimit(keys, 10, function (key, callback) {
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
