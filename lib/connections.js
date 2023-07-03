'use static';

const myUtils = require("./util");
let wrapper;

function setConnectionList(conList) {
  wrapper = new ConnectionWrapper(conList);
  return wrapper;
}

function getConnectionWrapper() {
  return wrapper;
}

/** check if a given connection object is already part of the connections list given as
 *  first parameter, the object found is returned or undefined otherwise.
 *  For comparison of the connection objects the _isSameConnection method is used.
 *
 *  @param {Array} connections list of connections
 *  @param {object} object connection object to search in list
 *  @return {boolean} true if this connection is found.
 */
function findConnection(connections, object) {
  return connections.find(function (element) {
    return ConnectionWrapper.isSameConnection(element, object);
  });
}

/** check if a given connection object is already part of the connections list given as
 *  first parameter.
 *  For comparison of the connection objects the _isSameConnection method is used.
 *
 *  @param {Array} connections list of connections
 *  @param {object} object connection object to search in list
 *  @return {boolean} true if this connection is found.
 */
function containsConnection(connections, object) {
  return connections.some(function (element) {
    return ConnectionWrapper.isSameConnection(element, object);
  });
}

/** Replace one object from connection list with another object.
 *  The list is search and the first object found matching oldObject is removed and
 *  replace with newObject. For comparison of the connection objects the _isSameConnection method is used.
 *
 *  This method changes the list as parameter.
 *
 *  @param {Array} connections list of connections
 *  @param {object} oldObject connection object to search in list to remove
 *  @param {object} newObject new connection object to add to list instead of old one.
 */
function replaceConnection(connections, oldObject, newObject) {
  const idx = connections.findIndex(function(element) {
    return ConnectionWrapper.isSameConnection(element, oldObject);
  });
  if (idx >= 0) connections.splice(idx, 1, newObject);
}


class ConnectionWrapper {

  constructor(conList) {
    this.redisConnections = conList;
  };

  getList() {
    return this.redisConnections;
  };

  push(...items) {
    this.redisConnections.push(...items)
  };

  map(callbackFn, thisArg) {
    return this.redisConnections.map(callbackFn, thisArg)
  };

  /** find the given connectionId within the array of all connections already we now
   *  @param {string} connId connectionId to search in list
   *  @return {boolean} true if this connectionId is found in list
   */
  findByConnectionId(connId) {
    return this.redisConnections.find((connection) => {
      return (connection.options.connectionId === connId);
    });
  };

  /** check if the given array of connections already contains a connection with this connectionId
   *  value.
   *  @param {string} connId connectionId to search in list
   *  @return {boolean} true if this connectionId is found in list
   */
  containsConnectionId(connId) {
    return this.redisConnections.some(function(connection) {
      return (connection.connectionId === conId);
    });
  };


  /** check if a given connection object is already part of the connections list given as
   *  first parameter, the object found is returned or undefined otherwise.
   *  For comparison of the connection objects the _isSameConnection method is used.
   *
   *  @param {object} object connection object to search in list
   *  @return {boolean} true if this connection is found.
   */
  findConnection(object) {
    return this.redisConnections.find(function (element) {
      return ConnectionWrapper.isSameConnection(element.options, object);
    });
  };

  /** check if a given connection object is already part of the connections list given as
   *  first parameter.
   *  For comparison of the connection objects the _isSameConnection method is used.
   *
   *  @param {object} object connection object to search in list
   *  @return {boolean} true if this connection is found.
   */
  containsConnection(object) {
    return this.redisConnections.some(function (element) {
      return ConnectionWrapper.isSameConnection(element.options, object);
    });
  };

  /** Replace one object from connection list with another object.
   *  The list is search and the first object found matching oldObject is removed and
   *  replace with newObject. For comparison of the connection objects the _isSameConnection method is used.
   *
   *  This method changes the list as parameter.
   *
   *  @param {object} oldObject connection object to search in list to remove
   *  @param {object} newObject new connection object to add to list instead of old one.
   */
  replaceConnection(oldObject, newObject) {
    const idx = this.redisConnections.findIndex(function(element) {
      return ConnectionWrapper.isSameConnection(element.options, oldObject);
    });
    if (idx >= 0) this.redisConnections.splice(idx, 1, newObject);
  };

