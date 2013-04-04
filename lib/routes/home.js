'use strict';
var fs = require('fs');

module.exports = function (app) {
  app.get('/', getHome);
  app.post('/login', postLogin);
  app.get('/config', getConfig);
  app.post('/config', postConfig);
  app.post('/logout/:connectionId', postLogout);
};

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
    res.send(500);
  } else {
    res.send(200);
    req.app.saveConfig(config, function (err) {
      if (err) {
        console.log(err);
        res.send(500);
      } else {
        res.send(200);
      }
    });
  }
}

function postLogin (req, res, next) {
  req.app.login(req.body.hostname, req.body.port, req.body.password, req.body.dbIndex, function (err) {
    if (err) {
      req.flash('error', 'Invalid login: ' + err);
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
      newConnection['host'] = req.body.hostname;
      newConnection['port'] = req.body.port;
      newConnection['password'] = req.body.password;
      newConnection['dbIndex'] = req.body.dbIndex;
      if (!config['default_connections']) {
        config['default_connections'] = [];
      }
      config['default_connections'].push(newConnection);
      req.app.saveConfig(config, function (err) {
        if (err) {
          return next(err);
        }
        if (!res._headerSent) {
          return res.redirect('/');
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
    if (notRemoved && connection.host == hostname && connection.port == port && connection.selected_db == db) {
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

function getHome (req, res) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}