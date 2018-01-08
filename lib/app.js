'use strict';

var sf = require('sf');
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var Redis = require('ioredis');
var express = require('express');
var browserify = require('browserify-middleware');
var myUtils = require('./util');
var methodOverride = require('method-override');
var bodyParser = require('body-parser');
var partials = require('express-partials');
var flash = require('express-flash');
var basicAuth = require('basic-auth');
var crypto = require('crypto');
var bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

function equalStrings(a, b) {
  if (!crypto.timeingSafeEqual) {
    return a === b;
  }
  var bufA = Buffer.from(a);
  var bufB = Buffer.from(b);
  // Funny way to force buffers to have same length
  return crypto.timingSafeEqual(
    Buffer.concat([a, b]),
    Buffer.concat([b, a])
  );
}

// process.chdir( path.join(__dirname, '..') );    // fix the cwd

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnections = [];
redisConnections.getLast = myUtils.getLast;

module.exports = function (httpServerOptions, _redisConnections, nosave, rootPattern) {
  redisConnections = _redisConnections;
  var app = express();
  app.use(partials());
  app.use(flash());
  app.use(function(req, res, next) {
    res.locals.sf = sf;
    res.locals.getFlashes = function() {
      return req.flash();
    };
    res.locals.getConnections = function() {
      return req.redisConnections;
    };
    next();
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
  app.rootPattern = rootPattern;
  app.set('views', viewsPath);
  app.set('view engine', 'ejs');
  app.use(httpAuth(httpServerOptions.username, httpServerOptions.passwordHash || httpServerOptions.password, !!httpServerOptions.passwordHash));
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(methodOverride());
  app.use(express.query());
  app.use(express.cookieParser());
  app.use(express.session({ secret: "rediscommander" }));
  app.use(addConnectionsToRequest);
  app.get('/browserify.js', browserify(['cmdparser','readline-browserify']));
  app.use(app.router);
  app.use(express.static(staticPath));
  require('./routes')(app);
  return app;
};

function httpAuth (username, password, isPasswordHashed) {
  if (username && password) {
    return function(req, res, next) {
      var credentials = basicAuth(req);

      var cachedPasswordHash;

      Promise.resolve()
      .then(() => {
        if (!credentials || (credentials.name !== username)) {
          return false;
        }
        if (!isPasswordHashed) {
          return equalStrings(credentials.pass, password);
        }

        if (cachedPasswordHash) {
          return equalStrings(
            crypto.createHmac('sha512', cachedPasswordHash.key).update(credentials.pass).digest().toString('base64'),
            cachedPasswordHash.value
          );
        }

        return bcrypt.compare(`${credentials.pass}`, password)
        .then(success => {
          if (success) {
            crypto.randomBytes(32, (err, buf) => {
              if (err) {
                return console.error(`Failed to genenerate random bytes: ${err}`);
              }
              var key = buf.toString('base64');
              cachedPasswordHash = {
                "key": key,
                "value": crypto.createHmac('sha512', key).update(`${credentials.pass}`).digest().toString('base64')
              };
            });
          }
          return success;
        })
        .catch(err => {
          console.errror(`bcrypt error: ${err}`);
          return false;
        })
      })
      .then(success => {
        if (!success) {
          res.statusCode = 401;
          res.setHeader('WWW-Authenticate', 'Basic realm="Awear Solutions"');
          return res.end('Access denied');
        }
        return setImmediate(() => next());
      });
    }
  } else {
    return function (req, res, next) {
      next()
    }
  }
}

function logout (hostname, port, db, callback) {
  var notRemoved = true;
  redisConnections.forEach(function (instance, index) {
    if (notRemoved && instance.options.host == hostname && instance.options.port == port && instance.options.db == db) {
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
  var client = new Redis(port, hostname);
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