  /** This method compares two redis connection objects if they refer to the same server connection.
   *  Only fields needed to create the network/socket connection are compared.
   *
   *  Compared are the following fields only:
   *  <ul>
   *    <li> db or dbIndex </li>
   *    <li> sentinels list - at least one host:port entry must match together with the sentinelName </li>
   *    <li> clusters list  - at least one host:port entry must match </li>
   *    <li> host and port </li>
   *    <li> path </li>
   *  </ul>
   *  Not compared are the following fields like: password, tls, connectionName, label, connectionId
   *
   *  @param {object} element first connection object for comparison
   *  @param {object} object second connection object for comparison
   *  @return {boolean} true if same connection is found
   *  @private
   */
  static isSameConnection(element, object) {
    if (Array.isArray(object.clusters) && object.clusters.length > 0) {
      // clusters list may not contain ALL cluster nodes, only some
      // now check booth lists to check if there is AT LEAST on matching hostname/ip
      // => it must be the same connection then
      if (Array.isArray(element.clusters) && element.clusters.length > 0) {
        const found = object.clusters.find(function(oItem) {
          const found2 = element.clusters.find(function(eItem) {
            if (oItem.host.toLowerCase() === eItem.host.toLowerCase() && oItem.port == eItem.port) {
              if (typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) {
                return true;
              }
              else {
                return (typeof element.db !== 'undefined' && element.db == object.dbIndex);
              }
            }
            return false;
          });
          return typeof found2 !== 'undefined';
        });
        if (found) return true;
      }
      // second try - if host and isCluster is set this one might be converted to clusters[] right now
      // check base connections without cluster for same host/port
      if (object.isCluster === true && element.host === object.host && element.port === object.port) {
        return true;
      }
      return false;
    }
    else if (Array.isArray(object.sentinels) && object.sentinels.length > 0) {
      // sentinel comparison is similar to cluster one except it has additional important name property
      // sentinels list may not contain ALL sentinels, only some
      // now check booth lists to check if there is AT LEAST on matching hostname/ip
      // => it must be the same connection then
      if (Array.isArray(element.sentinels) && element.sentinels.length > 0) {
        // our config names it "sentinelName", ioredis stores it at more general "name" properties
        // attribute used depends on if this is a config item or an existing redis client
        const oName = (object.sentinelName ? object.sentinelName : object.name);
        const eName = (element.sentinelName ? element.sentinelName : element.name);
        if (eName.toLowerCase() === oName.toLowerCase()) {
          const found = object.sentinels.find(function(oItem) {
            const found2 = element.sentinels.find(function(eItem) {
              if (oItem.host.toLowerCase() === eItem.host.toLowerCase() && oItem.port == eItem.port) {
                if (typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) {
                  return true;
                }
                else {
                  return (typeof element.db !== 'undefined' && element.db == object.dbIndex);
                }
              }
              return false;
            });
            return typeof found2 !== 'undefined';
          });
          if (found) return true;
        }
      }
      return false;
    }
    else if (object.host) {
      if (element.host === object.host && element.port == object.port) {
        // dbIndex for configuration item
        // db for ioredis client options object
        if ((typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) ||
          (typeof element.db !== 'undefined' && element.db == object.dbIndex)) {
          return true;
        }
      }
    }
    else if (object.path && element.path === object.path) {
      if ((typeof element.dbIndex !== 'undefined' && element.dbIndex == object.dbIndex) ||
        (typeof element.db !== 'undefined' && element.db == object.dbIndex)) {
        return true;
      }
    }
    return false;
  };

  /** this function gets a connection object and converts this to a new object
   *  unable to display at the UI visible to users.
   *  This method takes care of special all the different kind of connections (socket, sentinel, ...)
   *  and all the different attributes needed to describe them and creates an object usable to display
   *  this information in a common way to not duplicate all this if-then decisions client-side (e.g. treeview,
   *  import/export connection drop-down).
   *
   *  @param {object} connection connection information object as used in global app.locals.redisConnections array
   *  @return {{options: {db: *}, conId: *, label: *}} new object usable to display to users
   */
  convertConnectionsInfoForUI() {
    return this.redisConnections.map((connection) => {
      let retObj = {
        'label': connection.label,
        'conId': connection.options.connectionId,
        'foldingChar': connection.options.foldingChar,
        'options': {
          'db': connection.options.db
        }
      };
      if (connection.options.type === 'socket') {
        retObj.options.type = 'Socket';
        retObj.options.host = 'UnixSocket';
        retObj.options.port = '-';
      }
      else if (connection.options.type === 'sentinel') {
        retObj.options.type = 'Sentinel';
        retObj.options.host = connection.options.sentinels[0].host;
        retObj.options.port = connection.options.sentinels[0].port;
        retObj.options.db = connection.options.name + '-' + connection.options.db;
      }
      else if (connection.options.type === 'cluster') {
        retObj.options.type = 'Cluster';
        retObj.options.host = connection.options.clusters[0].host;
        retObj.options.port = connection.options.clusters[0].port;
      }
      else {
        retObj.options.type = 'Standalone';
        retObj.options.host = connection.options.host;
        retObj.options.port = connection.options.port;
      }
      return retObj;
    })
  };

