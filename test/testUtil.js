const chai = require('chai');
const myUtil = require("../lib/util");
const	expect = chai.expect;

describe('Test util.js helpers', function() {
  const myUtil = require('../lib/util');

  describe('Test command split function', function() {

    it('test standard split', function () {
      const result = myUtil.split("set key value");
      expect(result).to.deep.equal(['set', 'key', 'value']);
    });

    it('test empty quotes', function () {
      const result = myUtil.split("get \"\"");
      expect(result).to.deep.equal(['get', ""]);
    });

    it('test quoted key', function () {
      let result = myUtil.split('set "key" value');
      expect(result, 'extract key with quotes no space').to.deep.equal(['set', 'key', 'value']);

      result = myUtil.split('set "key b" value');
      expect(result, 'extract key with quotes and space').to.deep.equal(['set', 'key b', 'value']);
    });

    it('test backslash ignores next character', function () {
      const result = myUtil.split('set "key\\ name" value');
      expect(result).to.deep.equal(['set', 'key name', 'value']);
    });

    it('test handles single ticks', function () {
      let result = myUtil.split("set 'keyname' value");
      expect(result, 'extract key with quotes no space').to.deep.equal(['set', 'keyname', 'value']);

      result = myUtil.split("set 'keyname b' value");
      expect(result, 'extract key with quotes and space').to.deep.equal(['set', 'keyname b', 'value']);
    });

    it('test ignores unterminated strings', function () {
      let result = myUtil.split('set "keyname value');
      expect(result, 'ignores unterminated double ticks').to.deep.equal(['set']);

      result = myUtil.split("set 'keyname value");
      expect(result, 'ignores unterminated single ticks').to.deep.equal(['set']);
    });
  });

  describe('Test distinct function', function() {
  });

  describe('Test decodeHTMLEntities function', function() {
  });

  describe('Test encodeHTMLEntities function', function() {
  });

  describe('Test createRedisClient function', function() {
  });

  describe('Test hasDeprecatedConfig function', function() {
  });

  describe('Test getDeprecatedConfig function', function() {
  });

  describe('Test getDeprecatedConfigPath function', function() {
  });

  describe('Test deleteDeprecatedConfig function', function() {
  });

  describe('Test migrateDeprecatedConfig function', function() {
  });

  describe('Test containsConnection function', function() {
  });

  describe('Test findConnection function', function() {
  });

  describe('Test replaceConnection function', function() {
  });

  describe('Test saveConnections function', function() {
  });

  describe('Test convertConnectionInfoForUI function', function() {
  });

  describe('Test saveLocalConfig function', function() {
  });

  describe('Test deleteConfig function', function() {
  });

  describe('Test validateConfig function', function() {
  });

  describe('Test getRedisSentinelGroupName function', function() {
  });

  describe('Test parseRedisSentinel function', function() {
  });
});
