'use strict';

// allow changing the config at runtime to check the different sso key configurations
process.env.ALLOW_CONFIG_MUTATIONS = 'true';

const chai = require('chai');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const config = require('config');
const ssoKeys = require('../lib/ssoKeys');
const myUtil = require('../lib/util');
const expect = chai.expect;

/** set some sso config values and invalidate all keys cached for the old config */
function setSsoConfig(values) {
  Object.keys(values).forEach((key) => config.util.setPath(config, ['sso', key], values[key]));
  ssoKeys.resetKeyCache();
}

/** resolve the sso key for a token header the same way jsonwebtoken does */
function resolveKey(header) {
  return new Promise((resolve, reject) => ssoKeys.ssoKeyResolver(header, (err, key) => (err ? reject(err) : resolve(key))));
}

describe('Test ssoKeys.js', function() {
  const keyPair = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const otherKeyPair = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const publicKeyPem = keyPair.publicKey.export({type: 'spki', format: 'pem'});
  const publicJwk = Object.assign({kid: 'key-1', use: 'sig', alg: 'RS256'}, keyPair.publicKey.export({format: 'jwk'}));

  let jwksServer;
  let jwksUri;
  let jwksRequests = 0;
  let jwksDocument = null;
  let jwksStatus = 200;

  before(function(done) {
    jwksServer = http.createServer(function(req, res) {
      jwksRequests++;
      res.writeHead(jwksStatus, {'content-type': 'application/json'});
      res.end(JSON.stringify(jwksDocument));
    });
    jwksServer.listen(0, '127.0.0.1', function() {
      jwksUri = `http://127.0.0.1:${jwksServer.address().port}/jwks.json`;
      done();
    });
  });

  after(function(done) {
    jwksServer.close(done);
  });

  beforeEach(function() {
    jwksRequests = 0;
    jwksStatus = 200;
    jwksDocument = {keys: [publicJwk]};
    setSsoConfig({enabled: true, jwtSharedSecret: '', jwtPublicKey: '', jwksUri: '', jwksCacheMaxAge: 600});
  });

  describe('Test loadPublicKey function', function() {

    it('test load key from PEM string', function () {
      const key = ssoKeys.loadPublicKey(publicKeyPem);
      expect(key.type).to.equal('public');
    });

    it('test load key from file', function () {
      const keyFile = path.join(os.tmpdir(), `redis-commander-test-${process.pid}.pem`);
      fs.writeFileSync(keyFile, publicKeyPem);
      try {
        const key = ssoKeys.loadPublicKey(keyFile);
        expect(key.type).to.equal('public');
      }
      finally {
        fs.unlinkSync(keyFile);
      }
    });

    it('test invalid key data throws', function () {
      expect(() => ssoKeys.loadPublicKey('-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----')).to.throw();
    });

    it('test missing key file throws', function () {
      expect(() => ssoKeys.loadPublicKey('/does/not/exist.pem')).to.throw();
    });
  });

  describe('Test JwksClient', function() {

    it('test download key by key id', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1').then(function(key) {
        expect(key.type).to.equal('public');
        expect(jwksRequests).to.equal(1);
      });
    });

    it('test downloaded keys are cached', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1')
        .then(() => client.getSigningKey('key-1'))
        .then(function() {
          expect(jwksRequests, 'second request served from cache').to.equal(1);
        });
    });

    it('test keys are refreshed after cache max age', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 0);
      return client.getSigningKey('key-1')
        .then(() => client.getSigningKey('key-1'))
        .then(function() {
          expect(jwksRequests).to.equal(2);
        });
    });

    it('test parallel requests are sent only once', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return Promise.all([client.getSigningKey('key-1'), client.getSigningKey('key-1')])
        .then(function() {
          expect(jwksRequests).to.equal(1);
        });
    });

    it('test key without key id used if key set contains a single key only', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey(null).then(function(key) {
        expect(key.type).to.equal('public');
      });
    });

    it('test key without key id not used if key set is ambiguous', function () {
      jwksDocument = {keys: [publicJwk, Object.assign({}, publicJwk, {kid: 'key-2'})]};
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey(null).then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('no key with id')
      );
    });

    it('test refresh for unknown key ids is rate limited', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('unknown').then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('no key with id "unknown"')
      )
      .then(() => client.getSigningKey('unknown'))
      .then(
        () => expect.fail('key resolution should not succeed'),
        function(err) {
          expect(err.message).to.contain('refreshed some seconds ago');
          expect(jwksRequests, 'no second download for unknown key id').to.equal(1);
        }
      );
    });

    it('test cached keys are used if endpoint is not reachable anymore', function () {
      const client = new ssoKeys.JwksClient(jwksUri, 0);
      return client.getSigningKey('key-1')
        .then(function() {
          jwksStatus = 503;
          return client.getSigningKey('key-1');
        })
        .then(function(key) {
          expect(key.type).to.equal('public');
          expect(jwksRequests).to.equal(2);
        });
    });

    it('test error status of endpoint', function () {
      jwksStatus = 404;
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1').then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('http status 404')
      );
    });

    it('test key set without usable keys', function () {
      jwksDocument = {keys: [{kty: 'oct', kid: 'key-1', k: 'c2VjcmV0'}]};
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1').then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('no usable signature validation key')
      );
    });

    it('test key set with encryption keys only', function () {
      jwksDocument = {keys: [Object.assign({}, publicJwk, {use: 'enc'})]};
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1').then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('no usable signature validation key')
      );
    });

    it('test invalid document at endpoint', function () {
      jwksDocument = {noKeysAtAll: true};
      const client = new ssoKeys.JwksClient(jwksUri, 600);
      return client.getSigningKey('key-1').then(
        () => expect.fail('key resolution should not succeed'),
        (err) => expect(err.message).to.contain('contains no "keys" list')
      );
    });
  });

  describe('Test ssoKeyResolver function', function() {

    it('test resolve shared secret', function () {
      setSsoConfig({jwtSharedSecret: 'my-secret'});
      return resolveKey({alg: 'HS256'}).then((key) => expect(key).to.equal('my-secret'));
    });

    it('test resolve static public key', function () {
      setSsoConfig({jwtPublicKey: publicKeyPem});
      return resolveKey({alg: 'RS256'}).then((key) => expect(key.type).to.equal('public'));
    });

    it('test resolve key from jwks endpoint', function () {
      setSsoConfig({jwksUri: jwksUri});
      return resolveKey({alg: 'RS256', kid: 'key-1'}).then((key) => expect(key.type).to.equal('public'));
    });

    it('test verify RS256 token with key from jwks endpoint', function () {
      setSsoConfig({jwksUri: jwksUri});
      const token = jwt.sign({sub: 'someUser'}, keyPair.privateKey, {algorithm: 'RS256', expiresIn: 60, keyid: 'key-1'});
      return new Promise((resolve, reject) => {
        jwt.verify(token, ssoKeys.ssoKeyResolver, {algorithms: ['RS256']}, (err, decoded) => (err ? reject(err) : resolve(decoded)));
      })
      .then((decoded) => expect(decoded.sub).to.equal('someUser'));
    });

    it('test verify RS256 token with static public key', function () {
      setSsoConfig({jwtPublicKey: publicKeyPem});
      const token = jwt.sign({sub: 'someUser'}, keyPair.privateKey, {algorithm: 'RS256', expiresIn: 60});
      return new Promise((resolve, reject) => {
        jwt.verify(token, ssoKeys.ssoKeyResolver, {algorithms: ['RS256']}, (err, decoded) => (err ? reject(err) : resolve(decoded)));
      })
      .then((decoded) => expect(decoded.sub).to.equal('someUser'));
    });

    it('test token signed with another key is rejected', function () {
      setSsoConfig({jwksUri: jwksUri});
      const token = jwt.sign({sub: 'someUser'}, otherKeyPair.privateKey, {algorithm: 'RS256', expiresIn: 60, keyid: 'key-1'});
      return new Promise((resolve) => {
        jwt.verify(token, ssoKeys.ssoKeyResolver, {algorithms: ['RS256']}, (err) => resolve(err));
      })
      .then((err) => expect(err.message).to.contain('invalid signature'));
    });
  });
});


