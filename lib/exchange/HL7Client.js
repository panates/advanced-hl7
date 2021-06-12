/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const net = require('net');
const tls = require('tls');
const {EventEmitter} = require('events');
const {ArgumentError, ErrorEx} = require('errorex');
const iconv = require('iconv-lite');
const HL7Message = require('../HL7Message');
const HL7ProtocolBuffer = require('./HL7ProtocolBuffer');
const {xVT, xFS, xCR} = require('../types');

class HL7Client extends EventEmitter {

  /**
   *
   * @param {net.Socket|Object} [param1]
   * @param {Object} [param2]
   * @param {Object} [param2.customDict]
   */
  constructor(param1, param2) {
    super();
    let options;
    let socket = undefined;
    if (param2 !== undefined) {
      socket = param1;
      options = param2 || {};
    } else if (param1 instanceof net.Socket) {
      socket = param1;
    } else {
      options = param1;
    }

    if (options && options.customDict)
      this._customDict = options.customDict;
    if (socket && !(socket instanceof net.Socket))
      throw new ArgumentError('You can provide Socket instance as fist argument');
    this._extSocket = socket;
    this._waitQueue = {};
    this._encoding = 'utf8';
    this._controlIdSeq = 0;
    this._socket = null;
    this._buffer = null;
    this._connecting = false;
    this._keepAlive = null;
    this._connectionListener = () => this._onConnect();
    this._closeListener = (...args) => this.emitSafe('close', ...args);
    this._errorListener = (...args) => this.emitSafe('error', ...args);
    this._dataListener = (data) => this._buffer.write(data);
    if (socket && socket._handle)
      this.connect();
  }

  /**
   *
   * @return {boolean}
   */
  get connected() {
    return !!(this._socket && this._socket._handle);
  }

  /**
   *
   * @return {boolean}
   */
  get connecting() {
    return !!(this._socket && this._socket.connecting || this._connecting);
  }

  get encoding() {
    return this._encoding;
  }

  setEncoding(encoding) {
    if (!iconv.encodingExists(encoding))
      throw new ErrorEx('Unsupported encoding "%s"', encoding);
    this._encoding = encoding;
  }

  /**
   *
   * @param {Boolean} [enable=false]
   * @param {number} [initialDelay=0]
   */
  setKeepAlive(enable, initialDelay) {
    this._keepAlive = enable ? initialDelay || 0 : null;
    if (this._socket)
      this._socket.setKeepAlive(enable, initialDelay);
  }

  /**
   * @param {Object} [param1] Options
   * @param {string} [param1.host='localhost']
   * @param {number} [param1.port=2575]
   * @param {string} [param1.localAddress]
   * @param {number} [param1.localPort]
   * @param {number} [param1.family]
   * @param {hints} [param1.hints]
   * @param {Function} [param1.lookup]
   * @method
   * @return {Promise}
   */
  /**
   * @param {number} [param1] Port number
   * @param {string} [param2='localhost'] Remote address
   * @param {Object} [param3] Options
   * @param {string} [param3.tls]
   * @param {string} [param3.cert]
   * @param {string} [param3.key]
   * @param {string} [param3.ca]
   * @method
   * @return {Promise}
   */
  connect(param1, param2, param3) {
    /* istanbul ignore next: Hard to catch timing */
    if (this.connecting) {
      if (!arguments.length)
        return Promise.resolve();
      return Promise.reject(new Error('Already connecting'));
    }
    if (this.connected) {
      if (!arguments.length)
        return Promise.resolve();
      return Promise.reject(new Error('Already connected'));
    }

    this._connecting = true;
    return new Promise((resolve, reject) => {
      let opts;
      let socket = this._extSocket;

      if (arguments.length) {
        // Merge all arguments to a single object instance
        if (param1 > 0) {
          if (typeof param3 === 'object')
            opts = param3;
          else if (typeof param2 === 'object')
            opts = param2;
          opts = opts || {};
          opts.port = param1;
          if (typeof param2 === 'string')
            opts.host = param2;
        } else {
          opts = param1;
          if (opts && typeof opts !== 'object')
            throw new ArgumentError('Invalid argument');
        }
        /* istanbul ignore next */
        opts = opts || {};
        opts.host = opts.host || '127.0.0.1';

        /* istanbul ignore next */
        opts.port = opts.port || 2575;
        if (!(opts.port > 0 && opts.port <= 65565))
          throw new ArgumentError('You must provide a valid "port" property');
      }

      this._buffer = new HL7ProtocolBuffer();
      this._buffer.on('block', data => this._onHL7Data(data));

      this._socket = socket = socket ||
          (opts.cert ? tls.connect(opts) : net.connect(opts));

      socket.removeListener('connect', this._connectionListener);
      socket.removeListener('secureConnect', this._connectionListener);
      socket.removeListener('close', this._connectionListener);
      socket.removeListener('error', this._errorListener);
      socket.removeListener('data', this._dataListener);
      if (socket instanceof tls.TLSSocket)
        socket.on('secureConnect', this._connectionListener);
      else
        socket.on('connect', this._connectionListener);
      socket.on('close', this._closeListener);
      socket.on('error', this._errorListener);
      socket.on('data', this._dataListener);

      if (!this.connected || socket.connecting) {
        let connectListener = null;
        const errorListener = (e) => {
          this._connecting = false;
          socket.removeListener('connect', connectListener);
          reject(e);
        };
        socket.once('error', errorListener);
        connectListener = () => {
          this._connecting = false;
          socket.removeListener('error', errorListener);
          resolve();
        };
        socket.once('connect', connectListener);

        if (opts.timeout)
          socket.setTimeout(opts.timeout, () => {
            const e = new Error('Connect timeout');
            e.code = 'ECONNECTTIMEOUT';
            socket.destroy(e);
            reject(e);
          });
        if (!socket.connecting)
          socket.connect(opts);
      } else {
        this._connecting = false;
        resolve();
      }

    }).catch(e => {
      this._connecting = false;
      throw e;
    });
  }

