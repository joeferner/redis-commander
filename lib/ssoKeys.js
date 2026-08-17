'use strict';

/** Resolve the keys used to validate the signature of external SSO JSON Web Tokens.
 *
 *  Beside a shared secret (HMAC signatures like HS256) tokens signed with a private key
 *  (RS256, PS256, ES256, ...) are supported too. The public key needed to validate these
 *  signatures is either configured statically (config key "sso.jwtPublicKey") or downloaded
 *  from the JSON Web Key Set (JWKS) endpoint of the identity provider (config key "sso.jwksUri").
 *
 *  Keys downloaded from a JWKS endpoint are cached in memory. They are refreshed after
 *  "sso.jwksCacheMaxAge" seconds and whenever a token references an unknown key id - the
 *  latter rate limited to not allow flooding the identity provider with requests.
 */

let fs = require('fs');
let http = require('http');
let https = require('https');
let crypto = require('crypto');

let config = require('config');

/** timeout in milliseconds for a single http request to the JWKS endpoint */
const JWKS_REQUEST_TIMEOUT = 5000;
/** maximum size in bytes accepted as answer from the JWKS endpoint */
const JWKS_MAX_RESPONSE_SIZE = 512 * 1024;
/** minimum time in milliseconds between two requests to the JWKS endpoint */
const JWKS_MIN_REFRESH_INTERVAL = 30000;

/** @type {JwksClient|null} */
let jwksClient = null;
/** @type {crypto.KeyObject|null} */
let staticPublicKey = null;


/** Download a json document via http or https
 *
 *  @param {string} uri url to fetch the document from
 *  @return {Promise<object>} parsed json document
 *  @private
 */
