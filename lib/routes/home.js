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
        "CLIOpen": false
      };
    }
    return res.send(config);
  });
}
function postConfig (req, res) {
  var config = req.body;
  console.log(config);
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
          "CLIOpen": false
        };
      }
      config['host'] = req.body.hostname;
      config['port'] = req.body.port;
      config['password'] = req.body.password;
      config['dbIndex'] = req.body.dbIndex;
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
    if (!res._headerSent) {
      res.send('OK');
    }
  });
}

function getHome (req, res) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}