describe('Test SSO configuration validation', function() {

  /** run config validation and return all error messages written to console */
  function validateConfig() {
    const origError = console.error;
    const messages = [];
    console.error = (msg) => messages.push(msg);
    try {
      myUtil.validateConfig();
    }
    catch (e) {
      return messages.join('\n');
    }
    finally {
      console.error = origError;
    }
    return '';
  }

  afterEach(function() {
    setSsoConfig({enabled: false, jwtSharedSecret: '', jwtPublicKey: '', jwksUri: '',
      jwtAlgorithms: ['HS256', 'HS384', 'HS512']});
  });

  it('test sso disabled needs no keys', function () {
    setSsoConfig({enabled: false, jwtSharedSecret: '', jwtPublicKey: '', jwksUri: ''});
    expect(validateConfig()).to.equal('');
  });

  it('test enabled sso without any key configured', function () {
    setSsoConfig({enabled: true, jwtSharedSecret: '', jwtPublicKey: '', jwksUri: ''});
    expect(validateConfig()).to.contain('no key to validate the JWT signature configured');
  });

  it('test enabled sso with more than one key configured', function () {
    setSsoConfig({enabled: true, jwtSharedSecret: 'secret', jwksUri: 'https://idp.example.com/jwks.json'});
    expect(validateConfig()).to.contain('Only one key to validate SSO JWT signatures allowed');
  });

  it('test hmac algorithms rejected for jwks endpoint', function () {
    setSsoConfig({enabled: true, jwksUri: 'https://idp.example.com/jwks.json', jwtAlgorithms: ['RS256', 'HS256']});
    expect(validateConfig()).to.contain('must not contain the HMAC algorithms HS256');
  });

  it('test invalid jwks url', function () {
    setSsoConfig({enabled: true, jwksUri: 'not-an-url', jwtAlgorithms: ['RS256']});
    expect(validateConfig()).to.contain('is not a valid url');
  });

  it('test invalid public key', function () {
    setSsoConfig({enabled: true, jwtPublicKey: '/does/not/exist.pem', jwtAlgorithms: ['RS256']});
    expect(validateConfig()).to.contain('neither a PEM encoded public key nor the name of a file');
  });

  it('test valid jwks configuration', function () {
    setSsoConfig({enabled: true, jwksUri: 'https://idp.example.com/jwks.json', jwtAlgorithms: ['RS256']});
    expect(validateConfig()).to.equal('');
  });

  it('test algorithm list may be set as comma separated string', function () {
    setSsoConfig({enabled: true, jwksUri: 'https://idp.example.com/jwks.json', jwtAlgorithms: 'RS256, ES256'});
    expect(validateConfig()).to.equal('');
    expect(config.get('sso.jwtAlgorithms')).to.deep.equal(['RS256', 'ES256']);
  });
});
