'use strict';

exports.split = function (str) {
  var results = [];
  var word = '';
  for (var i = 0; i < str.length;) {
    if (/\s/.test(str[i])) {
      while (i < str.length && /\s/.test(str[i])) {
        i++;
      }
      results.push(word);
      word = '';
      continue;
    }

    if (str[i] === '"') {
      i++;
      while (i < str.length) {
        if (str[i] === '"') {
          break;
        }

        if (str[i] === '\\') {
          i++;
          word += str[i++];
          continue;
        }

        word += str[i++];
      }
      i++;
      continue;
    }

    if (str[i] === '\\') {
      i++;
      word += str[i++];
      continue;
    }

    word += str[i++];
  }
  if (word.length > 0) {
    results.push(word);
  }
  return results;
};

exports.distinct = function (items) {
  var hash = {};
  items.forEach(function (item) {
    hash[item] = true;
  });
  var result = [];
  for (var item in hash) {
    result.push(item);
  }
  return result;
};

var encodeHTMLEntities = function (string, callback) {
  callback(string.replace(/[\u00A0-\u2666<>\&]/g, function(c) {
      return '&' + 
      (encodeHTMLEntities.entityTable[c.charCodeAt(0)] || '#'+c.charCodeAt(0)) + ';';
  }));
};

exports.encodeHTMLEntities = encodeHTMLEntities;

encodeHTMLEntities.entityTable = {
  34 : 'quot', 
  38 : 'amp', 
  39 : 'apos', 
  60 : 'lt', 
  62 : 'gt'
};
var decodeHTMLEntities = function (string, callback) {
  callback(string.replace(/\&(\w)*\;/g, function(c) {
      var result = String.fromCharCode(decodeHTMLEntities.entityTable[c.substring(1,c.indexOf("\;"))]);
      return result;      
  }));
};

exports.decodeHTMLEntities = decodeHTMLEntities;

decodeHTMLEntities.entityTable = {
  'quot' : 34,
  'amp' : 38,
  'apos' : 39,
  'lt' : 60,
  'gt' : 62
};