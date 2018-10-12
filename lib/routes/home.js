'use strict';
var fs = require('fs');
var myUtils = require('../util');

module.exports = function (app, urlPrefix) {
  app.get(`${urlPrefix}/connections`, getConnections);
  app.post(`${urlPrefix}/login`, postLogin);
  app.get(`${urlPrefix}/config`, getConfig);
  app.post(`${urlPrefix}/config`, postConfig);
  app.post(`${urlPrefix}/logout/:connectionId`, postLogout);
};

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
  req.app.getConfig(function (err, config) {
    if (err) {
      console.log("No config found.\nUsing default configuration.");
      config = myUtils.defaultConfig
    }
    return res.send(config);
  });
}

function postConfig (req, res) {
  var config = req.body;
  if (!config) {
    console.log('no config sent');
    res.sendStatus(500);
  } else {
    req.app.saveConfig(config, function (err) {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
  }
}

function postLogin (req, res, next) {
  req.app.login(req.body.label, req.body.hostname, req.body.port, req.body.password, req.body.dbIndex, function (err) {
    if (err) {
      console.log("Invalid Login: " + err);
      if (!res._headerSent) {
        return res.json({
            ok: false,
            message: "invalid login: " + JSON.stringify(err)
        });
      }
      return;
    }
    req.app.getConfig(function (err, config) {
      if (err) {
        console.log("No config found.\nUsing default configuration.");
        config = myUtils.defaultConfig();
      }

      var newConnection = {};
      newConnection['label'] = req.body.label;
      newConnection['host'] = req.body.hostname;
      newConnection['port'] = req.body.port;
      newConnection['password'] = req.body.password;
      newConnection['dbIndex'] = req.body.dbIndex;
      if (!config['default_connections']) {
        config['default_connections'] = [];
      }
      if (!containsConnection(config.default_connections, newConnection)) {
        config['default_connections'].push(newConnection);
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
  });
}

function postLogout (req, res, next) {
  var connectionId = req.params.connectionId;
  var connectionIds = connectionId.split(":");
  var host = connectionIds[0];
  var port = connectionIds[1];
  var db = connectionIds[2];
  req.app.logout(host, port, db, function (err) {
    if (err) {
      return next(err);
    }
    req.app.getConfig(function (err, config) {
      if (err) {
        return next(err);
      }
      if (!config.default_connections) {
        config.default_connections = [];
      }
      removeConnectionFromDefaults(config.default_connections, connectionIds, function (err, newDefaults) {
        if (err) {
          console.log(err);
          if (!res._headerSent) {
            return res.send('OK');
          }
        }
        config.default_connections = newDefaults;
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
  });
}

function removeConnectionFromDefaults (connections, connectionIds, callback) {
  var notRemoved = true;
  var hostname = connectionIds[0];
  var port = connectionIds[1];
  var db = connectionIds[2];
  connections.forEach(function (connection, index) {
    if (notRemoved && connection.host == hostname && connection.port == port && connection.dbIndex == db) {
      notRemoved = false;
      connections.splice(index, 1);
    }
  });
  if (notRemoved) {
    return callback("Could not remove " + hostname + ":" + port + ":" + db + " from default connections.");
  } else {
    return callback(null, connections);
  }
}

function containsConnection (connectionList, object) {
  var contains = false;
  connectionList.forEach(function (element) {
    if (element.host == object.host && element.port == object.port && element.password == object.password && element.dbIndex == object.dbIndex) {
      contains = true;
    }
  });
  return contains;
}
