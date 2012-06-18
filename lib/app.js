'use strict';

var sf = require('sf');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var redis = require('redis');
var express = require('express');

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnection = null;

module.exports = function (webPort, _redisConnection) {
  redisConnection = _redisConnection;

  var app = express.createServer();
  app.dynamicHelpers({
    sf: function (req, res) {
      return sf;
    },
    isLoggedIn: function (req, res) {
      return function () { return redisConnection ? true : false; };
    },
    getFlashes: function (req, res) {
      return function () { return req.flash(); }
    }
  });
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
  app.use(addConnectionToRequest);
  app.use(app.router);
  app.use(express.static(staticPath));
  require('./routes')(app);

  app.listen(webPort);

  console.log("listening on ", webPort);
};

function logout() {
  redisConnection = null;
}

function login(hostname, port, callback) {
  console.log('connecting... ', hostname, port);
  redisConnection = redis.createClient(port, hostname);
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
    if (callback) {
      callback(err);
      callback = null;
    }
  });
  redisConnection.on("connect", callback);
}

function addConnectionToRequest(req, resp, next) {
  req.redisConnection = redisConnection;
  return next();
}
