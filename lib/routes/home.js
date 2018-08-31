'use strict';
var fs = require('fs');

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
      console.log("No config found.\nUsing default configuration.")
      config = {
        "sidebarWidth": 250,
        "locked": false,
        "CLIHeight": 50,
        "CLIOpen": false,
        "default_connections": []
      };
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
        return res.redirect('./?error=login');
      }
      return;
    }
    req.app.getConfig(function (err, config) {
      if (err) {
        console.log("No config found.\nUsing default configuration.");
        config = {
          "sidebarWidth": 250,
          "locked": false,
          "CLIHeight": 50,
          "CLIOpen": false,
          "default_connections": []
        };
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
          return res.redirect('./');
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
    /**
     * Here is a bug here.
     *
     * When I disconnect an instance, there is always an error message in console like this:
     * "Could not remove localhost:6379:1 from default connections."
     *
     * So I run into the code and locate the bug here. As I output connection in console:
     * "console.log(connection);"
     * its output is just like this:
     * "{ host: 'localhost', port: '6379', password: '', dbIndex: '2' }"
     *
     * There is no such a 'selected_db' property in connection.
     * I modified the code below to fix this bug.
     */
    if (notRemoved && connection.options.host == hostname && connection.options.port == port && connection.options.db == db) {
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
