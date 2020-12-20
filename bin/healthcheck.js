#!/usr/bin/env node

'use strict';

// fix the cwd to project base dir for browserify and config loading
const path = require('path');
process.chdir( path.join(__dirname, '..') );

process.env.ALLOW_CONFIG_MUTATIONS = true;
const config = require('config');
const http = require('http');
const util = require('./../lib/util');

// will fail if config is invalid - than redis commander itself cannot run too, therefore healthcheck would fail also
// needed to fix potential problems with port/urlPrefix and so on
try {
  util.validateConfig();
}
catch(e) {
  console.error(e.message);
  process.exit(1);
}

let host = config.get('server.address');
if (!host || host === '0.0.0.0' || host === '::') host =  '127.0.0.1';
let port = config.get('server.port');
let urlPrefix = config.get('server.urlPrefix');

http.get(`http://${host}:${port}${urlPrefix}/healthcheck`, (resp) => {
  let data = '';

  resp.on('data', (chunk) => {
    data += chunk;
  });

  // The whole response has been received. Print out the result.
  resp.on('end', () => {
    if (data.trim() === 'ok') process.exit(0);
    else {
      console.log('got unexpected response from server: ' + data);
      process.exit(1);
    }
  });
}).on("error", (err) => {
  console.log("error connection to server: " + err.message);
  process.exit(1);
});
