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
  app.use(function(req, res, next) {
    res.locals.sf = sf;
    res.locals.getFlashes = function() {
      if (req.query.error === 'login') {
        return {
          "error": ["Invalid Login"]
        };
      }
      return {};
    };
    next();
  });

  app.redisConnections = redisConnections;
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
  app.use('/bootstrap', express.static(path.join(staticPath, '/bootstrap')));
  app.use('/clippy-jquery', express.static(path.join(staticPath, '/clippy-jquery')));
  app.use('/css', express.static(path.join(staticPath, '/css')));
  app.use('/favicon.png', express.static(path.join(staticPath, '/favicon.png')));
  app.use('/images', express.static(path.join(staticPath, '/images')));
  app.use('/json-tree', express.static(path.join(staticPath, '/json-tree')));
  app.use('/jstree', express.static(path.join(staticPath, '/jstree')));
  app.use('/scripts', express.static(path.join(staticPath, '/scripts')));
  app.use('/templates', express.static(path.join(staticPath, '/templates')));
  
  var browserifyCallback = browserify(['cmdparser','readline-browserify']);
  // WTF I don't know how to use app.use(app.router) so order will be maintained
  app.use('/browserify.js', function(req, res, next) {
    if ((req.method !== 'GET') || (req.path !== '/')) {
      return next();
    }
    return browserifyCallback(req, res, next);
  });
  
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(methodOverride());
  app.use(express.query());
  app.use('/', function(req, res, next) {
    if ((req.method !== 'GET') || (req.path !== '/')) {
      return next();
    }
    res.render('home/home.ejs', {
      title: 'Home',
      layout: req.app.layoutFilename
    });
  });
  app.use('/signin', function(req, res, next) {
    if ((req.method !== 'POST') || (req.path !== '/')) {
      return next();
    }
    if (req.body && (req.body.username || req.body.password)) {
      if (req.body && (req.body.username == 'admin') && (req.body.password == 'password')) {
        console.log("Correct password");
        return res.json({
          "ok": true,
          "token": '' + (new Date() * 1),
          "singleToken": '' + (new Date() * 1),
        });
      } else {
        console.log("Incorrect password");
        return res.json({
          "ok": false
        });
      }
    }
    var authorization = (req.get('Authorization') || '').split(/\s+/);
    if (/^Bearer$/i.test(authorization[0])) {
      var token = authorization[1] || '0';
      var d = new Date(token * 1);
      if (new Date() - d < 60000) {
        return res.json({
          "ok": true,
          "token": '' + (new Date() * 1),
          "singleToken": '' + (new Date() * 1),
        });
      }
      console.log("no token");
    }
    console.log("no token no auth");
    return res.json({
      "ok": false
    });
  });
  app.use(function(req, res, next) {
    var redisCommanderAccessToken;
    if (req.body && req.body.redisCommanderAccessToken) {
      redisCommanderAccessToken = req.body.redisCommanderAccessToken;
    } else if (req.query.redisCommanderAccessToken) {
      redisCommanderAccessToken = req.query.redisCommanderAccessToken;
    } else {
      var authorization = (req.get('Authorization') || '').split(/\s+/);
      if (/^Bearer$/i.test(authorization[0])) {
        redisCommanderAccessToken = '' + (authorization[1] || '');
      }
    }

    if (!redisCommanderAccessToken) {
      res.statusCode = 401;
      return res.end('Unauthorized - Missing Token');
    }
    
    if (!redisCommanderAccessToken || (new Date() - ((redisCommanderAccessToken * 1) || 0) > 60000)) {
      res.statusCode = 401;
      return res.end('Unauthorized - Token Expired');
    }

    next();
  });
  // app.use(httpAuth(httpServerOptions.username, httpServerOptions.passwordHash || httpServerOptions.password, !!httpServerOptions.passwordHash));
  // app.use(addConnectionsToRequest);
  // app.use(express.cookieParser());
  // app.use(express.session({ secret: "rediscommander" }));
  app.use(app.router);
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
  function onceCallback(err) {
    if (!callback) {
      return;
    }
    var callbackCopy = callback;
    callback = null;
    callbackCopy(err);
  }

  console.log('connecting... ', hostname, port);
  var client = new Redis(port, hostname);
  client.label = label;
  var isPushed = false;
  client.on("error", function (err) {
    console.error("Redis error", err.stack);
    if (!isPushed) {
      console.error("Quiting Redis");
      client.quit();
      client.disconnect();
    }
    onceCallback(err);
  });
  client.on("end", function () {
    console.log("Connection closed. Attempting to Reconnect...");
  });
  if (password) {
    return client.auth(password, function (err) {
      if (err) {
        console.error("Could not authenticate", err.stack);
        return onceCallback(err);
      }
      client.on("connect", selectDatabase);
    });
  } else {
    return client.on("connect", selectDatabase);
  }

  function selectDatabase () {
    try {
      dbIndex = parseInt(dbIndex || 0);
    } catch (e) {
      return onceCallback(e);
    }

    return client.select(dbIndex, function (err) {
      if (err) {
        console.log("could not select database", err.stack);
        return onceCallback(err)
      }
      console.log("Using Redis DB #" + dbIndex);
      redisConnections.push(client);
      isPushed = true;
      return onceCallback();
    });
  }
}
