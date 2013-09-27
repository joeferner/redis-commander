/**
 * Tools as export, import, flush ...
 *
 * @author Dmitriy Yurchenko <feedback@evildev.ru>
 */

'use strict';

var url = require('url'),
    RedisDump = require('node-redis-dump');

module.exports = function (app) {
  /**
   * Make dump by redis database.
   */
  app.get('/tools/export', function (req, res) {
    var urlParams = url.parse(req.url, true).query,
        connection = urlParams.connection.split(':'),
        connectionId = 0;

    if (!connection[0]) {
      connection = ['localhost', '6379', '0'];
    }

    for (var i in req.redisConnections) {
      if (req.redisConnections[ i ].host === connection[0] && req.redisConnections[ i ].port === connection[1] &&
        req.redisConnections[ i ].selected_db === connection[2]) {
        connectionId = i;
        break;
      }
    }

    var dump = new RedisDump({
      client: req.redisConnections[ connectionId ]
    });

    dump.export({
      type: urlParams.type || 'redis',
      callback: function(err, data) {
        if (err) {
          console.error('Could\'t not make redis dump!', err);
          return;
        }

        res.setHeader('Content-disposition', 'attachment; filename=db.' + (new Date().getTime()) + '.redis');
        res.setHeader('Content-Type', 'application/octet-stream');

        switch (urlParams.type) {
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
  app.post('/tools/import', function (req, res) {
    var connection = req.body.connection.split(':'),
        connectionId = 0;

    if (!connection[0]) {
      connection = ['localhost', '6379', '0'];
    }

    for (var i in req.redisConnections) {
      if (req.redisConnections[ i ].host === connection[0] && req.redisConnections[ i ].port === connection[1] &&
        req.redisConnections[ i ].selected_db === connection[2]) {
        connectionId = i;
        break;
      }
    }

    var dump = new RedisDump({
      client: req.redisConnections[ connectionId ]
    });

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
  });

  /**
   * Export form.
   */
  app.post('/tools/forms/export', function (req, res) {
    res.render('tools/exportData.ejs', {
      layout: false
    });
  });

  /**
   * Import form.
   */
  app.post('/tools/forms/import', function (req, res) {
    res.render('tools/importData.ejs', {
      layout: false
    });
  });
};