  setUpConnection(redisConnection, errCb, readyCb) {
    redisConnection.on('error', function (err) {
      console.error(`setUpConnection (${redisConnection.options.connectionId}) Redis error`, err.stack);
      if (typeof errCb === 'function') errCb(err);
    });
    redisConnection.on('end', function () {
      console.log(`connection (${redisConnection.options.connectionId}) closed. Attempting to Reconnect...`);
    });
    redisConnection.once('connect', this._connectToDB.bind(this, redisConnection));
    if (typeof readyCb === 'function') {
      redisConnection.once('ready', readyCb);
    }
  };


  _connectToDB(redisConnection) {
    Promise.allSettled([
      redisConnection.call('command'),
      redisConnection.call('module', ['list']),
      redisConnection.options.type === 'standalone' ? redisConnection.call('info', ['cluster']) : null
    ]).then((p) => {
      // list of all commands the server knows...
      if (p[0].status === 'fulfilled' && Array.isArray(p[0].value)) {
        // console.debug('Got list of ' + p[0].value.length + ' commands from server ' + redisConnection.options.host + ':' +
        //   redisConnection.options.port);
        redisConnection.options.commandList = {
          all: p[0].value.map((item) => (item[0].toLowerCase())),
          ro: p[0].value.filter((item) => (item[2].indexOf('readonly') >= 0)).map((item) => (item[0].toLowerCase()))
        };
      }
      else {
        console.log(`redis command "command" not supported, cannot build dynamic command list for ${redisConnection.options.connectionId}`);
      }

      // list of all modules installed
      if (p[1].status === 'fulfilled' && Array.isArray(p[1].value)) {
        // console.debug('Got list of ' + p[1].value.length + ' modules from server ' + redisConnection.options.host + ':' +
        //   redisConnection.options.port);
        redisConnection.options.moduleList = p[1].value.map((m) => {
          const modInfo = {}
          modInfo[m[0]] = m[1];
          modInfo[m[2]] = m[3];
          return modInfo
        });
      }
      else {
        console.log(`redis command "module" not supported, cannot build dynamic list of modules installed for ${redisConnection.options.connectionId}`);
      }

      // check if it is a standalone or cluster setup if not started as explicit cluster (auto-detect)
      if (typeof p[2].value === 'string') {
        const matchAnswer = p[2].value.match(/cluster_enabled:(\d)/)
        if (matchAnswer) {
          if (matchAnswer[1] === "1") {
            console.log(`Auto-detected active cluster on ${redisConnection.options.connectionId}, reconnect with cluster mode`);
            const newConnection = {
              isCluster: true,
              db: redisConnection.options.db,
              host: redisConnection.options.host,
              port: redisConnection.options.port,
              username: redisConnection.options.username,
              password: redisConnection.options.password,
              foldingChar: redisConnection.options.foldingChar,
              label: redisConnection.label,
              connectionName: redisConnection.options.connectionName,
              tls: redisConnection.options.tls,
              clusterNoTlsValidation: !!redisConnection.options.clusterNoTlsValidation
            };
            redisConnection.disconnect();
            const client = myUtils.createRedisClient(newConnection);
            this.redisConnections[this.redisConnections.indexOf(redisConnection)] = client;
            this.setUpConnection(client);
          }
        }
      }
      // must exclude "null" as this promise is optional, only for standalone server
      else if (!(p[2].status === 'fulfilled' && p[2].value === null)) {
        console.log(`Redis "info cluster" not supported, cannot auto-detect cluster mode on ${redisConnection.options.connectionId}`);
      }
    });

    let opt = redisConnection.options;
    let hostPort
    switch (opt.type) {
      case 'sentinel':
        hostPort = `sentinel ${opt.sentinels[0].host}:${opt.sentinels[0].port}:${opt.name}`;
        break;
      case 'cluster':
        hostPort = `cluster ${opt.clusters[0].host}:${opt.clusters[0].port}`;
        break;
      default:
        hostPort = opt.path ? opt.path : opt.host + ':' + opt.port;
    }
    console.log('Redis Connection ' + hostPort +
      (opt.tls ? ' with TLS' : '') + ' using Redis DB #' + opt.db);
  };
}


module.exports = {
  getConnectionWrapper: getConnectionWrapper,
  setConnectionList: setConnectionList,
  findConnection: findConnection,
  containsConnection: containsConnection,
  replaceConnection: replaceConnection,
  ConnectionWrapper: ConnectionWrapper
};
