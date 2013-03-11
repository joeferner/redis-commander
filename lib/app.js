'use strict';

var sf = require('sf');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var redis = require('redis');
var express = require('express');
var browserify = require('browserify');
var myUtils = require('./util');

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnections = [];
redisConnections.getLast = myUtils.getLast;

module.exports = function(httpServerOptions, _redisConnection) {
  redisConnections.push(_redisConnection);
  var app = express.createServer();
  app.dynamicHelpers({
    sf: function(req, res) {
      return sf;
    },
    //TODO: GET THE STATUS OF THE CORRECT CONNECTION.
    isLoggedIn: function(req, res) {
      return function() { return redisConnections[0] ? true : false; };
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
  app.use(httpAuth(httpServerOptions.username, httpServerOptions.password));
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

  console.log("listening on ", httpServerOptions.webPort);
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

function logout() {
  //TODO:GET THE INDEX OF THE CONNECTION TO BE TERMINATED.
  redisConnection[0] = null;
}

function login(hostname, port, password, dbIndex, callback) {
  console.log('connecting... ', hostname, port);
  redisConnections.push(redis.createClient(port, hostname));
  redisConnections.getLast().on("error", function (err) {
    console.error("Redis error", err.stack);
  });
  redisConnections.getLast().on("end", function () {
    console.log("Connection closed. Attempting to Reconnect...");
  });
  if (password) {
    return redisConnections.getLast().auth(password, function(err) {
      if (err) {
        console.error("Could not authenticate", err.stack);
        if (callback) {
          callback(err);
          callback = null;
        }
        return;
      }
      redisConnections.getLast().on("connect", selectDatabase);
    });
  } else {
    return redisConnections.getLast().on("connect", selectDatabase);
  }

  function selectDatabase() {
    try {
      dbIndex = parseInt(dbIndex || 0);
    } catch (e) {
      return callback(e);
    }

    return redisConnections.getLast().select(dbIndex, function(err) {
      if (err) {
        console.log("could not select database", err.stack);
        if (callback) {
          callback(err);
          callback = null;
        }
        return;
      }
      console.log("Using Redis DB #" + dbIndex);
      return callback();
    });
  }
}

function addConnectionToRequest(req, resp, next) {
  req.redisConnection = redisConnections.getLast();
  return next();
}
function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
