/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const {ArgumentError} = require('errorex');
const ParseError = require('./ParseError');
const HL7Segment = require('./HL7Segment');
const iconv = require('iconv-lite');

const {
  VT, FS, CR,
  xCR,
  VERSIONS,
  DEFAULT_VERSION,
  FIELD_SEPARATOR
} = require('./types');

/**
 *
 * @class
 */
class HL7Message {

  /**
   * @param {Object} [options]
   * @param {Object} [options.customDict]
   */
  constructor(options) {
    options = options || {};
    this.version = options.version;
    this._segments = [];
    this._customDict = options.customDict;
  }

  /**
   *
   * @return {string}
   */
  get version() {
    return this._version;
  }

  /**
   *
   * @param {string} value
   */
  set version(value) {
    this._version = value ? value : DEFAULT_VERSION;
    if (!VERSIONS.includes(this._version))
      throw new ArgumentError('Unknown HL7 version (%s)', this._version);
  }

  /**
   *
   * @return {Array<HL7Segment>}
   */
  get segments() {
    return this._segments;
  }

  get MSH() {
    return this.getSegment('MSH');
  }

  /**
   * Creates a new segment to the end of the this message
   * @param {string} type
   * @return {HL7Segment}
   */
  add(type) {
    const segment = new HL7Segment(this);
    segment.parse(type);
    this.segments.push(segment);
    return segment;
  }

  /**
   * Searches for segment of given type
   *
   * @param{string} type
   * @param{number} [index=0]
   * @return {HL7Segment}
   */
  getSegment(type, index) {
    let k = 0;
    for (const seg of this._segments) {
      if (seg.type === type) {
        if (!index || index === k)
          return seg;
        k++;
      }
    }
  }

  /**
   *
   * @param {Buffer|Uint8Array|string} buf
   * @param {Object} [options]
   * @param {string} [options.encoding='utf8']
   * @param {Object} [options.customDict]
   * @private
   */
  parse(buf, options) {
    this._segments = [];
    if (options && options.customDict) {
      this._customDict = options.customDict;
    }

    let str;
    if (buf instanceof Uint8Array) {
      let encoding = (options && options.encoding) || 'utf8';
      /* Character set detection */
      const sep = FIELD_SEPARATOR.charCodeAt(0);
      const crIdx = buf.indexOf(xCR);
      let i = 0;
      let k;
      let l = 0;
      do {
        k = l + 1;
        l = Math.min(buf.indexOf(sep, k), crIdx);
        if (l < 0)
          l = buf.length - 1;
        if (i++ === 17) {
          encoding = buf.toString('utf8', k, l);
          break;
        }
      } while (l > 0 && l < crIdx);
      str = iconv.decode(buf, encoding.replace(/^UNICODE/, ''));
    } else
      str = String(buf);

    if (str.startsWith(VT))
      str = str.substring(1);

    if (str.endsWith(FS + CR))
      str = str.substring(0, str.length - 2);

    const k = str.indexOf(FS);
    if (k >= 0)
      str = str.substring(0, k);

    if (!str.startsWith('MSH'))
      throw new ParseError('Message must start with (MSH) segment');

    const lines = str.split(/\r|\r\n|\n/);
    for (const [i, line] of lines.entries()) {
      if (!line)
        continue;
      const segment = new HL7Segment(this, {customDict: this._customDict});
      try {
        segment.parse(line);
      } catch (e) {
        /* istanbul ignore next */
        const e1 = (e instanceof ParseError) ? e : new ParseError(e);
        e1.line = i + 1;
        throw e1;
      }
      this.segments.push(segment);

    }
  }

  toHL7() {
    this.MSH.VersionId.value = this.version;
    let out = '';
    for (const s of this._segments)
      out += s.toHL7() + CR;
    return out;
  }

  static parse(input, options) {
    const msg = new HL7Message(options);
    msg.parse(input, options);
    return msg;
  }

}

module.exports = HL7Message;
