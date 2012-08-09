var redis = require('redis');
function uuidGenerator() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function fakeTimestamp(){
  var now = new Date().getTime();
  var day = 86400000;
  var week = day * 7;
  return now - week +Math.round((Math.random() * (week * 2)));
}

function generateSessions(startCount,currentCount,callback){
  if(currentCount < startCount){
    var key = "sessionToken:" + uuidGenerator();
      redisConnection.set(key,fakeTimestamp(),function(err){
        if(err){
          console.log(err);
        }else{
          generateSessions(startCount,currentCount + 1,callback);
        }
      });
  }else{
    callback();
  }
}

function generatePageHits(startCount,currentCount,callback){
  if(currentCount < startCount){
    var key = "sessionToken:" + uuidGenerator();
    var pages = ['/','/about','app','/contacts','/support',
        '/faq','/buy-now','/sign-up','/logout',];
    var pageIdx = Math.round(Math.random()*8);
    var numHits = Math.round(Math.random()*4) + 1;
    redisConnection.zincrby('pageHits',numHits,pages[pageIdx],function(){
      var uuid = uuidGenerator();
      numHits = Math.round(Math.random()*29) + 1;
      redisConnection.zincrby('pageHits',numHits,'/profile?user='+uuid ,function(){
        generatePageHits(startCount,currentCount + 1,callback);
      });
    });
  }else{
    callback();
  }
}

var redisConnection = redis.createClient();
  redisConnection.on("error", function (err) {
    console.error("Redis error", err.stack);
  });
    
redisConnection.set('version','2.6.3',redis.print);
redisConnection.sadd('categories','Industry',"Analytics","Social","Learning","Technology","Video","Blog",redis.print);
redisConnection.del('sessionToken:*',function(){
  var numKeys = Math.round(500 + (Math.random()*1500));
  console.log('creating ' + numKeys + " sessionTokens");
  generateSessions(numKeys,0,function(){
    redisConnection.del('pageHits',function(){
      var numHits = Math.round(500 + (Math.random()*1500));
      console.log('creating ' + numHits + " pageHits");
      generatePageHits(numHits,0,function(){
        process.exit(0);
      });
    });
  });
});