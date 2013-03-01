'use strict';
var fs = require('fs');

module.exports = function(app) {
  app.get('/', getHome);
  app.post('/login', postLogin);
  app.get('/config', getConfig);
  app.post('/config', postConfig);
};

function getConfig(req, res) {
  req.app.getConfig(function(err, config) {
    if (err) {
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
function postConfig(req, res) {
  var config = req.body;
  if (!config) {
    res.send(500);
  } else {
    res.send(200);
    req.app.saveConfig(config, function(err) {
      if (err) {
        res.send(500);
      } else {
        res.send(200);
      }
    });
  }
}

function postLogin(req, res, next) {
  req.app.login(req.body.hostname, req.body.port, req.body.password, req.body.dbIndex, function(err) {
    if (err) {
      req.flash('error', 'Invalid login: ' + err);
    }
    req.app.getConfig(function(err, config) {
      if (err) {
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
      req.app.saveConfig(config, function(err) {
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

function getHome(req, res) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}
