/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const {ArgumentError} = require('errorex');
const {capitalizeFirst, hl7Encode, hl7Decode} = require('./helpers');
const ParseError = require('./ParseError');
const {SUBCOMPONENT_SEPARATOR, COMPONENT_SEPARATOR} = require('./types');

class HL7FieldData {

  /**
   * @param {HL7Field} field
   * @param {Object} def
   * @param {Number} level
   * @param {Object} [customDict]
   * @param {Object} [customDict.fields]
   */
  constructor(field, def, level, customDict = {fields: {}}) {
    Object.defineProperty(this, '_field', {
      value: field,
      enumerable: false
    });
    this._def = def;
    this._level = level || 0;
    this._items = null;
    this._value = null;
    this._customDict = customDict;

    const dict = require('./dictionary/' + this.message.version);
    dict.fields = {...dict.fields, ...this._customDict.fields};
    const fldDict = dict.fields[def.dt];
    /* istanbul ignore next */
    if (!fldDict)
      throw new ArgumentError('Unknown HL7 field (%s)', def.dt);
    if (fldDict.components) {
      for (const [i, c] of fldDict.components.entries()) {
        if (def.dt === 'TS' && c.dt === 'ST' && !i)
          this.defineComponent(i + 1, {
            dt: 'ST',
            dtMean: 'DTM',
            desc: c.desc,
            opt: c.opt,
            rep: c.rep
          });
        else
          this.defineComponent(i + 1, c);
      }
    }
  }

  defineComponent(sequence, def) {
    this._items = this._items || [];
    const index = sequence - 1;
    const comp = new HL7FieldData(this._field, def, 1, this._customDict);
    Object.defineProperty(this, sequence, {
      get: () => this._items[index],
      enumerable: false
    });
    Object.defineProperty(this, capitalizeFirst(def.desc), {
      get: () => this._items[index],
      enumerable: false
    });
    this._items[index] = comp;
    return comp;
  }

  /**
   *
   * @return {HL7Field}
   */
  get field() {
    return this._field;
  }

  /**
   *
   * @return {HL7Segment}
   */
  get segment() {
    return this.field.segment;
  }

  /**
   *
   * @return {HL7Message}
   */
  get message() {
    return this.segment.message;
  }

  get value() {
    return this._items ? this._items[0].value : this._value;
  }

  set value(value) {
    if (this._items)
      this._items[0].value = value;
    else this._value = value;
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

  /**
   *
   * @param {string} hl7Text
   */
  parse(hl7Text) {
    if (!this._items) {
      this._value = hl7Decode(hl7Text,
          this._def.dtMean || this._def.dt);
      return;
    }
    const sep = this._level ? SUBCOMPONENT_SEPARATOR : COMPONENT_SEPARATOR;
    const arr = hl7Text.split(sep);
    for (const [i, v] of arr.entries()) {
      try {
        if (i >= this._items.length) {
          this.defineComponent(i + 1, {
            dt: 'ST',
            desc: 'Component' + (i + 1),
            opt: 'O'
          });
        }
        this._items[i].parse(v);
      } catch (e) {
        const err = (e instanceof ParseError) ? e : new ParseError(e);
        err.component = i + 1;
        throw err;
      }

    }
  }

  toHL7() {
    if (!this._items)
      return this._value ? hl7Encode(this._value, this._def.dtMean ||
          this._def.dt) : '';
    let out = '';
    const sep = this._level ? SUBCOMPONENT_SEPARATOR : COMPONENT_SEPARATOR;
    let k = 0;
    for (let i = this._items.length - 1; i >= 0; i--) {
      const s = this._items[i].toHL7();
      if (k || s || this._items[i].value != null)
        out = (s || '') + (k++ ? sep : '') + out;
    }
    return out;
  }

}

module.exports = HL7FieldData;
