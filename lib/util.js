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

