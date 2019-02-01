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
      "ok": true,
      "connections": req.app.locals.redisConnections.map(function(connection) {
        return {
          "label": connection.label,
          "options": {
            "host": connection.options.host,
            "port": connection.options.port,
            "db": connection.options.db
          }
        }
      })
    });
  }

  function getConfig (req, res) {
    // do not return connections at all, that queried via /connections route...
    return res.send(config.get('ui'));
  }

  function postLogin (req, res, next) {
    // first check if this connection is already know & active - do not create duplicate connections
    let newConnection = {
      label: req.body.label,
      host: req.body.hostname,
      port: req.body.port,
      password: req.body.password,
      dbIndex: req.body.dbIndex
    };
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
              message: 'invalid login: ' + JSON.stringify(err)
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
    var connectionIds = connectionId.split(':');
    var host = connectionIds[0];
    var port = connectionIds[1];
    var db = connectionIds[2];
    req.app.logout(host, port, db, function (err) {
      if (err) {
        return next(err);
      }
      removeConnectionFromDefaults(config.get('connections'), connectionIds, function (err, newDefaults) {
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

  function removeConnectionFromDefaults (connections, connectionIds, callback) {
    var notRemoved = true;
    var host = connectionIds[0];
    var port = connectionIds[1];
    var db = connectionIds[2];
    connections.forEach(function (connection, index) {
      if (notRemoved && connection.host === host && connection.port == port && connection.dbIndex == db) {
        notRemoved = false;
        connections.splice(index, 1);
      }
    });
    if (notRemoved) {
      return callback('Could not remove ' + host + ':' + port + ':' + db + ' from default connections.');
    } else {
      return callback(null, connections);
    }
  }

  return router;
};
