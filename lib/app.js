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

module.exports = function(webPort, _redisConnection) {
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

  app.listen(webPort);

  console.log("listening on ", webPort);
};

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
  console.log('connecting... ', hostname, port);
  redisConnection = redis.createClient(port, hostname, {"max_attempts": 5});
  redisConnection.on("error", function(err) {
    console.error("Redis error", err.stack);
    if (callback) {
      callback(err);
      callback = null;
    }
  });

  if (password) {
    return redisConnection.auth(password, function(err) {
      if (err) {
        console.error("Could not authenticate", err.stack);
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
  req.redisConnection = redisConnection;
  return next();
}
function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
