'use strict';

module.exports = function (app, urlPrefix) {
  require('./home')(app, urlPrefix);
  require('./apiv1')(app, urlPrefix);
  require('./tools')(app, urlPrefix);
};
