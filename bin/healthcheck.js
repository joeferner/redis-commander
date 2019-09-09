#!/usr/bin/env node

'use strict';

// fix the cwd to project base dir for browserify and config loading
let path = require('path');
process.chdir( path.join(__dirname, '..') );

const config = require('config');
const http = require('http');

let port = (config.has('server.port') ? config.get('server.port') : null) || '127.0.0.1';
let host = (config.has('server.address') ? config.get('server.address') : null);
if (!host || host === '0.0.0.0' || host === '::') host =  '127.0.0.1';

http.get(`http://${host}:${port}/healthcheck`, (resp) => {
  let data = '';

  resp.on('data', (chunk) => {
    data += chunk;
  });

  // The whole response has been received. Print out the result.
  resp.on('end', () => {
    if (data.trim() === 'ok') process.exit(0);
    else {
      console.log('got unexprected response from server: ' + data);
      process.exit(1);
    }
  });
}).on("error", (err) => {
  console.log("error connection to server: " + err.message);
  process.exit(1);
});
