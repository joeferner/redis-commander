/**
 * Tools as export, import, flush ...
 *
 * @author Dmitriy Yurchenko <feedback@evildev.ru>
 */

'use strict';

module.exports = function() {

  const config = require('config');
  const express = require('express');
  const router = express.Router();
  const RedisDump = require('node-redis-dump2');
  const myUtils = require('../util');
  const middlewares = require('../express/middlewares');

  let _findConnection = function(req, res, next) {
    let connectionId = req.query.connection || req.body.connection;
    if (!connectionId) return res.status(422).end('ConnectionId missing');
    middlewares.findConnection(req, res, next, connectionId);
  };

  /**
   * Make dump by redis database.
   */
  router.get('/export', _findConnection, function (req, res) {
    let exportType = req.query.type;
    let keyPrefix = req.query.keyPrefix;
    let dump = new RedisDump({client: res.locals.connection});

    dump.export({
      type: exportType || 'redis',
      keyPrefix: keyPrefix,
      callback: function(err, data) {
        if (err) {
          console.error('Could\'t not make redis dump!', err);
          return res.status(500).end('Error on dump');
        }

        res.setHeader('Content-disposition', 'attachment; filename=db.' + (new Date().getTime()) + '.redis');
        res.setHeader('Content-Type', 'application/octet-stream');

        switch (exportType) {
          case 'json':
            res.end(JSON.stringify(data));
            break;

          default:
            res.end(data);
            break;
        }
      }
    });
  });

  /**
   * Import redis data.
   */
  router.post('/import', middlewares.checkReadOnlyMode, _findConnection, function (req, res) {
    let dump = new RedisDump({client: res.locals.connection});
    try {
        // check if it is a redis RESTORE or RESTOREB64 command - change import type than to dump with base 64 encoded binary data
        // use default redis otherwise
        if (typeof req.body.data !== 'string') throw new Error('invalid import data send in body');

        let importType = 'redis';
        let reDump = /^RESTORE(B64)?\s/mi;
        if (reDump.test(req.body.data.trimStart())) {
          importType = 'dump-base64';
        }
        dump.import({
            type: importType,
            data: req.body.data,
            clear: req.body.clear,
            callback: function(err, report) {
                report.status = 'OK';
                if (err) {
                    report.status = 'FAIL';
                    console.error('Could\'t not import redis data!', err);
                }

                res.end(JSON.stringify(report));
            }
        });
    }
    catch(e) {
        console.error('Could\'t not import redis data! Exception:', e);
        res.json({inserted: 0, errors: -1, status: 'FAIL', message: 'Exception processing inport data'});
    }
  });

  /**
   * Export form.
   *
   * connections - list of all redis connections for drop-down
   */
  router.get('/forms/export', function (req, res) {
    res.render('tools/exportData.ejs', {
      connections: req.app.locals.redisConnections.map(myUtils.convertConnectionInfoForUI),
      layout: false
    });
  });

  /**
   * Import form.
   *
   * connections - list of all redis connections for drop-down
   * flushOnImport - default state of checkbox flushdb (either checked or nothing (=unchecked))
   */
  router.get('/forms/import', middlewares.checkReadOnlyMode, function (req, res) {
    res.render('tools/importData.ejs', {
      connections: req.app.locals.redisConnections.map(myUtils.convertConnectionInfoForUI),
      flushOnImport: config.get('redis.flushOnImport') ? 'checked' : '',
      layout: false
    });
  });

  return router;
};
