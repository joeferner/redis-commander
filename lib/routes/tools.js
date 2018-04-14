/**
 * Tools as export, import, flush ...
 *
 * @author Dmitriy Yurchenko <feedback@evildev.ru>
 */

'use strict';

var url = require('url'),
    RedisDump = require('node-redis-dump');

module.exports = function (app, urlPrefix) {
  /**
   * Make dump by redis database.
   */
  app.get(`${urlPrefix}/tools/export`, function (req, res) {
    var urlParams = url.parse(req.url, true).query,
        connection = urlParams.connection.split(':'),
        connectionId = 0;

    if (!connection[0]) {
      connection = ['localhost', '6379', '0'];
    }

    for (var i in req.app.redisConnections) {
      if (!req.app.redisConnections[i].options) {
        continue;
      }
      // compare strings
      if (req.app.redisConnections[ i ].options.host == connection[0] &&
        req.app.redisConnections[ i ].options.port == connection[1] &&
        req.app.redisConnections[ i ].options.db == connection[2]) {
        connectionId = i;
        break;
      }
    }
    if (!req.app.redisConnections[ connectionId ]) {
      res.statusCode = 404;
      return res.end('Not Found');
    }

    var dump = new RedisDump({
      client: req.app.redisConnections[ connectionId ]
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
  app.post(`${urlPrefix}/tools/import`, function (req, res) {
    var connection = req.body.connection.split(':'),
        connectionId = 0;

    if (!connection[0]) {
      connection = ['localhost', '6379', '0'];
    }

    for (var i in req.app.redisConnections) {
      if (req.app.redisConnections[ i ].options.host === connection[0] && req.app.redisConnections[ i ].options.port === connection[1] &&
        req.app.redisConnections[ i ].options.db === connection[2]) {
        connectionId = i;
        break;
      }
    }

    var dump = new RedisDump({
      client: req.app.redisConnections[ connectionId ]
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
  app.post(`${urlPrefix}/tools/forms/export`, function (req, res) {
    res.render('tools/exportData.ejs', {
      connections: req.app.redisConnections,
      layout: false
    });
  });

  /**
   * Import form.
   */
  app.post(`${urlPrefix}/tools/forms/import`, function (req, res) {
    res.render('tools/importData.ejs', {
      connections: req.app.redisConnections,
      layout: false
    });
  });
};
