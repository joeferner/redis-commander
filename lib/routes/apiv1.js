'use strict';

const async = require('async');
const inflection = require('inflection');
const myutil = require('../util');
const config = require('config');
const middlewares = require('../express/middlewares');

const tombStone = "REDISCOMMANDERTOMBSTONE";

const redisCoreCmds = require('../redisCommands/redisCore');

// Simple RegEx to decide if String or Binary, test for first control characters
// ref for possible groups https://github.com/slevithan/xregexp/blob/master/tools/output/categories.js
// Exclude "normal" text control chars:  Tab (\x9), LineFeed (\xA), CarriageReturn (\xD),
const ControlCharRegEx = new RegExp('[\0-\x08\x0B\x0C\x0E-\x1F\x7F]');

let foldingCharacter;
let rootPattern;

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
  routerV1.post('/key/:connectionId/:key(*)', middlewares.checkReadOnlyMode, postKey);
  routerV1.post('/keys/:connectionId/:key(*)', middlewares.checkReadOnlyMode, postKeys);

  // modify entries - legacy api
  routerV1.post('/listvalue/', middlewares.checkReadOnlyMode, postAddListValueOld);
  routerV1.post('/setmember/', middlewares.checkReadOnlyMode, postAddSetMemberOld);
  routerV1.post('/editListValue', middlewares.checkReadOnlyMode, postEditListValueOld);
  routerV1.post('/editSetMember', middlewares.checkReadOnlyMode, postEditSetMemberOld);
  routerV1.post('/editZSetMember', middlewares.checkReadOnlyMode, postEditZSetMemberOld);
  routerV1.post('/editHashRow', middlewares.checkReadOnlyMode, postEditHashFieldOld);

  // helpers and get values
  routerV1.post('/encodeString/:stringValue', encodeString);
  routerV1.get('/keystree/:connectionId/:keyPrefix(*)', getKeysTree);
  routerV1.get('/keystree/:connectionId', getKeysTree);
  routerV1.get('/keys/:connectionId/:keyPrefix(*)', getKeys);
  routerV1.post('/exec/:connectionId', postExec);
  routerV1.get('/connection', isConnected);

  routerV1.param('connectionId', middlewares.findConnection);
  routerV1.use(checkConnectionClosedHandler);

  // ================
  // new version 2 api, routes to modify redis entries has changed
  // ================
  // common functions and key retrieval identical to v1 api
  routerV2.get('/server/info', getServersInfo);
  routerV2.get('/server/:connectionId/info', getServersInfo);
  routerV2.get('/key/:connectionId/:key(*)', getKeyDetails);
  routerV2.post('/key/:connectionId/:key(*)', middlewares.checkReadOnlyMode, postKey);
  routerV2.patch('/key/:connectionId/:key(*)', middlewares.checkReadOnlyMode, renameKey);
  routerV2.post('/keys/:connectionId/:key(*)', middlewares.checkReadOnlyMode, postKeys);
  // modify entries - newer api with post/put/del and additional POST equivalents
  // and unified form params

  routerV2.post('/list/value', middlewares.checkReadOnlyMode, postAddListValue);
  routerV2.put('/list/value', middlewares.checkReadOnlyMode, postEditListValue);
  routerV2.delete('/list/value', middlewares.checkReadOnlyMode, postDeleteListValue);
  routerV2.post('/list/value/add', middlewares.checkReadOnlyMode, postAddListValue);
  routerV2.post('/list/value/edit', middlewares.checkReadOnlyMode, postEditListValue);
  routerV2.post('/list/value/delete', middlewares.checkReadOnlyMode, postDeleteListValue);

  routerV2.post('/set/member', middlewares.checkReadOnlyMode, postAddSetMember);
  routerV2.put('/set/member', middlewares.checkReadOnlyMode, postEditSetMember);
  routerV2.delete('/set/member', middlewares.checkReadOnlyMode, postDeleteSetMember);
  routerV2.post('/set/member/add', middlewares.checkReadOnlyMode, postAddSetMember);
  routerV2.post('/set/member/edit',middlewares.checkReadOnlyMode,  postEditSetMember);
  routerV2.post('/set/member/delete', middlewares.checkReadOnlyMode, postDeleteSetMember);

  routerV2.post('/zset/member', middlewares.checkReadOnlyMode, postAddZSetMember);
  routerV2.put('/zset/member', middlewares.checkReadOnlyMode, postEditZSetMember);
  routerV2.delete('/zset/member', middlewares.checkReadOnlyMode, postDeleteZSetMember);
  routerV2.post('/zset/member/add', middlewares.checkReadOnlyMode, postAddZSetMember);
  routerV2.post('/zset/member/edit', middlewares.checkReadOnlyMode, postEditZSetMember);
  routerV2.post('/zset/member/delete', middlewares.checkReadOnlyMode, postDeleteZSetMember);

  routerV2.post('/xset/member', middlewares.checkReadOnlyMode, postAddXSetMember);
  routerV2.put('/xset/member', middlewares.checkReadOnlyMode, notImplemented);
  routerV2.delete('/xset/member', middlewares.checkReadOnlyMode, postDeleteXSetMember);
  routerV2.post('/xset/member/add', middlewares.checkReadOnlyMode, postAddXSetMember);
  routerV2.post('/xset/member/edit', middlewares.checkReadOnlyMode, notImplemented);
  routerV2.post('/xset/member/delete', middlewares.checkReadOnlyMode, postDeleteXSetMember);

  routerV2.get('/hash/key/:connectionId/:key(*)', getHashField);
  routerV2.post('/hash/field', middlewares.checkReadOnlyMode, postAddHashField);
  routerV2.put('/hash/field', middlewares.checkReadOnlyMode, postEditHashField);
  routerV2.delete('/hash/field', middlewares.checkReadOnlyMode, postDeleteHashField);
  routerV2.post('/hash/field/add', middlewares.checkReadOnlyMode, postAddHashField);
  routerV2.post('/hash/field/edit', middlewares.checkReadOnlyMode, postEditHashField);
  routerV2.post('/hash/field/delete', middlewares.checkReadOnlyMode, postDeleteHashField);

  // helpers and stuff same as v1 api
  routerV2.post('/encodeString/:stringValue', encodeString);
  routerV2.get('/keystree/:connectionId/:keyPrefix(*)', getKeysTree);
  routerV2.get('/keystree/:connectionId', getKeysTree);
  routerV2.get('/keys/:connectionId/:keyPrefix(*)', getKeys);
  routerV2.post('/exec/:connectionId', postExec);
  routerV2.get('/connection', isConnected);

  // new to v2
  routerV2.get('/redisCommands', getRedisCommands);

  routerV2.param('connectionId', middlewares.findConnection);
  routerV2.use(checkConnectionClosedHandler);
  return {
    apiv1: routerV1,
    apiv2: routerV2
  };
};

