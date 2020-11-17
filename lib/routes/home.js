'use strict';

let myUtils = require('../util');
let config = require('config');

module.exports = function() {
  const express = require('express');
  const router = express.Router();

  router.get('/connections', getConnections);
  router.post('/login', postLogin);
  router.post('/login/detectDb', postLoginDetectDb);
  router.get('/config', getConfig);
  router.post('/logout/:connectionId', postLogout);


  function getConnections(req, res) {
    res.json({
      'ok': true,
      'connections': req.app.locals.redisConnections.map(myUtils.convertConnectionInfoForUI)
    });
  }

  function getConfig (req, res) {
    // do not return connections at all, that queried via /connections route...
    return res.send(config.get('ui'));
  }

  /** extract all connection data needed from body of request to create a new connection
   *  object suitable to create new redis client from via utility function.
   *  Function throws error if data are missing or non-parsable.
   *  This function understands redis connections via socket, single ip or sentinel.
   *
   *  @param {object} body body of request with connection data
   * @returns {{password: *, port: number, dbIndex: number, label: *}} connection object
   */
  function extractLoginDataFromBody(body) {
    let newConnection = {
      label: body.label,
      port: body.port,
      password: body.password,
      dbIndex: body.dbIndex
    };

    if (body.serverType === 'sentinel') {
      newConnection.sentinels = myUtils.parseRedisSentinel('newConnection', body.sentinels);
      newConnection.sentinelName = myUtils.getRedisSentinelGroupName(body.sentinelName);
      switch (body.sentinelPWType) {
        case 'sentinel':
          newConnection.sentinelPassword = body.sentinelPassword;
          break;
        case 'redis':
          newConnection.sentinelPassword = body.password;
          break;
      }
    }
    else if (typeof body.hostname === 'string') {
      if (body.hostname.startsWith('/')) {
        newConnection.path = body.hostname;
      }
      else {
        newConnection.host = body.hostname;
      }
    }
    else {
      throw new Error('invalid or missing hostname or socket path');
    }

    if (body.usetls) {
      newConnection.tls = true
    }
    return newConnection;
  }

  function postLogin (req, res, next) {
    if (Number.isNaN(req.body.dbIndex)) {
      return res.json({
        ok: false,
        message: 'invalid database index'
      });
    }

    // first check if this connection is already know & active - do not create duplicate connections
    let newConnection = {};
    try {
      newConnection = extractLoginDataFromBody(req.body);
    }
    catch (e) {
      return res.json({
        ok: false,
        message: e.message
      });
    }

    if (myUtils.containsConnection(req.app.locals.redisConnections.map(function(c) {return c.options}), newConnection)) {
        return res.json({
            ok: true,
            message: 'already logged in to this server and db'
        });
    }

    // now try to login
    req.app.login(newConnection, function (err) {
      if (err) {
        console.log('Invalid Login: ' + err);
        if (!res._headerSent) {
          return res.json({
              ok: false,
              message: 'invalid login: ' + (err.message ? err.message : JSON.stringify(err))
          });
        }
        return;
      }
      // written config and current in-memory config may differ
      if (!myUtils.containsConnection(config.get('connections'), newConnection)) {
        config.connections.push(newConnection);
      }
      req.app.saveConfig(config, function (errSave) {
        if (errSave) {
          return next(errSave);
        }
        if (!res._headerSent) {
          return res.json({'ok': true})
        }
      });
    });
  }

  function postLoginDetectDb (req, res, next) {
    try {
      let newConnection = extractLoginDataFromBody(req.body);
      // set db to zero as this one must exist, all higher numbers are optional...
      newConnection.dbIndex = 0;

      // now try to login and get server info to check number of keys per db
      if (newConnection.sentinels) {
        console.log('checking for dbs at sentinel... ', newConnection.sentinelName, JSON.stringify(newConnection.sentinels));
      }
      else {
        console.log('checking for dbs... ', newConnection.host, newConnection.port);
      }

      let client = myUtils.createRedisClient(newConnection);
      client.on('error', function (err) {
        disconnectClient(client);
        console.log('Cannot connect to redis db: ' + err.message);
      });
      client.on('connect', function () {
        client.call('info', 'keyspace', function(errCmd, serverInfo) {
          if (errCmd || !serverInfo) {
            console.log('Error calling "info" command to get all databases used.', (errCmd ? errCmd.message : 'unknown error'));
            return res.json({
              ok: false,
              message: (errCmd ? errCmd.message : 'Error calling "info" command to get all databases used.')
            });
          }
          else {
            let dbLines = serverInfo.split('\n').filter(function(line) {
              return line.trim().match(/^db\d+:/);
            }).map(function (line) {
              let parts = line.trim().split(':');
              return {
                dbIndex: parts[0].substr(2),
                keys: parts[1]
              };
            });

            // check number of max dbs allowed (config get databases), defaults to 16
            client.call('config', 'get', 'databases', function(errCfg, serverInfo2) {
                let dbMax = 16;
                let host = '';
                // ignore errors, often command not allowed for security n stuff
                if (errCfg) {
                    console.info('Cannot query max number of databases allowed, use default 16 instead: ',
                      errCfg.message);
                }
                else {
                    dbMax = Array.isArray(serverInfo2) ? parseInt(serverInfo2[1]) : 16;
                }

                switch (client.options.type) {
                    case 'socket':
                        host = client.options.path;
                        break;
                    case 'sentinel':
                        host = client.options.sentinels[0].host;
                        break;
                    case 'cluster':
                        // todo - fallthrou for now
                    default:  // standalone
                        host = client.options.host;
                }

                res.json({
                    ok: true,
                    server: `${client.options.type} ${host}`,
                    dbs: {
                        used: dbLines,
                        max: dbMax
                    }
                });
            });
          }
          disconnectClient(client);
        });
      });
    }
    catch (e) {
      return res.json({
        ok: false,
        message: e.message
      });
    }

    function disconnectClient(client) {
      client.quit();
      client.disconnect();
    }
  }

  function postLogout (req, res, next) {
    var connectionId = req.params.connectionId;
    req.app.logout(connectionId, function (err) {
      if (err) {
        return next(err);
      }
      removeConnectionFromDefaults(config.get('connections'), connectionId, function (errRem, newDefaults) {
        if (errRem) {
          console.log('postLogout - removeConnectionFromDefaults', errRem);
          if (!res._headerSent) {
            return res.send('OK');
          }
        }
        config.connections = newDefaults;
        req.app.saveConfig(config, function (errSave) {
          if (errSave) {
            return next(errSave);
          }
          if (!res._headerSent) {
            return res.send('OK');
          }
        });
      });
    });
  }

  function removeConnectionFromDefaults (connections, connectionId, callback) {
    var notRemoved = true;
    connections.forEach(function (connection, index) {
      if (notRemoved) {
        if (connection.connectionId === connectionId) {
          notRemoved = false;
          connections.splice(index, 1);
        }
      }
    });
    if (notRemoved) {
      return callback('Could not remove ' + connectionId + ' from default connections.');
    } else {
      return callback(null, connections);
    }
  }

  return router;
};
