'use strict';

module.exports = function (app) {
  require('./home')(app);
  require('./apiv1')(app);
  require('./dump')(app);
};
