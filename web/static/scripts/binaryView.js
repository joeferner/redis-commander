"use strict";

var BinaryView = {};

/** converts an given integer to its hex representation.
 *  hex values shorter than 'length' (e.g. 'a') are prefix with an '0'
 *
 *  @param {number} number value to convert to hex
 *  @param {number} length number of chars needed, may be prefixed with zero to match length
 *  @return {string} hex string representation with given length
 */
BinaryView.toHex = function (number, length) {
  var s = number.toString(16).toUpperCase();
  while (s.length < length) {
    s = '0' + s;
  }
  return s;
};

/** converts an given integer to either a one byte character.
 *  first numbers (control characters) are return as a '.' to be visible
 *
 *  @param {number} number number to get char from
 *  @return {string} printable character or '.' for control chars
 */
BinaryView.toChar = function(number) {
  return number <= 32 ? '.' : String.fromCharCode(number);
};

/** select booth char items (hex and char view) and adds class 'current' to it.
 *  It searches all 'span' children of the nearest 'binaryView-hex' and 'binaryView-char'
 *  class elements contained inside the parent 'binaryView'.
 *
 *  @param {Element} e node element to select together with coresponding other
 *  @param {string} otherClass either 'binaryView-hex' or 'binaryView-char' to select other char representation
 *   of same index too
 */
BinaryView.selectItem = function(e, otherClass) {
  var itemChar = $(e);
  var idx = itemChar.parent().children('span').removeClass('current').index(itemChar);
  itemChar.addClass('current');
  $(itemChar.closest('.binaryView').find(otherClass + ' > span').removeClass('current').get(idx)).addClass('current')
};

/* following two methods are taken from
 * https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
 *
 * Base64 / binary data / UTF-8 strings utilities (#1)
 * Author: madmurphy
 */

/** Array of bytes to base64 string decoding
 *
 *  @param {number} nChr character number
 *  @return {number} uint value
 */
BinaryView.b64ToUint6 = function(nChr) {
  return nChr > 64 && nChr < 91 ?
    nChr - 65
    : nChr > 96 && nChr < 123 ?
      nChr - 71
      : nChr > 47 && nChr < 58 ?
        nChr + 4
        : nChr === 43 ?
          62
          : nChr === 47 ?
            63
            :
            0;
};

/** decode base64 string to an array
 *
 *  @param {string} sBase64 base64 encoded string
 *  @param {number} [nBlockSize]
 *  @return {Uint8Array} decoded string as uint8 array
 */
BinaryView.base64DecToArr = function(sBase64, nBlockSize) {
  var sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ""), nInLen = sB64Enc.length;
  var nOutLen = nBlockSize ? Math.ceil((nInLen * 3 + 1 >>> 2) / nBlockSize) * nBlockSize : nInLen * 3 + 1 >>> 2;
  var aBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= this.b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        aBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;
    }
  }
  return aBytes;
};