function fetchJson(uri) {
  return new Promise(function(resolve, reject) {
    const target = new URL(uri);
    const client = (target.protocol === 'http:' ? http : https);
    const req = client.get(target, {timeout: JWKS_REQUEST_TIMEOUT, headers: {accept: 'application/json'}}, function(res) {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`request to ${uri} returned http status ${res.statusCode}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        body += chunk;
        if (body.length > JWKS_MAX_RESPONSE_SIZE) {
          req.destroy(new Error(`answer from ${uri} is bigger than the allowed ${JWKS_MAX_RESPONSE_SIZE} bytes`));
        }
      });
      res.on('end', function() {
        try {
          resolve(JSON.parse(body));
        }
        catch (e) {
          reject(new Error(`answer from ${uri} is no valid json - ${e.message}`));
        }
      });
    });
    req.on('timeout', function() {
      req.destroy(new Error(`request to ${uri} timed out after ${JWKS_REQUEST_TIMEOUT} ms`));
    });
    req.on('error', reject);
  });
}


/** Convert a JSON Web Key Set document into a list of public keys usable to verify signatures.
 *  Keys not usable for signature validation are skipped.
 *
 *  @param {object} jwks parsed JSON Web Key Set document
 *  @param {string} uri url the document was downloaded from, used for log messages only
 *  @return {Array<{kid: string, key: crypto.KeyObject}>}
 *  @private
 */
function parseJwks(jwks, uri) {
  if (!jwks || !Array.isArray(jwks.keys)) {
    throw new Error(`document from ${uri} contains no "keys" list`);
  }
  let keys = [];
  jwks.keys.forEach(function(jwk) {
    // "oct" keys are shared secrets and must never be accepted from a public key endpoint
    if (!jwk || jwk.kty === 'oct') return;
    if (jwk.use && jwk.use !== 'sig') return;
    if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes('verify')) return;
    try {
      keys.push({kid: jwk.kid, key: crypto.createPublicKey({key: jwk, format: 'jwk'})});
    }
    catch (e) {
      console.warn(`Ignoring unusable key "${jwk.kid}" from ${uri} - ${e.message}`);
    }
  });
  if (keys.length === 0) {
    throw new Error(`no usable signature validation key found at ${uri}`);
  }
  return keys;
}


/** Client to download and cache the public keys published at a JSON Web Key Set endpoint */
class JwksClient {

  /** @param {string} uri url of the JWKS endpoint
   *  @param {number} cacheMaxAge time in seconds downloaded keys are used before refreshing them
   */
  constructor(uri, cacheMaxAge) {
    this.uri = uri;
    this.cacheMaxAge = (cacheMaxAge > 0 ? cacheMaxAge : 0) * 1000;
    this.keys = [];
    this.lastSuccess = 0;
    this.lastRequest = 0;
    this.pendingRequest = null;
  }

  /** Get the cached public key with the given key id.
   *  Tokens without key id can only be resolved if the key set contains a single key.
   *
   *  @param {string} [kid] key id to search for
   *  @return {crypto.KeyObject|null}
   */
  findKey(kid) {
    if (kid) {
      const entry = this.keys.find((item) => (item.kid === kid));
      return (entry ? entry.key : null);
    }
    return (this.keys.length === 1 ? this.keys[0].key : null);
  }

  /** Download the key set from the JWKS endpoint, running requests are reused
   *
   *  @return {Promise<void>}
   */
  refresh() {
    if (!this.pendingRequest) {
      this.lastRequest = Date.now();
      this.pendingRequest = fetchJson(this.uri)
        .then((jwks) => {
          this.keys = parseJwks(jwks, this.uri);
          this.lastSuccess = Date.now();
          this.pendingRequest = null;
        })
        .catch((err) => {
          this.pendingRequest = null;
          throw new Error(`Cannot load JSON Web Key Set - ${err.message}`);
        });
    }
    return this.pendingRequest;
  }

  /** Get the public key with the given key id, downloading the key set if needed
   *
   *  @param {string} [kid] key id from the token header, may be empty
   *  @return {Promise<crypto.KeyObject>}
   */
  getSigningKey(kid) {
    const cachedKey = this.findKey(kid);
    if (cachedKey && (Date.now() - this.lastSuccess) < this.cacheMaxAge) {
      return Promise.resolve(cachedKey);
    }
    if (!cachedKey && !this.pendingRequest && (Date.now() - this.lastRequest) < JWKS_MIN_REFRESH_INTERVAL) {
      return Promise.reject(new Error(`unknown key id "${kid || ''}" and key set of ${this.uri} refreshed some seconds ago already`));
    }
    return this.refresh().then(() => {
      const key = this.findKey(kid);
      if (!key) throw new Error(`no key with id "${kid || ''}" found at ${this.uri}`);
      return key;
    }, (err) => {
      // keep on working with outdated keys as long as possible if endpoint is not reachable
      if (cachedKey) {
        console.warn(`${err.message} - using cached key`);
        return cachedKey;
      }
      throw err;
    });
  }
}


/** Load a public key either given as PEM encoded string or as name of a file containing it
 *
 *  @param {string} keyOrFilename PEM encoded public key or name of a file with the key inside
 *  @return {crypto.KeyObject}
 */
function loadPublicKey(keyOrFilename) {
  const pem = (/^\s*-----BEGIN /.test(keyOrFilename) ? keyOrFilename : fs.readFileSync(keyOrFilename, 'utf8'));
  return crypto.createPublicKey(pem);
}


/** Resolve the key to validate the signature of an external SSO JSON Web Token with.
 *  Parameters and behaviour of this function match the "getKey" callback supported by the
 *  jsonwebtoken module and it can be used as "secretOrPublicKey" param of jwt.verify().
 *
 *  @param {object} header decoded header of the token to validate
 *  @param {function} callback called with the key to use or an error
 */
function ssoKeyResolver(header, callback) {
  Promise.resolve()
    .then(function() {
      if (config.get('sso.jwksUri')) {
        if (!jwksClient) {
          jwksClient = new JwksClient(config.get('sso.jwksUri'), config.get('sso.jwksCacheMaxAge'));
        }
        return jwksClient.getSigningKey(header ? header.kid : null);
      }
      if (config.get('sso.jwtPublicKey')) {
        if (!staticPublicKey) staticPublicKey = loadPublicKey(config.get('sso.jwtPublicKey'));
        return staticPublicKey;
      }
      return config.get('sso.jwtSharedSecret');
    })
    .then((key) => callback(null, key), (err) => callback(err));
}


/** Drop all cached keys, needed for unit tests changing the configuration at runtime */
function resetKeyCache() {
  jwksClient = null;
  staticPublicKey = null;
}


exports.JwksClient = JwksClient;
exports.loadPublicKey = loadPublicKey;
exports.ssoKeyResolver = ssoKeyResolver;
exports.resetKeyCache = resetKeyCache;
