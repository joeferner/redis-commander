var myUtil = require('../lib/util');

module.exports = {
  setUp: function (callback) {
    callback();
  },
  testStandard: function (test) {
    var result = myUtil.split("set key value");
    test.ok(arraysEqual(result, ['set', 'key', 'value']));
    test.done();
  },
  testEmptyQuotes: function (test) {
    var result = myUtil.split("get \"\"");
    test.ok(arraysEqual(result, ['get', ""]));
    test.done();
  },
  testQuotedKey: function (test) {
    var result = myUtil.split("set \"key\" value");
    test.ok(arraysEqual(result, ['set', 'key', 'value']));
    test.done();
  },
  testBackslashIgnoresNextCharacter: function (test) {
    var result = myUtil.split("set \"key\\ name\" value");
    test.ok(arraysEqual(result, ['set', 'key name', 'value']));
    test.done();
  },
  testHandlesSingleTicks: function (test) {
    var result = myUtil.split("set \'keyname\' value");
    test.ok(arraysEqual(result, ['set', 'keyname', 'value']));
    test.done();
  },
  testIgnoresUnterminatedStrings : function (test) {
    var result = myUtil.split("set \"keyname value");
    test.ok(arraysEqual(result, ['set']));
    test.done();
  }

};

function arraysEqual(a1,a2) {
  return JSON.stringify(a1)==JSON.stringify(a2);
}