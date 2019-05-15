'use strict';

let myUtils = require('../util');
let config = require('config');

module.exports = function() {
  const express = require('express');
  const router = express.Router();

  router.get('/connections', getConnections);
  router.post('/login', postLogin);
  router.get('/config', getConfig);
  router.post('/logout/:connectionId', postLogout);


  function getConnections(req, res) {
    res.json({
      'ok': true,
      'connections': req.app.locals.redisConnections.map(function(connection) {
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
      })
    });
  }

  function getConfig (req, res) {
    // do not return connections at all, that queried via /connections route...
    return res.send(config.get('ui'));
  }

  function postLogin (req, res, next) {
    if (Number.isNaN(req.body.dbIndex)) {
      return res.json({
        ok: false,
        message: 'invalid database index'
      });
    }

    // first check if this connection is already know & active - do not create duplicate connections
    let newConnection = {
      label: req.body.label,
      port: req.body.port,
      password: req.body.password,
      dbIndex: req.body.dbIndex
    };

    if (req.body.serverType === 'sentinel') {
      try {
        newConnection.sentinels = myUtils.parseRedisSentinel('newConnection', req.body.sentinels);
        newConnection.sentinelName = req.body.sentinelName;
        switch (req.body.sentinelPWType) {
          case 'sentinel':
            newConnection.sentinelPassword = req.body.sentinelPassword;
            break;
          case 'redis':
            newConnection.sentinelPassword = req.body.password;
            break;
        }
      }
      catch(e) {
        return res.json({
          ok: false,
          message: e.message
        });
      }
    }
    else if (typeof req.body.hostname === 'string') {
      if (req.body.hostname.startsWith('/')) {
        newConnection.path = req.body.hostname;
      }
      else {
        newConnection.host = req.body.hostname;
      }
    }
    else {
      return res.json({
        ok: false,
        message: 'invalid or missing hostname or socket path'
      });
    }

    if (req.body.usetls) {
      newConnection.tls = true
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
      req.app.saveConfig(config, function (err) {
        if (err) {
          return next(err);
        }
        if (!res._headerSent) {
          return res.json({"ok": true})
        }
      });
    });
  }

  function postLogout (req, res, next) {
    var connectionId = req.params.connectionId;
    req.app.logout(connectionId, function (err) {
      if (err) {
        return next(err);
      }
      removeConnectionFromDefaults(config.get('connections'), connectionId, function (err, newDefaults) {
        if (err) {
          console.log(err);
          if (!res._headerSent) {
            return res.send('OK');
          }
        }
        config.connections = newDefaults;
        req.app.saveConfig(config, function (err) {
          if (err) {
            return next(err);
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
