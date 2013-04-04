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
  var hostAndPort = connectionId.split(":");
  var host = hostAndPort[0];
  var port = hostAndPort[1];
  req.app.logout(host, port, function (err) {
    if (err) {
      return next(err);
    }
    req.app.getConfig(function (err, config) {
      if (err) {
        return next(err);
      }
      removeConnectionFromDefaults(config.default_connections, hostAndPort, function (err, newDefaults) {
        if (err) {
          return next(err);
        }
        config.default_connections = newDefaults;
        req.app.saveConfig(config, function (err) {
          if (err) {
            return next(err);
          }
          if (!res._headerSent) {
            res.send('OK');
          }
        });
      });
    });
  });
}

function removeConnectionFromDefaults (connections, hostAndPort, callback) {
  var notRemoved = true;
  connections.forEach(function (connection, index) {
    if (notRemoved && connection.host == hostAndPort[0] && connection.port == hostAndPort[1]) {
      notRemoved = false;
      connections.splice(index, 1);
    }
  });
  if (notRemoved) {
    return callback(new Error("Could not remove ", hostname, port, "."));
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