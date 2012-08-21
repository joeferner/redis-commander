'use strict';
var fs = require('fs');
module.exports = function (app) {
  app.get('/', getHome);
  app.post('/login', postLogin);
  app.get('/config', getConfig);
  app.post('/config', postConfig);
};
function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}
function getConfig(req, res, next) {
  req.app.getConfig(function(err, config) {
    if (err){
      console.log("No config found.\nUsing default configuration.")
      var config = {
        "sidebarWidth":250,
        "locked":false,
        "CLIHeight":50,
        "CLIOpen":false
      };
    }
    return res.send(config);
  });
}
function postConfig(req, res, next) {
  var config = req.body;
  console.log(config);
  if(!config){
    console.log('no config sent');
    res.send(500);
  }else{
    res.send(200);
    req.app.saveConfig(config, function(err){
      if(err){
        console.log(err);
        res.send(500);
      }else{
        res.send(200);
      }
    });
  }
}

function postLogin(req, res, next) {
  req.app.login(req.body.hostname, req.body.port, function (err) {
    if (err) {
      req.flash('error', 'Invalid login: ' + err);
    }
    req.app.getConfig(function(err,config){
      if (err){
        console.log("No config found.\nUsing default configuration.")
        var config = {
          "sidebarWidth":250,
          "locked":false,
          "CLIHeight":50,
          "CLIOpen":false
        };
      }
      config['host'] = req.body.hostname;
      config['port'] = req.body.port;
      req.app.saveConfig(config, function(err){
        if(err){
          return next(err);
        }
        return res.redirect('/');
      });
    });
  });
}

function getHome(req, res, next) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}
