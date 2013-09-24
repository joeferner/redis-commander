/**
 * Tools as export, import, flush ...
 * TODO: Refactory!
 *
 * @author Dmitriy Yurchenko <feedback@evildev.ru>
 */

'use strict';

var url = require('url'),
    zlib = require('zlib');

/**
 * Read scores.
 *
 * @param {Object} client redis client.
 * @param {Array} values values of zset.
 * @param {Function} callback
 */
var GetScores = function (client, key, values, callback) {
  var result = {};

  /**
   * Get scores recursive.
   */
  var GetRecursive = function() {
    if (!values.length) {
      callback(null, result);
      return;
    }

    var value = values.pop();

    client.zscore(key, value, function(err, score) {
      if (err) {
        callback(err);
        return;
      }

      result[ value ] = score;
      GetRecursive();
    });
  };

  GetRecursive();
};

module.exports = function (app) {
  /**
   * Make dump by redis database.
   *
   * @param {Integer} db number of redis database.
   * @param {Function} callback
   */
  app.get('/tools/export', function (req, res) {
    var exportData,
        urlParams = url.parse(req.url, true).query,
        connection = urlParams.connection.split(':'),
        type2GetCommand = {
          string: 'get',
          set: 'smembers',
          zset: 'zrange',
          list: 'lrange'
        },
        type2PrintSetCommand = {
          string: 'SET',
          set: 'SADD',
          zset: 'ZADD',
          list: 'RPUSH'
        };

    if (!connection[0]) {
      connection = ['localhost', '6379', '0'];
    }

    /**
     * Make dump.
     *
     * @param {Object} client redis client.
     */
    var MakeDump = function(client) {
      client.keys('*', function(err, keys) {
        if (err) {
          console.error(err);
          return;
        }

        /**
         * Read key recursive.
         */
        var ReadKeysRecursive = function () {
          if (!keys.length) {
            if (!urlParams.compress) {
              res.setHeader('Content-disposition', 'attachment; filename=db.' + (new Date().getTime()) + '.redis');
              res.setHeader('Content-Type', 'application/octet-stream');
              res.end(exportData);
              return;
            }

            /*var data = new Buffer(exportData, 'utf8');
            zlib.deflate(data, function(err, buffer) {
              if (err) {
                console.error(err);
                return;
              }

              res.setHeader('Content-disposition', 'attachment; filename=db.' + (new Date().getTime()) + '.redis.gzip');
              res.setHeader('Content-Type', 'application/octet-stream');
              res.end(buffer.toString('base64'));
            });

            return;*/
          }

          var key = keys.pop();

          client.type(key, function(err, type) {
            var command = type2GetCommand[ type ] || 'get',
              params = [ key ];

            if (command.indexOf('range') !== -1) {
              params.push(0);
              params.push(-1);
            }

            /**
             * To redis export callback.
             */
            var ToRedisCallback = function(err, data) {
              if (!exportData) {
                exportData = '';
              }

              if (command === 'zrange') {
                GetScores(client, key, data, function(err, scores) {
                  if (err) {
                    console.error(err);
                    return;
                  }

                  for (var i in scores) {
                    exportData += type2PrintSetCommand[ type ] + ' ' + key + ' ' + scores[ i ] + ' "' + i + "\"\n";
                  }

                  ReadKeysRecursive();
                });

                return;
              }

              exportData += type2PrintSetCommand[ type ] + ' ' + key + ' "' + data + "\"\n";
              ReadKeysRecursive();
            };

            /**
             * To json export callback.
             */
            var ToJSONCallback = function(err, data) {
              if (!exportData) {
                exportData = {};
              }

              ReadKeysRecursive();
            };

            /**
             * Callback
             *
             * @param {String} err
             * @param {Mixed} data
             */
            params.push(urlParams.type === 'redis' ? ToRedisCallback : ToJSONCallback);

            client[ command ].apply(client, params);
          });
        }

        ReadKeysRecursive();
      });
    };

    for (var i in req.redisConnections) {
      if (req.redisConnections[ i ].host === connection[0] && req.redisConnections[ i ].port === connection[1] &&
        req.redisConnections[ i ].selected_db === connection[2]) {
        MakeDump(req.redisConnections[ i ]);
        return;
      }
    }

    MakeDump(req.redisConnections[0]);
  });
};