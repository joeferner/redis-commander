'use strict';

var sf = require('sf');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var redis = require('redis');
var express = require('express');
var browserify = require('browserify-middleware');
var myUtils = require('./util');

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnections = [];
redisConnections.getLast = myUtils.getLast;

module.exports = function (httpServerOptions, _redisConnections, nosave) {
  redisConnections = _redisConnections;
  var app = express.createServer();
  app.dynamicHelpers({
    sf: function (req, res) {
      return sf;
    },
    getFlashes: function (req, res) {
      return function () {
        return req.flash();
      }
    },
    getConnections: function (req, res) {
      return function () {
        return req.redisConnections;
      }
    }
  });
  app.getConfig = myUtils.getConfig;
  if (!nosave) {
     app.saveConfig = myUtils.saveConfig;
  } else {
     app.saveConfig = function (config, callback) { callback(null) };
  }

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
  app.use(addConnectionsToRequest);
  app.get('/browserify.js', browserify(['cmdparser','readline-browserify']));
  app.use(app.router);
  app.use(express.static(staticPath));
  require('./routes')(app);

  app.listen(httpServerOptions.webPort, httpServerOptions.webAddress);

  console.log("listening on ", httpServerOptions.webAddress, ":", httpServerOptions.webPort);
};

function httpAuth (username, password) {
  if (username && password) {
    return express.basicAuth(function (user, pass) {
      return (username === user && password == pass);
    });
  } else {
    return function (req, res, next) {
      next()
    }
  }
}

function logout (hostname, port, db, callback) {
  var notRemoved = true;
  redisConnections.forEach(function (instance, index) {
    if (notRemoved && instance.host == hostname && instance.port == port && instance.selected_db == db) {
      notRemoved = false;
      var connectionToClose = redisConnections.splice(index, 1);
      connectionToClose[0].quit();
    }
  });
  if (notRemoved) {
    return callback(new Error("Could not remove ", hostname, port, "."));
  } else {
    return callback(null);
  }
}

function login (label, hostname, port, password, dbIndex, callback) {
  console.log('connecting... ', hostname, port);
  var client = redis.createClient(port, hostname);
  client.label = label;
  redisConnections.push(client);
  redisConnections.getLast().on("error", function (err) {
    console.error("Redis error", err.stack);
  });
  redisConnections.getLast().on("end", function () {
    console.log("Connection closed. Attempting to Reconnect...");
  });
  if (password) {
    return redisConnections.getLast().auth(password, function (err) {
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

  function selectDatabase () {
    try {
      dbIndex = parseInt(dbIndex || 0);
    } catch (e) {
      return callback(e);
    }

    return redisConnections.getLast().select(dbIndex, function (err) {
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

function addConnectionsToRequest (req, res, next) {
  req.redisConnections = redisConnections;
  return next();
}
