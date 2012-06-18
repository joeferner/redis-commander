'use strict';

module.exports = function (app) {
  app.get('/', getHome);
  app.get('/login', getLogin);
  app.post('/login', postLogin);
  app.post('/logout', postLogout);
};

function postLogout(req, res, next) {
  req.app.logout();
  res.redirect('/login');
}

function getLogin(req, res, next) {
  res.render('home/login.ejs', {
    title: 'Login',
    layout: req.app.layoutFilename
  });
}

function postLogin(req, res, next) {
  req.app.login(req.body.hostname, req.body.port, function (err) {
    if (err) {
      req.flash('error', 'Invalid login: ' + err);
      return getLogin(req, res, next);
    }

    return res.redirect('/');
  });
}

function getHome(req, res, next) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}
