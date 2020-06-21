/** this express middleware checks if the global readOnly flag for redis connections
 *  is set and returns an HTTP 403 if found true.
 *  This middleware should be used on all API routes that modify data inside redis server
 *  and should not be allowed while redis-commander is startet read-only.
 *
 *  @param {object} req Express request object
 *  @param {object} res Express response object
 *  @param {function} next next Express middleware function to call on success
 *  @return {*|Promise<any>}
 *  @private
 */
let _checkReadOnlyMode = function(req, res, next) {
  if (req.app.locals.redisReadOnly) {
    return res.status(403).json({status: 'FAIL', message: 'read-only mode'});
  }
  next();
};

/** method called to extract url parameter 'connectionId' from all routes.
 *  The connection object found is attached to the res.locals.connection variable for all
 *  following routes to work with. The connectionId param is attached to res.locals.connectionId.
 *
 *  This method exits with JSON error response if no connection is found.
 *
 * @param {object} req Express request object
 * @param {object} res Express response object
 * @param {function} next The next middleware function to call
 * @param {string} [connectionId] The value of the connectionId parameter.
 */
function _findConnection (req, res, next, connectionId) {
  let con = req.app.locals.redisConnections.find(function(connection) {
    return (connection.options.connectionId === connectionId);
  });
  if (con) {
    res.locals.connection = con;
    res.locals.connectionId = connectionId;

    // try to reconnect if it is an optional connection and not connected right now
    if (con.status === 'end' && con.options.isOptional) {
      con.connect();
    }
  }
  else {
    console.error('Connection with id ' + connectionId + ' not found, requested by url ' + req.originalUrl);
    return _printError(res, next, null, req.originalUrl);
  }
  next();
}

/** print error message server side and return an HTTP page with text error message to the client.
 *
 * @param res Express response object
 * @param next Express next middleware function
 * @param err optional error objet to extract error message from for logging
 * @param errFuncName name of function or url the error occured
 * @return {*}
 */
function _printError(res, next, err, errFuncName) {
  console.error('On ' + errFuncName + ': - no connection');
  if (err) {
    console.error('Got error ' + JSON.stringify(err));
    return (typeof next === 'function') ? next(err) : res.send('ERROR: Invalid Connection: ' + JSON.stringify(err));
  }
  else {
    return res.status(404).end('Not Found');
  }
}


exports.checkReadOnlyMode = _checkReadOnlyMode;
exports.findConnection = _findConnection;
exports.printError = _printError;
