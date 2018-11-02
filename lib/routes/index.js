'use strict';

module.exports = function (app, urlPrefix) {
  app.use(`${urlPrefix}/`, require('./home')());
  let apiRoutes = require('./apiv1')(app);
  app.use(`${urlPrefix}/apiv1`, apiRoutes.apiv1);
  app.use(`${urlPrefix}/apiv2`, apiRoutes.apiv2);
  app.use(`${urlPrefix}/tools`, require('./tools')());
};