  close() {
    return new Promise(resolve => {
      if (!this.connected)
        return resolve();
      this._socket.once('close', () => resolve());
      this._socket.destroy();
    });
  }

  /**
   *
   * @param{HL7Message|string} [msg]
   * @return {Promise}
   */
  send(msg) {
    return new Promise(resolve => {
      if (typeof msg === 'string')
        msg = HL7Message.parse(msg, {customDict: this._customDict});

      /* istanbul ignore next */
      if (!(msg instanceof HL7Message))
        throw new ArgumentError('You must provide HL7Message or string argument');
      /* istanbul ignore next */
      if (!this.connected)
        throw new ErrorEx('Not connected');

      /* istanbul ignore next: hard to test */
      if (!msg.MSH.MessageControlId.value)
        msg.MSH.MessageControlId.value = ++this._controlIdSeq;

      const str = msg.toHL7();
      let charset = 'utf8';
      if (msg.MSH[18]) {
        if (this.encoding && !msg.MSH[18].value)
          msg.MSH[18].value = this.encoding;
        charset = msg.MSH[18].value;
      }
      const buf = Buffer.from([xVT, ...iconv.encode(str, charset), xFS, xCR]);
      this._socket.write(buf, null, () => resolve());
    });
  }

  /**
   *
   * @param{HL7Message|string} msg
   * @param{Number} [timeout]
   * @return {Promise<HL7Message>}
   */
  sendReceive(msg, timeout) {
    return Promise.resolve().then(() => {
      if (typeof msg === 'string')
        msg = HL7Message.parse(msg, { customDict: this._customDict });
    }).then(() => this.send(msg))
        .then(() => {

          return new Promise((resolve, reject) => {
            const contId = msg.MSH.MessageControlId.value;
            this._waitQueue[contId] = (msg) => resolve(msg);
            if (timeout)
              setTimeout(() => {
                delete this._waitQueue[contId];
                reject(new ErrorEx('Request timed out'));
              }, timeout);
          });
        });
  }

  emitSafe(event, ...args) {
    try {
      if (this.listenerCount(event) > 0)
        this.emit(event, ...args);
    } catch (ignored) {
      // ignored
    }
  }

  /**
   *
   * @private
   */
  _onConnect() {
    this._socket.setTimeout(0);
    if (this._keepAlive || this._keepAlive === 0)
      this._socket.setKeepAlive(true, this._keepAlive);
    else this._socket.setKeepAlive(false);
    this.emitSafe('connect');
  }

  /**
   *
   * @param{string|Buffer} data
   * @private
   */
  _onHL7Data(data) {
    let msg;
    try {
      msg = HL7Message.parse(data, { encoding: this.encoding, customDict: this._customDict });
    } catch (e) /* istanbul ignore next */ {
      e.message = 'Invalid HL7 data received from server. ' + e.message;
      this.emitSafe('error', e);
      return;
    }
    this._onMessage(msg);
  }

  /**
   *
   * @param {HL7Message} msg
   * @protected
   */
  _onMessage(msg) {
    const msaSegment = msg.getSegment('MSA');
    if (msaSegment) {
      const contId = msaSegment.MessageControlId.value;
      if (this._waitQueue[contId]) {
        const fn = this._waitQueue[contId];
        delete this._waitQueue[contId];
        fn(msg);
        return;
      }
    }
    this.emitSafe('message', msg);
  }

  /**
   *
   * @param {...*} args
   * @return {Promise<HL7Client>}
   */
  static connect(...args) {
    const client = new HL7Client();
    /* istanbul ignore next */
    if (typeof args[args.length - 1] === 'function')
      client.on('connect', args[args.length - 1]);
    return client.connect(...args).then(() => client);
  }

}

module.exports = HL7Client;
