#!/usr/bin/env node
'use strict';

/** small helper script to generate a bcrypt hashed password from plain text password
 *  Example:
 *  <code>
 *  $ export HTTP_PASSWORD_HASH=$(bcrypt-password.js -p myplainpass)
 *  $ echo $HTTP_PASSWORD_HASH
 *  $2b$10$BQPbC8dlxeEqB/nXOkyjr.tlafGZ28J3ug8sWIMRoeq5LSVOXpl3W
 *
 *  or
 *  $ bcrypt-password.js -p myplainpass > my-secrets-file
 *  $ cat my-secrets-file
 *  $2b$10$BQPbC8dlxeEqB/nXOkyjr.tlafGZ28J3ug8sWIMRoeq5LSVOXpl3W
 *  </code>
 *
 *  This generated password can be given to redis commander as a password-hash file
 *  (param "--http-auth-password-hash") or set as env var "HTTP_PASSWORD_HASH".
 *
 *  Additionally the docker container of redis commander is reading the hashed
 *  http auth password from a secrets file too.
 */

const yargs = require('yargs');
let bcrypt;
try {
  bcrypt = require('bcrypt');
  // console.debug('using native bcrypt implementation');
} catch (e) {
  bcrypt = require('bcryptjs');
  // console.debug('using javascript bcryptjs implementation');
}

let args = yargs
  .alias('h', 'help')
  .alias('h', '?')
  .options('password', {
    alias: 'p',
    type: 'string',
    describe: 'The plain text password to hash'
  })
  .check(function(value) {
    if (typeof value['password'] === 'undefined' || value['password'].trim() === '') {
      console.error('password parameter missing and must not be empty');
      console.error('usage:   bcrypt-password.js -p <mysecretpass>');
      process.exit(-1);
    }
    return true;
  })
  .usage('Usage: $0 [options]')
  .wrap(yargs.terminalWidth())
  .argv;

if (args.help) {
  yargs.help();
  return process.exit(0);
}

console.log(bcrypt.hashSync(args['password'], 10));
