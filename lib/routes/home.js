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
  fs.readFile(getUserHome() + "/.redis-commander",'utf8', function(err,data){
    if(err){
      console.log('no config found');
      res.send({});
    }else{
      console.log(data);
      res.send(data);
    }
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
    fs.writeFile(getUserHome() + "/.redis-commander",JSON.stringify(config), function(err){
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
    return res.redirect('/');
  });
}

function getHome(req, res, next) {
  res.render('home/home.ejs', {
    title: 'Home',
    layout: req.app.layoutFilename
  });
}