function notImplemented(req, res) {
  return res.status(501).send('ERROR: function not implemented');
}

function isConnected (req, res) {
  if (req.app.locals.redisConnections[0]) {
    return res.send(true);
  }
  return res.send(false);
}

/** Express error handler called if some function calls next(errObj)
 *  This middleware comes before the default error handler and checks if error object was generated by
 *  RedisClient on redis connection as connection is closed (network errors and similar)
 *  Returns JSON to client if true, passes error object to next error handler if no connection error
 *
 *  @param {object} err error object
 *  @param {object} req Express request object
 *  @param {object} res Express response object
 *  @param {function} next Express next() function to call next middleware
 */
function checkConnectionClosedHandler(err, req, res, next) {
  if (err && !res.headersSent) {
    if (err.message === 'Connection is closed.' && typeof err.stack === 'string' && err.stack.indexOf('redis/event_handler.js')) {
      res.status(503).send({
        success: false,
        message: err.message,
        connectionClosed: true
      });
      return
    }
  }
  next(err);
}


function getServersInfo (req, res, next) {
  // only one server requested
  if (res.locals.connection) {
    getServerInfo(res.locals.connection, function (err, serverInfo) {
      if (err) {
        console.error('Error checking info for a connection: ' + res.locals.connectionId + ' - ' + JSON.stringify(err));
        // add if basic info is available, mark as unavailble
        if (serverInfo) {
          serverInfo.disabled = true;
        }
      }
      let retList = [];
      retList.push(serverInfo);
      return res.json({data: retList});
    });
  }
  // need info of all servers, may hang if one server is not available
  else if (req.app.locals.redisConnections.length > 0) {
    let allServerInfo = [];
    // change from Array.forEach to async.each to not error out if one connection is not available atm!
    async.each(req.app.locals.redisConnections, function (redisConnection, callback) {
      getServerInfo(redisConnection, function (err, serverInfo) {
        if (err) {
          console.error('Error checking info for a connection: ' + redisConnection.options.connectionId +
            ' - ' + JSON.stringify(err));
          // add if basic info is available, mark as unavailable
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
      return res.json({data: allServerInfo});
    });
  } else {
    return next("No redis connections");
  }
}


function getServerInfo (redisConnection, callback) {
  // info() function does not return as long this is in connecting state
  if (redisConnection.status !== 'ready') {
    async.nextTick(function() {
      callback(null, {
        label: redisConnection.label,
        host: redisConnection.options.host,
        port: redisConnection.options.port,
        db: redisConnection.options.db,
        connectionId: redisConnection.options.connectionId,
        disabled: true,
        error: 'Status: ' + redisConnection.status
      })
    });
    return;
  }
  redisConnection.info(function (err, serverInfo) {

    let connectionInfo = {
      label: redisConnection.label,
      host: redisConnection.options.host,
      port: redisConnection.options.port,
      db: redisConnection.options.db,
      connectionId: redisConnection.options.connectionId
    };
    if (err) {
      console.error('getServerInfo', err);
      connectionInfo.error = err.message;
      return callback(err, connectionInfo);
    }
    connectionInfo.info = serverInfo
      .split('\n')
      .map(function (line) {
        line = line.trim();
        let parts = line.split(':');
        return {
          key: inflection.humanize(parts[0]),
          value: parts.slice(1).join(':')
        };
      });
    return callback(null, connectionInfo);
  });

}

// this needs special handling for read-only mode. Must check all commands and classify
// if command to view or manipulatie data...
function postExec (req, res) {
  let cmd = req.body.cmd;
  let connection = res.locals.connection;
  let parts = myutil.split(cmd);
  parts[0] = parts[0].toLowerCase();
  let commandName = parts[0].toLowerCase();

  // must be in our white list to be allowed in read only mode
  if (req.app.locals.redisReadOnly) {
    if (!isReadOnlyCommand(commandName, connection)) {
      return res.json({data: 'ERROR: Command not read-only'});
    }
  }

  // block MULTI command as long as no support implemented. breaks to much things currently
  // same for MONITOR (#424)
  if (commandName === 'multi' || commandName === 'monitor') {
    return res.json({data: `ERROR: Command ${commandName} not supported via web cli`});
  }

  let args = parts.slice(1);
  args.push(function (err, results) {
      if (err) {
          return res.json({data: err.message});
      }
      return res.json({data: results});
  });
  // check if command is valid is done by ioredis if called with
  // 'connection.call(command, ...)' and our callback called to handle it
  // but throws Error if called via 'connection[commandName].apply(connection, ...)'
  connection.call(commandName, ...args);
}

/** check if given command is a read-only command for the connection.
 *  If server supports listing all commands this list includes all commands the server
 *  understands (also plugin commands). If server does not support "command" commando
 *  this check is done again a hardcoded list of read-only commands, therefore may miss
 *  some legit commands for newer servers or servers with extra plugins enabled.
 *
 *  @param {string} command command name in lower case to check
 *  @param {Redis} connection active redis connection object with optional additional command list attached
 *  @return {boolean} true if coammd does not modify state of server
 */
function isReadOnlyCommand(command, connection) {
  // check dynamic command list for this connection if available
  if (connection.options.commandList && connection.options.commandList.ro.length > 0) {
    return connection.options.commandList.ro.some((cmd) => cmd === command);
  }
  else {
    // fallback hardcoded list
    let commandUpper = command.toUpperCase();
    let commandSpace = commandUpper + ' ';
    return redisCoreCmds.readCmds.some(function(roCmd) {
      return roCmd === commandUpper || roCmd.startsWith(commandSpace);
    });
  }
}

/** this method returns a list with a list of active redis commands that can be send
 *  via POST /exec route. It is used to initialise client-side CmdParser.
 *  There is no client side check to filter commands send via exec throu this list.
 *
 *  @param {express.request} req express request object
 *  @param {express.response} res express response object
 */
function getRedisCommands(req, res) {
  if (req.app.locals.redisReadOnly) {
    res.json({data: redisCoreCmds.readCmds});
  }
  else {
    res.json({data: [].concat(redisCoreCmds.readCmds, redisCoreCmds.writeCmds)});
  }
}


function getKeyDetails (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;
  console.log(`loading key "${key}" from "${res.locals.connectionId}"`);
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
      case 'stream':
        return getKeyDetailsXSet(key, req, res, next);
      case 'hash':
        return getKeyDetailsHash(key, res, next);
      case 'set':
        return getKeyDetailsSet(key, res, next);
      case 'ReJSON-RL':
        return getKeyDetailsReJSON(key, res, next);
    }

    // fallback for unknown types
    let details = {
      key: key,
      type: type
    };
    res.json(details);
  });
}

