/**
 * Tools as export, import, flush ...
 *
 * @author Dmitriy Yurchenko <feedback@evildev.ru>
 */

'use strict';

module.exports = function() {

  const express = require('express');
  const router = express.Router();
  const RedisDump = require('node-redis-dump');

  let _findConnection = function(req, res, next) {
    let connectionId = req.query.connection || req.body.connection;
    if (!connectionId) return res.status(422).end('ConnectionId missing');

    let connection = connectionId.split(':');
    let host = connection[0];
    let port = parseInt(connection[1]);
    let db = parseInt(connection[2]);
    req.redisClient = req.app.locals.redisConnections.find(function(redisCon) {
        return (redisCon.options.host === host && redisCon.options.port === port && redisCon.options.db === db);
    });

    if (!req.redisClient) {
        return res.status(404).end('Not Found');
    }
    next();
  };

  /**
   * Make dump by redis database.
   */
  router.get('/export', _findConnection, function (req, res) {
    let exportType = req.query.type;
    let dump = new RedisDump({client: req.redisClient});

    dump.export({
      type: exportType || 'redis',
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
  router.post('/import', _findConnection, function (req, res) {
    let dump = new RedisDump({client: req.redisClient});
    try {
        dump.import({
            type: 'redis',
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
   */
  router.post('/forms/export', function (req, res) {
    res.render('tools/exportData.ejs', {
      connections: req.app.locals.redisConnections,
      layout: false
    });
  });

  /**
   * Import form.
   */
  router.post('/forms/import', function (req, res) {
    res.render('tools/importData.ejs', {
      connections: req.app.locals.redisConnections,
      layout: false
    });
  });


  return router;
};
