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
var jwt = require('jsonwebtoken');
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
  var bufA = Buffer.from(`${a}`);
  var bufB = Buffer.from(`${b}`);
  // Funny way to force buffers to have same length
  return crypto.timingSafeEqual(
    Buffer.concat([a, b]),
    Buffer.concat([b, a])
  );
}

var jwtSecret = crypto.randomBytes(20).toString('base64');
var usedTokens = new Set();

function jwtSign(data) {
  return new Promise((resolve, reject) => jwt.sign(data, jwtSecret, {
    "issuer": "Redis Commander",
    "subject": "Session Token",
    "expiresIn": 60
  }, (err, token) => (err ? reject(err) : resolve(token))));
}

function jwtVerify(token) {
  return new Promise(resolve => {
    jwt.verify(token, jwtSecret, {
      "issuer": "Redis Commander",
      "subject": "Session Token"
    }, (err, decodedToken) => {
      if (err) {
        return resolve(false);
      }
      if (decodedToken.singleUse) {
        if (usedTokens.has(token)) {
          console.log("Single-Usage token already used");
          return resolve(false);
        }
        usedTokens.add(token);
        if (decodedToken.exp) {
          setTimeout(() => {
            usedTokens.delete(token);
          }, ((decodedToken.exp * 1 + 10) * 1e3) - (new Date() * 1))
        }
      }
      return resolve(true);
    });
  })
}

// process.chdir( path.join(__dirname, '..') );    // fix the cwd

var viewsPath = path.join(__dirname, '../web/views');
var staticPath = path.join(__dirname, '../web/static');
var redisConnections = [];

module.exports = function (httpServerOptions, _redisConnections, nosave, rootPattern) {
  const urlPrefix = httpServerOptions.urlPrefix || '';
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
  app.use(`${urlPrefix}/bootstrap`, express.static(path.join(staticPath, '/bootstrap')));
  app.use(`${urlPrefix}/clippy-jquery`, express.static(path.join(staticPath, '/clippy-jquery')));
  app.use(`${urlPrefix}/css`, express.static(path.join(staticPath, '/css')));
  app.use(`${urlPrefix}/favicon.png`, express.static(path.join(staticPath, '/favicon.png')));
  app.use(`${urlPrefix}/images`, express.static(path.join(staticPath, '/images')));
  app.use(`${urlPrefix}/json-tree`, express.static(path.join(staticPath, '/json-tree')));
  app.use(`${urlPrefix}/jstree`, express.static(path.join(staticPath, '/jstree')));
  app.use(`${urlPrefix}/scripts`, express.static(path.join(staticPath, '/scripts')));
  app.use(`${urlPrefix}/templates`, express.static(path.join(staticPath, '/templates')));

  var browserifyCallback = browserify(['cmdparser','readline-browserify']);
  // WTF I don't know how to use app.use(app.router) so order will be maintained
  app.use(`${urlPrefix}/browserify.js`, function(req, res, next) {
    if ((req.method !== 'GET') || (req.path !== '/')) {
      return next();
    }
    return browserifyCallback(req, res, next);
  });

  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(methodOverride());
  app.use(express.query());
  app.use(`${urlPrefix}`, function(req, res, next) {
    if ((req.method !== 'GET') || (req.path !== '/')) {
      return next();
    }
    res.render('home/home.ejs', {
      title: 'Home',
      layout: req.app.layoutFilename
    });
  });
  app.use(`${urlPrefix}/signin`, function(req, res, next) {
    if ((req.method !== 'POST') || (req.path !== '/')) {
      return next();
    }
    return Promise.resolve()
    .then(() => {
      if (!httpServerOptions.username || !(httpServerOptions.passwordHash || httpServerOptions.password)) {
        // username is not defined or password is not defined
        return true;
      }
      if (req.body && (req.body.username || req.body.password)) {
        // signin with username and password
        if (req.body.username !== httpServerOptions.username) {
          return false;
        }
        if (httpServerOptions.passwordHash) {
          return bcrypt.compare(`${req.body.password}`, httpServerOptions.passwordHash)
        }
        return equalStrings(`${req.body.password}`, httpServerOptions.password);
      }
      var authorization = (req.get('Authorization') || '').split(/\s+/);
      if (/^Bearer$/i.test(authorization[0])) {
        return new jwtVerify(authorization[1] || '');
      }
      return false;
    })
    .then(success => {
      if (!success) {
        return res.json({
          "ok": false
        });
      }
      return Promise.all([jwtSign({}), jwtSign({
        "singleUse": true
      })])
      .then(([bearerToken, queryToken]) => res.json({
        "ok": true,
        "bearerToken": bearerToken,
        "queryToken": queryToken
      }));
    });
  });
  app.use(function(req, res, next) {
    if (!httpServerOptions.username || !(httpServerOptions.passwordHash || httpServerOptions.password)) {
      return next();
    }
    var token;
    if (req.body && req.body.redisCommanderQueryToken) {
      token = req.body.redisCommanderQueryToken;
    } else if (req.query.redisCommanderQueryToken) {
      token = req.query.redisCommanderQueryToken;
    } else {
      var authorization = `${req.get('Authorization') || ''}`.split(/\s+/);
      if (/^Bearer$/i.test(authorization[0])) {
        token = `${authorization[1] || ''}`;
      }
    }

    if (!token) {
      res.statusCode = 401;
      return res.end('Unauthorized - Missing Token');
    }
    return jwtVerify(token)
    .then(success => {
      if (!success) {
        res.statusCode = 401;
        return res.end('Unauthorized - Token Invalid or Expired');
      }

      return next();
    });
  });
  app.use(app.router);
  require('./routes')(app, urlPrefix);
  return app;
};

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
  var client = new Redis({
    port: port,
    host: hostname,
    family: 4,
    dbIndex: dbIndex,
    password: password
  });
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
