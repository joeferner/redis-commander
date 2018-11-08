'use strict';

let sf = require('sf');
let ejs = require('ejs');
let path = require('path');
let Redis = require('ioredis');
let express = require('express');
let browserify = require('browserify-middleware');
let myUtils = require('./util');
let bodyParser = require('body-parser');
let partials = require('express-partials');
let jwt = require('jsonwebtoken');
let crypto = require('crypto');
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}

function equalStrings(a, b) {
  if (!crypto.timingSafeEqual) {
    return a === b;
  }
  let bufA = Buffer.from(`${a}`);
  let bufB = Buffer.from(`${b}`);
  // Funny way to force buffers to have same length
  return crypto.timingSafeEqual(
    Buffer.concat([bufA, bufB]),
    Buffer.concat([bufB, bufA])
  );
}

let usedTokens = new Set();

function jwtSign(jwtSecret, data) {
  return new Promise((resolve, reject) => jwt.sign(data, jwtSecret, {
    "issuer": "Redis Commander",
    "subject": "Session Token",
    "expiresIn": 60
  }, (err, token) => (err ? reject(err) : resolve(token))));
}

function jwtVerify(jwtSecret, token) {
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

let viewsPath = path.join(__dirname, '../web/views');
let staticPath = path.join(__dirname, '../web/static');
let modulesPath = path.join(__dirname, '../node_modules');
let redisConnections = [];

module.exports = function (httpServerOptions, _redisConnections, _appOptions) {
  const urlPrefix = httpServerOptions.urlPrefix || '';
  redisConnections = _redisConnections;

  let app = express();
  app.disable('x-powered-by');
  app.use(partials());

  app.getConfig = myUtils.getConfig;
  if (!_appOptions.noSave) {
     app.saveConfig = myUtils.saveConfig;
  } else {
     app.saveConfig = function (config, callback) { callback(null) };
  }
  app.login = login;
  app.logout = logout;

  app.locals.layoutFilename = path.join(__dirname, '../web/views/layout.ejs');
  app.locals.redisConnections = redisConnections;
  app.locals.rootPattern = _appOptions.rootPattern;
  app.locals.noLogData = _appOptions.noLogData;
  app.locals.foldingCharacter = _appOptions.foldingChar;
  app.locals.httpAuthDisabled = (!httpServerOptions.username || !(httpServerOptions.passwordHash || httpServerOptions.password));
  app.locals.jwtSecret = _appOptions.defaultJwtSecret || crypto.randomBytes(20).toString('base64');
  app.locals.sf = sf;

  app.set('views', viewsPath);
  app.set('view engine', 'ejs');

  app.use(`${urlPrefix}/bootstrap`, express.static(path.join(staticPath, '/bootstrap')));
  app.use(`${urlPrefix}/css`, express.static(path.join(staticPath, '/css')));
  app.use(`${urlPrefix}/favicon.png`, express.static(path.join(staticPath, '/favicon.png')));
  app.use(`${urlPrefix}/images`, express.static(path.join(staticPath, '/images')));
  app.use(`${urlPrefix}/json-tree`, express.static(path.join(staticPath, '/json-tree')));
  app.use(`${urlPrefix}/jstree`, express.static(path.join(modulesPath, '/jstree/dist')));
  app.use(`${urlPrefix}/clipboard`, express.static(path.join(modulesPath, '/clipboard/dist')));
  app.use(`${urlPrefix}/dateformat`, express.static(path.join(modulesPath, '/dateformat/lib/')));
  app.use(`${urlPrefix}/scripts`, express.static(path.join(staticPath, '/scripts')));
  app.use(`${urlPrefix}/templates`, express.static(path.join(staticPath, '/templates')));

  app.get(`${urlPrefix}/browserify.js`, browserify(['cmdparser','readline-browserify']));

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  app.get(`${urlPrefix}/`, getIndexPage);
  app.post(`${urlPrefix}/signin`, function(req, res, next) {
    return Promise.resolve()
    .then(() => {
      if (req.app.locals.httpAuthDisabled) {
        return true;
      }
      if (req.body && (req.body.username || req.body.password)) {
        // signin with username and password
        // explicit casts as fix for possible numeric username or password
        // no fast exit on wrong username to let evil guy not guess existing ones
        let validUser = true;
        let validPass = false;
        if (String(req.body.username) !== String(httpServerOptions.username)) {
          validUser = false;
        }
        if (httpServerOptions.passwordHash) {
          validPass = bcrypt.compare(String(req.body.password), String(httpServerOptions.passwordHash))
        }
        else {
          validPass = equalStrings(String(req.body.password), String(httpServerOptions.password));
        }
        // do log outcome on first login, all following requests use jwt
        if (validUser && validPass) {
          console.log('Login success for user ' + String(req.body.username) + ' from remote ip ' + req.ip);
        }
        else {
          console.log('Login failed from remote ip ' + req.ip);
        }
        return validUser && validPass;
      }
      let authorization = (req.get('Authorization') || '').split(/\s+/);
      if (/^Bearer$/i.test(authorization[0])) {
        return new jwtVerify(req.app.locals.jwtSecret, authorization[1] || '');
      }
      return false;
    })
    .then(success => {
      if (!success) {
        return res.json({
          "ok": false
        });
      }
      return Promise.all([jwtSign(req.app.locals.jwtSecret, {}), jwtSign(req.app.locals.jwtSecret, {
        "singleUse": true
      })])
      .then(([bearerToken, queryToken]) => res.json({
        "ok": true,
        "bearerToken": bearerToken,
        "queryToken": queryToken
      }));
    });
  });
  app.use(verifyAuthorizationToken);

  require('./routes')(app, urlPrefix);
  return app;
};


function getIndexPage(req, res) {
    res.render('home/home.ejs', {
        title: 'Home',
        layout: req.app.locals.layoutFilename
    });
}

function verifyAuthorizationToken(req, res, next) {
  if (req.app.locals.httpAuthDisabled) {
      return next();
  }
  let token;
  if (req.body && req.body.redisCommanderQueryToken) {
      token = req.body.redisCommanderQueryToken;
  } else if (req.query.redisCommanderQueryToken) {
      token = req.query.redisCommanderQueryToken;
  } else {
      let authorization = `${req.get('Authorization') || ''}`.split(/\s+/);
      if (/^Bearer$/i.test(authorization[0])) {
          token = `${authorization[1] || ''}`;
      }
  }

  if (!token) {
      return res.status(401).end('Unauthorized - Missing Token');
  }
  return jwtVerify(req.app.locals.jwtSecret, token)
    .then(success => {
        if (!success) {
          return res.status(401).end('Unauthorized - Token Invalid or Expired');
        }
        return next();
    });
}

function logout (hostname, port, db, callback) {
  let notRemoved = true;
  redisConnections.forEach(function (instance, index) {
    if (notRemoved && instance.options.host == hostname && instance.options.port == port && instance.options.db == db) {
      notRemoved = false;
      let connectionToClose = redisConnections.splice(index, 1);
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
    let callbackCopy = callback;
    callback = null;
    callbackCopy(err);
  }

  console.log('connecting... ', hostname, port);
  let client = new Redis({
    port: port,
    host: hostname,
    family: 4,
    db: dbIndex,
    password: password,
    connectionName: "redis-commander"
  });
  client.label = label;
  let isPushed = false;
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
  return client.on("connect", selectDatabase);

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