function sendWithTTL(details, key, redisConnection, res) {
    redisConnection.ttl(key, function (err, ttl) {
        if (err) {
            // TTL is not fatal
            console.error(err);
        }
        res.json(Object.assign({ ttl }, details));
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

    // check if binary data / contains control chars
    if (config.get('ui.binaryAsHex') && ControlCharRegEx.test(val)) {
      details.type = 'binary';
      details.value = Buffer.from(val).toString('base64');
    }

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
    redisConnection.llen(key, function (errLen, length) {
      if (errLen) {
        console.error('getKeyDetailsList', errLen);
        return next(errLen);
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
  let fieldRetrievalStrategy = (config.get("ui.maxHashFieldSize") > 0)? getSizeLimitedHashFields : getAllHashFields;

  fieldRetrievalStrategy(redisConnection, key, res, function (err, fieldsAndValues) {
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

function getAllHashFields(redisConnection, key, res, cb) {
  redisConnection.hgetall(key, cb);
}


function getSizeLimitedHashFields(redisConnection, key, res, cb) {
  redisConnection.hkeys(key, function (err, fields) {
    if (err) {
      console.error('getKeyDetailsHash:keys', err);
      return cb(err);
    }

    /**
     *
     * @param {string[]} fieldNames list of all field names
     * @param {number} idx index of field name to work on
     * @param {Map<string, string>} fieldsAndValues the map of fields to values
     * @param {function} done final callback
     */
    function iterate(fieldNames, idx, fieldsAndValues, done) {
      if (idx >= fieldNames.length) {
        done(null, fieldsAndValues);
      }
      else {
        getKeyDetailsHashField(key, fieldNames[idx], redisConnection, function (errDetails, result) {
          if (errDetails) {
            return done(errDetails);
          }
          // if the strlen > 0 and the result value is undefined then we want to return an explicit
          // null value so it can be interpretted as a deferred lookup value
          fieldsAndValues[fieldNames[idx]] = (result[0] < config.get("ui.maxHashFieldSize"))? result[1] : null;
          iterate(fieldNames, idx + 1, fieldsAndValues, done);
        });
      }
    }

    iterate(fields, 0, {}, cb);
  });
}

// redis script to check the size of a hash field before retrieving it.
const checkAndHGetScript = `
local function checkAndGet(k, f)
  local vlen=redis.call('hstrlen', k, f)
  if (vlen > 0 and vlen < tonumber(ARGV[1])) then
    return {vlen, redis.call('hget', k, f)}
  else
    return {vlen, nil}
  end
end
return {(checkAndGet(KEYS[1], KEYS[2]))}
`;

function getKeyDetailsHashField(key, field, redisConnection, next) {
  redisConnection.eval(checkAndHGetScript, 2, key, field, config.get('ui.maxHashFieldSize'), function (err, data) {
    if (err) {
      console.error('getKeyDetailsHashField', err);
      return next(err);
    }
    next(null, data[0]);  // should return [keyLen, value?]
  });
}


function getKeyDetailsReJSON (key, res, next) {
  let redisConnection = res.locals.connection;

  redisConnection.call('JSON.GET', key,
    function (err, result) {
      if (err) {
        console.error('getKeyDetailsReJSON', err);
        return next(err);
      }

      let details = {
        key: key,
        type: 'ReJSON-RL',
        value: result
      };

      sendWithTTL(details, key, redisConnection, res);
  })
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
      console.error('getKeyDetailsZSet - zrevrange', err);
      return next(err);
    }

    items = mapZSetItems(items);

    let i = startIdx;
    items.forEach(function (item) {
      item.number = i++;
    });
    redisConnection.zcount(key, "-inf", "+inf", function (errCount, length) {
      if (errCount) {
        console.error('getKeyDetailsZSet - zcount', errCount);
        length = 0;
        //return next(err);
      }
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

function getKeyDetailsXSet (key, req, res, next) {
  let redisConnection = res.locals.connection;
  let startIdx = req.query.index;

  if (typeof(startIdx) === 'undefined') {
    startIdx = '-';
  }
  else {
    // parse 1232343434324[-123] XSet type indexes
    let millis = 0;
    let subMillis = 0;
    if (startIdx.includes('-')) {
      millis = parseInt(req.query.index, 10);
      subMillis = parseInt(startIdx.split('-')[1], 10);
    }
    else {
      millis = parseInt(req.query.index, 10);
    }
    if (isNaN(millis) || millis < 0 || isNaN(subMillis) || subMillis < 0)
    {
      console.log('WARNING: Stream ID parsing faile. Fetching entries from top/bottom edge.');
      startIdx = '-';
    }
  }

  // get 19 values, just like in zset implementation
  let itemCount = 19 + 1;
  redisConnection.call('XRANGE', [key, startIdx, '+', 'COUNT', itemCount], function (err, result) {
    if (err) {
      console.error('getKeyDetailsXSet - xrange', err);
      return next(err);
    }
    // console.log('STREAM "'+result+'"')
    let items = mapXSetItems(result);
    // console.log('stream ready '+JSON.stringify(items))

    let i = 1;
    items.forEach(function (item) {
      item.number = i++;
    });

    redisConnection.xlen(key, function (errLen, length) {
      if (errLen) {
        console.error('getKeyDetailsXSet - xlen', errLen);
        length = 0;
        //return next(err);
      }
      let details = {
        key: key,
        type: 'stream',
        items: items,
        beginning: startIdx,
        end: itemCount, // endIdx >= length - 1, TODO: last item's timestamp?
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
  middlewares.findConnection(req, res, function () {
    addListValue(key, value, type, res, next);
  }, connectionId);
}

function postEditListValueOld (req, res, next) {
  let key = req.body.listKey;
  let index = req.body.listIndex;
  let value = req.body.listValue;
  let connectionId = req.body.listConnectionId;
  middlewares.findConnection(req, res, function () {
    editListValue(key, index, value, res, next);
  }, connectionId);
}

function postAddSetMemberOld (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMemberName;
  let connectionId = req.body.setConnectionId;
  middlewares.findConnection(req, res, function() {
    addSetMember(key, member, res, next);
  }, connectionId);
}

function postEditSetMemberOld (req, res, next) {
  let key = req.body.setKey;
  let member = req.body.setMember;
  let oldMember = req.body.setOldMember;
  let connectionId = req.body.setConnectionId;
  middlewares.findConnection(req, res, function () {
    editSetMember(key, member, oldMember, res, next);
  }, connectionId);
}

function postEditZSetMemberOld (req, res, next) {
  let key = req.body.zSetKey;
  let score = req.body.zSetScore;
  let value = req.body.zSetValue;
  let oldValue = req.body.zSetOldValue;
  let connectionId = req.body.zSetConnectionId;
  middlewares.findConnection(req, res, function () {
    editZSetMember(key, score, value, oldValue, res, next);
  }, connectionId);
}

function postEditHashFieldOld (req, res, next) {
    let key = req.body.hashKey;
    let field = req.body.hashField;
    let value = req.body.hashFieldValue;
    let connectionId = req.body.hashConnectionId;
    middlewares.findConnection(req, res, function () {
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
    middlewares.findConnection(req, res, function () {
        addListValue(key, value, type, res, next);
    }, connectionId);
}

function postEditListValue (req, res, next) {
    let key = req.body.key;
    let index = req.body.index;
    let value = req.body.value;
    let connectionId = req.body.connectionId;
    middlewares.findConnection(req, res, function () {
        editListValue(key, index, value, res, next);
    }, connectionId);
}

function postDeleteListValue (req, res, next) {
    let key = req.body.key;
    let index = req.body.index;
    let value = tombStone;
    let connectionId = req.body.connectionId;
    middlewares.findConnection(req, res, function () {
        editListValue(key, index, value, res, next);
    }, connectionId);
}

// sorted set
function postAddZSetMember (req, res, next) {
    let key = req.body.key;
    let score = req.body.score;
    let value = req.body.value;
    let connectionId = req.body.connectionId;
    middlewares.findConnection(req, res, function () {
        addZSetMember(key, score, value, res, next);
    }, connectionId);
}

function postEditZSetMember (req, res, next) {
  let key = req.body.key;
  let score = req.body.score;
  let value = req.body.value;
  let oldValue = req.body.oldValue;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
      editZSetMember(key, score, value, oldValue, res, next);
  }, connectionId);
}

function postDeleteZSetMember (req, res, next) {
  let key = req.body.key;
  let value = tombStone;
  let oldValue = req.body.value;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
      editZSetMember(key, 0, value, oldValue, res, next);
  }, connectionId);
}

// stream
function postAddXSetMember (req, res, next) {
  let key = req.body.key;
  let timestamp = req.body.timestamp;
  let field = req.body.field;
  let value = req.body.value;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
      addXSetMember(key, timestamp, field, value, res, next);
  }, connectionId);
}

// not allowed in redis currently
// function postEditXSetMember (req, res, next)

function postDeleteXSetMember (req, res, next) {
  let key = req.body.key;
  let timestamp = req.body.timestamp;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
      deleteXSetMember(key, timestamp, res, next);
  }, connectionId);
}


// hash
function getHashField (req, res, next) {
  let key = req.params.key;
  let field = req.query.field;
  if (!field) {
    console.error('Missing "field" query parameter');
    res.status(400).send({success: false, message: 'Missing "field" query parameter'});
    return;
  }

  let redisConnection = res.locals.connection;
  console.log(`loading hash field "${field}" for key "${key}" from "${res.locals.connectionId}"`);

  redisConnection.hget(key, field, function (err, data) {
    if (err) {
      console.error('getHashField', err);
      return next(err);
    }

    res.json({
      key: key,
      field: field,
      data: data
    });
  });
}

function postAddHashField (req, res, next) {
  postEditHashField(req, res, next);
}

function postEditHashField (req, res, next) {
  let key = req.body.key;
  let field = req.body.field;
  let value = req.body.value;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
    editHashField(key, field, value, res, next);
  }, connectionId);
}

function postDeleteHashField (req, res, next) {
  let key = req.body.key;
  let field = req.body.field;
  let value = tombStone;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
      editHashField(key, field, value, res, next);
  }, connectionId);
}

// set
function postAddSetMember (req, res, next) {
  let key = req.body.key;
  let member = req.body.value;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function() {
    addSetMember(key, member, res, next);
  }, connectionId);
}

function postEditSetMember (req, res, next) {
  let key = req.body.key;
  let value = req.body.value;
  let oldValue = req.body.oldValue;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
    editSetMember(key, value, oldValue, res, next);
  }, connectionId);
}

function postDeleteSetMember (req, res, next) {
  let key = req.body.key;
  let value = tombStone;
  let oldValue = req.body.value;
  let connectionId = req.body.connectionId;
  middlewares.findConnection(req, res, function () {
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
        redisConnection.lrem(key, 0, value, function (errRem) {
          if (errRem) {
            console.error('removeListValue', errRem);
            return next(errRem);
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
        console.error('editSetMember - srem', err);
        return next(err);
      }
      if (member === tombStone) {
        return res.send('ok');
      } else {
        myutil.decodeHTMLEntities(member, function (decodedString2) {
          member = decodedString2;
          redisConnection.sadd(key, member, function (errAdd) {
            if (errAdd) {
              console.error('editSetMember - sadd', errAdd);
              return next(errAdd);
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

/**
 *  Stream related functions (XSet) - only add and delete allowed, no edit
 */


function addXSetMember (key, timestamp, field, value, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(field, function (decodedField) {
    myutil.decodeHTMLEntities(value, function (decodedValue) {
      redisConnection.xadd(key, timestamp, decodedField, decodedValue, function (err) {
        if (err) {
          console.error('addXSetMember', err);
          return next(err);
        }
        return res.send('ok');
      });
    });
  });
}

function deleteXSetMember (key, timestamp, res, next) {
  let redisConnection = res.locals.connection;
  /* WARNING:
   * InRedis 5.0.4, deleting the latest key screws up XREAD clients!
   * See this thread:
   * https://stackoverflow.com/questions/55497990/redis-streams-inconsistent-behavior-of-blocking-xread-after-xdel
   *
   * Posible solution: use a LUA script to check if we're deleting the latest and call XSETID in an atomic delete call?
   */
  redisConnection.xdel(key, timestamp, function (err) {
    if (err) {
      console.error('deleteXSetMember', err);
      return next(err);
    }
    console.log(`deleted from xset ${key} timestamp ${timestamp}`);
    return res.send('ok');
  });
}

function editHashField (key, field, value, res, next) {
  let redisConnection = res.locals.connection;
  myutil.decodeHTMLEntities(field, function (decodedField) {
    myutil.decodeHTMLEntities(value, function (decodedValue) {
      if (value === tombStone) {
        redisConnection.hdel(key, decodedField, function (err) {
          if (err) {
            console.error('editHashField - hdel error: ', err);
            return next(err);
          }
          console.debug(`key ${key} attribute ${decodedField} deleted`)
          return res.send('ok');
        });
      } else {
        redisConnection.hset(key, decodedField, decodedValue, function (err, count) {
          if (err) {
            console.error('editHashField - hset error: ', err);
            return next(err);
          }
          console.debug(`key ${key} attribute ${decodedField} ${count === 0 ? 'modified' : 'added'}`)
          return res.send('ok');
        })
      }
    });
  });
}

function postKey (req, res, next) {
  if (req.query.action === 'delete') {
    deleteKey(req, res, next);
  } else if (req.query.action === 'patch' || req.body.action === 'patch') {
    renameKey(req, res, next);
  } else if (req.query.action === 'decode') {
    decodeKey(req, res, next);
  } else {
    saveKey(req, res, next);
  }
}

function saveKey (req, res, next) {
  let key = req.params.key;
  let redisConnection = res.locals.connection;

  console.log(`saving key "${key}"`);
  redisConnection.type(key, function (err, type) {
    if (err) {
      console.error('saveKey', err);
      return next(err);
    }
    myutil.decodeHTMLEntities(req.body.stringValue, function (value) {
      let score = parseInt(req.body.keyScore, 10);
      let field = req.body.fieldName;
      let formType = req.body.keyType;
      let timestamp = req.body.keyTimestamp;
      let fieldValue = req.body.fieldValue;
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
          case 'stream':
              return addXSetMember(key, timestamp, fieldValue, value, res, next);
          case 'hash':
              return editHashField(key, field, value, res, next);
          case 'ReJSON-RL':
              return editReJSONData(key, value, res, next);
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
  console.log(`deleting key "${key}"`);
  redisConnection.del(key, function (err) {
    if (err) {
      console.error('deleteKey', err);
      return next(err);
    }

    return res.send('ok');
  });
}

function renameKey (req, res, next) {
  const keyOld = req.params.key;
  const keyNew = req.body.key;
  const force = req.body.force;
  const redisConnection = res.locals.connection;

  console.log(`rename key "${keyOld}" to "${keyNew}" (force=${force})`);
  if (typeof keyOld === 'string' && keyOld.localeCompare(keyNew) === 0) {
    return res.json('ok');
  }

  if (force === true || force === "true" ) {
    redisConnection.rename(keyOld, keyNew, function (err) {
      if (err) {
        console.error('renameKey::rename', err);
        return next(err);
      }
      return res.json('ok');
    });
  }
  else {
    redisConnection.renamenx(keyOld, keyNew, function (err, exists) {
      if (err) {
        console.error('renameKey::renamenx', err);
        return next(err);
      }
      if (exists === 0) {
        return res.json({error: {code: 'ERR_KEY_EXISTS', title: `Key with name "${keyNew}" already exists`}});
      }
      else {
        return res.json('ok');
      }
    });
  }
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
  console.log(`loading keys by prefix "${prefix}"`);
  redisConnection.keys(prefix, function (err, keys) {
    if (err) {
      console.error('getKeys', err);
      return next(err);
    }
    console.log(`found ${keys.length} keys for "${prefix}"`);

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

    res.json({data: keys.sort()});
  });
}

function getKeysTree (req, res, next) {
  let prefix = req.params.keyPrefix;
  let redisConnection = res.locals.connection;
  console.log(`loading keys by prefix "${prefix}"`);
  let search;
  if (prefix) {
    search = prefix.replace(/[*\[\]?\\]/g, '\\$&') + '*';
  } else {
    search = rootPattern;
  }

  redisConnection.keys(search, function (err, keys) {
    if (err) {
      console.error('getKeys', err);
      return next(err);
    }
    console.log(`found ${keys.length} keys for "${prefix}"`);

    let lookup = {};
    let reducedKeys = [];

    try {
      keys.forEach(function(key) {
        let fullKey = key;
        if (prefix) {
          key = key.substr(prefix.length);
        }
        let parts = key.split(foldingCharacter);
        let firstPart = "";

        // attn: key may begin with folding char - then add string after folding char too
        // otherwise will get endless loop with ui
        // distinguish between entire key starting with folding char and subkey having multiple
        // folding chars next to each other (e.g. :main vs main::sub)
        if (key.startsWith(foldingCharacter) && !prefix) {
          parts.shift();  // remove empty first entry due to key starting with foldingchar
          firstPart = foldingCharacter;
        }
        firstPart += parts[0];
        if (parts.length > 1) {
          firstPart += foldingCharacter;
        }

        if (lookup.hasOwnProperty(firstPart)) {
          lookup[firstPart].count++;
        }
        else {
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
    }
    catch (e) {
      console.log(`Cannot group keys for treeview, used MULTI command before? - ` + e.message);
      res.status(400).send({success: false, message: 'Error getting sub keys for this tree' + e.message});
      return;
    }

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
        redisConnection.type(keyData.fullKey, function (errType, type) {
          if (errType) {
            return callback(errType);
          }
          keyData.rel = type;
          let sizeCallback = function (errSize, count) {
            if (errSize) {
              return callback(errSize);
            } else {
              keyData.text += " (" + count + ")";
              delete keyData.fullKey;
              callback();
            }
          };
          // string may be binary too, cannot validate without reading value?
          //if (type === 'string') {
          //}
          if (type === 'list') {
            redisConnection.llen(keyData.fullKey, sizeCallback);
          } else if (type === 'set') {
            redisConnection.scard(keyData.fullKey, sizeCallback);
          } else if (type === 'zset') {
            redisConnection.zcard(keyData.fullKey, sizeCallback);
          } else if (type === 'stream') {
            redisConnection.xlen(keyData.fullKey, sizeCallback);
          } else {
            delete keyData.fullKey;
            callback();
          }
        });
      } else {
        delete keyData.fullKey;
        async.setImmediate(callback);
      }
    }, function (errAsyncEach) {
      if (errAsyncEach) {
        console.error('getKeys', errAsyncEach);
        return next(errAsyncEach);
      }
      reducedKeys = reducedKeys.sort(function (a, b) {
        return a.text > b.text ? 1 : -1;
      });
      res.json({data: reducedKeys});
    });
  });
}

function postKeys (req, res, next) {
  if (req.query.action === 'delete') {
    deleteKeys(req.params.key, res, next);
  } else {
    next(new Error("Invalid action '" + req.query.action + "'"));
  }
}

function deleteKeys (keyQuery, res, next) {
  let redisConnection = res.locals.connection;
  console.log(`deleting keys by prefix "${keyQuery}"`);
  redisConnection.keys(keyQuery, function (err, keys) {
    if (err) {
      console.error('deleteKeys', err);
      return next(err);
    }

    async.eachLimit(keys, 10, function (key, callback) {
      redisConnection.del(key, callback);
    }, function (errDel) {
      if (errDel) {
        console.error('deleteKeys', errDel);
        return next(errDel);
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

// 1554806507854-0,ccm:group:join,{"groups":[groupX]} ....aaand:[["1554806507854-0",["ccm:group:join","{\"groups\":[groupX]}"]]]

function mapXSetItems (items) {
  let results = [];
  for (let i = 0; i < items.length; i += 1) {
    results.push({
      timestamp: items[i][0],
      field: items[i][1][0],
      value: items[i][1][1]
    });
  }
  return results;
}
