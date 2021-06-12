/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const HL7FieldData = require('./HL7FieldData');
const ParseError = require('./ParseError');
const {REPETITION_SEPARATOR} = require('./types');

class HL7Field {

  /**
   * @param {HL7Segment} segment
   * @param {string} name
   * @param {Object} def
   * @param {Object} [customDict]
   * @param {Object} [customDict.fields]
   */
  constructor(segment, name, def, customDict) {
    Object.defineProperty(this, '_segment', {
      value: segment,
      enumerable: false
    });
    this._name = name;
    this._def = def;
    this._data = null;
    this._customDict = customDict;
  }

  /**
   *
   * @return {HL7Segment}
   */
  get segment() {
    return this._segment;
  }

  /**
   *
   * @return {HL7Message}
   */
  get message() {
    return this.segment.message;
  }

  /**
   *
   * @return {string}
   */
  get sequence() {
    return this._segment.fields.indexOf(this) + 1;
  }

  /**
   *
   * @return {string}
   */
  get name() {
    return this._name;
  }

  /**
   *
   * @return {string}
   */
  get dataType() {
    return this._def.dt;
  }

  /**
   *
   * @return {number}
   */
  get maxLength() {
    return this._def.len;
  }

  /**
   *
   * @return {string}
   */
  get description() {
    return this._def.desc;
  }

  /**
   *
   * @return {string}
   */
  get optional() {
    return this._def.opt;
  }

  /**
   *
   * @return {number|string}
   */
  get repeatable() {
    return this._def.rep;
  }

  /**
   *
   * @return {number}
   */
  get table() {
    return this._def.table;
  }

  get length() {
    return (this._data && this._data.length) || 0;
  }

  get value() {
    return this._data && this._data[0].value;
  }

  set value(value) {
    if (!this._data)
      this.add();
    this._data[0].value = value;
  }

  /**
   *
   * @param {*} value
   * @return {this}
   */
  setValue(value) {
    this.value = value;
    return this;
  }

  add() {
    this._data = this._data || [];
    const data = new HL7FieldData(this, this._def, undefined, this._customDict);
    const k = this._data.length;
    this._data.push(data);
    Object.defineProperty(this, k, {
      get() {
        return this._data[k];
      }
    });
    return data;
  }

  parse(value) {
    this._data = null;
    if (!value)
      return;
    if (this.segment.type === 'MSH' && this.sequence <= 2)
      this.add().parse(value);
    else {
      const values = value.split(REPETITION_SEPARATOR);
      for (const [i, v] of values.entries()) {
        try {
          this.add().parse(v);
        } catch (e) {
          const err = (e instanceof ParseError) ? e : new ParseError(e);
          err.repetition = i + 1;
          throw err;
        }
      }
    }
  }

  toHL7() {
    if (!this._data)
      return '';
    let out = '';
    for (const data of this._data)
      out += (out ? REPETITION_SEPARATOR : '') + data.toHL7();
    return out;
  }

}

module.exports = HL7Field;
