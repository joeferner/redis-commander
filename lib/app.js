'use strict';

let sf = require('sf');
// let ejs = require('ejs');
let path = require('path');
// let Redis = require('ioredis');
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

let config = require('config');


function comparePasswords(a, b) {
  // make shure booth buffers have same length and make time comparision attacks to
  // guess pw length harder by calculation fixed length hmacs first
  let key = crypto.pseudoRandomBytes(32);
  let bufA = crypto.createHmac('sha256', key).update(a).digest();
  let bufB = crypto.createHmac('sha256', key).update(b).digest();

  let ret = true;
  if (crypto.timingSafeEqual) {
    ret = crypto.timingSafeEqual(bufA, bufB);
  }
  else {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        ret = false;
      }
    }
  }
  return ret;
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

let viewsPath = path.join(__dirname, '../web/views');
let staticPath = path.join(__dirname, '../web/static');
let modulesPath = path.join(__dirname, '../node_modules');
let redisConnections = [];

module.exports = function (_redisConnections) {
  const urlPrefix = config.get('server.urlPrefix') || '';
  redisConnections = _redisConnections;

  let app = express();
  app.disable('x-powered-by');
  app.use(partials());

  // express 'trust proxy' setting may be a boolean value or a string list with comma separated ip/network addresses
  // setting this value Express trusts x-forwarded-for/x-forwarded-host/x-forwarded-proto headers and sets variables accordingly
  // see https://expressjs.com/en/guide/behind-proxies.html
  if (config.get('server.trustProxy')) {
    let trustProxy = config.get('server.trustProxy');
    if (typeof trustProxy !== 'boolean' || trustProxy) {
      app.set('trust proxy', trustProxy);
    }
  }

  if (!config.get('noSave')) {
     app.saveConfig = myUtils.saveConnections;
  } else {
     app.saveConfig = function (config, callback) { callback(null) };
  }
  app.login = login;
  app.logout = logout;

  app.locals.layoutFilename = path.join(__dirname, '../web/views/layout.ejs');
  app.locals.redisConnections = redisConnections;
  app.locals.rootPattern = config.get('redis.rootPattern');
  app.locals.noLogData = config.get('noLogData');
  app.locals.foldingCharacter = config.get('ui.foldingChar');
  app.locals.httpAuthDisabled = (!config.get('server.httpAuth.username') || !(config.get('server.httpAuth.passwordHash') || config.get('server.httpAuth.password')));
  app.locals.jwtSecret = config.get('server.httpAuth.jwtSecret') || crypto.randomBytes(20).toString('base64');
  app.locals.sf = sf;

  // set here for html client side too, there only to modify displayed stuff
  // final read-only checks done at server side!
  app.locals.redisReadOnly = config.get('redis.readOnly');

  app.set('views', viewsPath);
  app.set('view engine', 'ejs');

  app.use(urlPrefix, express.static(staticPath));
  app.use(`${urlPrefix}/jstree`, express.static(path.join(modulesPath, '/jstree/dist')));
  app.use(`${urlPrefix}/clipboard`, express.static(path.join(modulesPath, '/clipboard/dist')));
  app.use(`${urlPrefix}/dateformat`, express.static(path.join(modulesPath, '/dateformat/lib/')));
  app.use(`${urlPrefix}/scripts/ejs.min.js`, express.static(path.join(modulesPath, '/ejs/ejs.min.js')));

  app.get(`${urlPrefix}/browserify.js`, browserify(['cmdparser','readline-browserify']));
  app.get(`${urlPrefix}/`, getIndexPage);

  app.use(bodyParser.urlencoded({extended: false, limit: config.get('server.clientMaxBodySize')}));
  app.use(bodyParser.json({limit: config.get('server.clientMaxBodySize')}));

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
        if (String(req.body.username) !== String(config.get('server.httpAuth.username'))) {
          validUser = false;
        }
        if (config.get('server.httpAuth.passwordHash')) {
          validPass = bcrypt.compare(String(req.body.password), String(config.get('server.httpAuth.passwordHash')))
        }
        else {
          // prevent empty passwords
          validPass = comparePasswords(String(req.body.password), String(config.get('server.httpAuth.password')));
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

function logout (connectionId, callback) {
  let notRemoved = true;
  redisConnections.forEach(function (instance, index) {
    if (notRemoved) {
      if (instance.options.connectionId === connectionId) {
        notRemoved = false;
        let connectionToClose = redisConnections.splice(index, 1);
        connectionToClose[0].quit();
      }
    }
  });
  if (notRemoved) {
    return callback(new Error("Could not remove ", hostname, port, "."));
  } else {
    return callback(null);
  }
}

function login (newConnection, callback) {
  function onceCallback(err) {
    if (!callback) {
      return;
    }
    let callbackCopy = callback;
    callback = null;
    callbackCopy(err);
  }

  if (newConnection.sentinels) {
    console.log('connecting sentinel... ', newConnection.sentinelName, JSON.stringify(newConnection.sentinels));
  }
  else {
    console.log('connecting... ', newConnection.host, newConnection.port);
  }
  let client = myUtils.createRedisClient(newConnection);

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
      newConnection.dbIndex = parseInt(newConnection.dbIndex || 0);
    } catch (e) {
      return onceCallback(e);
    }

    client.call('command', function(errCmd, cmdList) {
      if (errCmd || !Array.isArray(cmdList)) {
        console.log('redis command "command" not supported, cannot build dynamic command list');
        return;
      }
      // console.debug('Got list of ' + cmdList.length + ' commands from server ' + newConnection.host + ':' + newConnection.port);
      client.options.commandList = {
        all: cmdList.map((item) => (item[0].toLowerCase())),
        ro: cmdList.filter((item) => (item[2].indexOf('readonly') >= 0)).map((item) => (item[0].toLowerCase()))
      };
    });

    return client.select(newConnection.dbIndex, function (err) {
      if (err) {
        console.log("could not select database", err.stack);
        return onceCallback(err)
      }
      let opt = client.options;
      console.log('Redis Connection ' + (opt.path ? opt.path : opt.host + ':' + opt.port) +
        (opt.tls ? ' with TLS' : '') + ' using Redis DB #' + opt.db);
      redisConnections.push(client);
      isPushed = true;
      return onceCallback();
    });
  }
}
