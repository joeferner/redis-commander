'use strict';

var sf = require('sf');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var redis = require('redis');
var express = require('express');
var browserify = require('browserify');

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnection = null;

module.exports = function(httpServerOptions, _redisConnection) {
  redisConnection = _redisConnection;

  var app = express.createServer();
  app.dynamicHelpers({
    sf: function(req, res) {
      return sf;
    },
    isLoggedIn: function(req, res) {
      return function() { return redisConnection ? true : false; };
    },
    getFlashes: function(req, res) {
      return function() { return req.flash(); }
    }
  });
  app.getConfig = getConfig;
  app.saveConfig = saveConfig;
  app.login = login;
  app.logout = logout;
  app.layoutFilename = path.join(__dirname, '../web/views/layout.ejs');
  app.set('views', viewsPath);
  app.set('view engine', 'ejs');
  app.use(httpAuth(httpServerOptions.username, httpServerOptions.password))
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.query());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "rediscommander" }));
  app.use(browserify(path.join(__dirname, 'browserifyEntry.js')));
  app.use(addConnectionToRequest);
  app.use(app.router);
  app.use(express.static(staticPath));
  require('./routes')(app);

  app.listen(httpServerOptions.webPort);
};

function httpAuth(username, password){
  if (username && password){
    return express.basicAuth(function(user, pass) {
      return (username === user && password == pass);
    });
  } else {
    return function(req, res, next){
      next()
    }
  }
}

function getConfig(callback) {
  fs.readFile(getUserHome() + "/.redis-commander", 'utf8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      var config = JSON.parse(data);
      callback(null, config);
    }
  });
}

function saveConfig(config, callback) {
  fs.writeFile(getUserHome() + "/.redis-commander", JSON.stringify(config), function(err) {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
}

function isLoggedin() {
  return function() { return redisConnection ? true : false; };
}

function logout() {
  redisConnection = null;
}

function login(hostname, port, password, dbIndex, callback) {
  var errorFunction = redisConnection.stream._events.error;
  var endFunction = redisConnection.stream._events.end;
  redisConnection = redis.createClient(port, hostname)
  redisConnection.on("error", errorFunction);
  redisConnection.on("end", endFunction);
  if (password) {
    return redisConnection.auth(password, function(err) {
      if (err) {
        if (callback) {
          callback(err);
          callback = null;
        }
        return;
      }
      redisConnection.on("connect", selectDatabase);
    });
  } else {
    return redisConnection.on("connect", selectDatabase);
  }

  function selectDatabase() {
    try {
      dbIndex = parseInt(dbIndex || 0);
    } catch (e) {
      return callback(e);
    }

    return redisConnection.select(dbIndex, function(err) {
      if (err) {
        if (callback) {
          callback(err);
          callback = null;
        }
        return;
      }
      return callback();
    });
  }
}

function addConnectionToRequest(req, resp, next) {
  req.redisConnection = redisConnection;
  return next();
}
function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
