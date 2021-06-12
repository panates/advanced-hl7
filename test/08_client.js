/* eslint-disable */
const assert = require('assert');
const {EventEmitter} = require('events');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const {HL7Message, HL7Client, connect} = require('../');
const {VT, FS, CR} = require('../lib/types');
const {rejects, doesNotReject} = require('rejected-or-not');

assert.rejects = assert.rejects || rejects;
assert.doesNotReject = assert.doesNotReject || doesNotReject;

const sampleMessage1 = `MSH|^~\\&|LCS|LCA|LIS|TEST9999|19980731153200||ORU^R01|1234|P|2.5
PID|2|2161348462|20809880170|1614614|20809880170^TESTPAT||19760924000000|M|||^^^^00000-0000|||||||86427531^^^03|SSN# HERE
ORC|NW|8642753100012^LIS|20809880170^LCS||||||19980727000000|||HAVILAND
OBR|1|8642753100012^LIS|20809880170^LCS|008342^UPPER RESPIRATORY CULTURE^L|||19980727175800||||||SS#634748641 CH14885 SRC:THROA SRC:PENI|19980727000000||||||20809880170||19980730041800||BN|F
OBX|1|ST|008342^UPPER RESPIRATORY CULTURE^L||FINALREPORT|||||N|F|||19980729160500|BN
ORC|NW|8642753100012^LIS|20809880170^LCS||||||19980727000000|||HAVILAND
OBR|2|8642753100012^LIS|20809880170^LCS|997602^.^L|||19980727175800||||G|||19980727000000||||||20809880170||19980730041800|||F|997602|||008342
OBX|2|CE|997231^RESULT 1^L||M415|||||N|F|||19980729160500|BN
NTE|1|L|MORAXELLA (BRANHAMELLA) CATARRHALIS
NTE|2|L|HEAVY GROWTH
NTE|3|L|BETA LACTAMASE POSITIVE
OBX|3|CE|997232^RESULT 2^L||MR105|||||N|F|||19980729160500|BN
NTE|1|L|ROUTINE RESPIRATORY FLORA
`.replace(/\n/g, '\r');
const ack1 = `MSH|^~\\&|LCA|LCS|AcmeHIS|StJohn|19980731153200||ACK^O01|1235|P|2.2
MSA|AA|1234`.replace(/\n/g, '\r');

describe('HL7Client', function() {

  const ev = new EventEmitter();
  const sockets = new Set();
  const tlssockets = new Set();
  let server;
  let tlsserver;
  let client;
  let msg1;
  let receivedData = [];
  const tlsoptions = {
    key: fs.readFileSync(path.resolve(__dirname, './support/private-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, './support/public-cert.pem')),
    rejectUnauthorized: false,
    port: 8081
  };

  function listenerOnData() {
    if (receivedData.length)
      return Promise.resolve(receivedData.shift());
    return new Promise(resolve => {
      ev.once('data', () => {
        return resolve(receivedData.shift());
      });
    });
  }

  before(function(done) {
    msg1 = HL7Message.parse(sampleMessage1);

    server = net.createServer();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('data', (data) => {
        receivedData.push(data);
        ev.emit('data');
        setTimeout(() => {
          if (!socket.destroyed)
            socket.write(VT + ack1 + FS + CR);
        }, 10);
      });
      socket.on('close', () => sockets.delete(socket));
    });
    server.on('listening', () => {
      try {
        tlsserver = tls.createServer({
          key: fs.readFileSync(path.resolve(__dirname, './support/private-key.pem')),
          cert: fs.readFileSync(path.resolve(__dirname, './support/public-cert.pem')),
          rejectUnauthorized: false
        });
      } catch (e) {
        return done(e);
      }
      tlsserver.on('secureConnection', (socket) => {
        tlssockets.add(socket);
        socket.on('data', (data) => {
          receivedData.push(data);
          ev.emit('data');
          setTimeout(() => {
            if (!socket.destroyed)
              socket.write(VT + ack1 + FS + CR);
          }, 10);
        });
        socket.on('close', () => {
          socket.destroy();
          tlssockets.delete(socket);
        });
      });
      tlsserver.on('listening', () => done());
      tlsserver.on('error', (e) => done(e));
      tlsserver.listen(8081);
    });
    server.on('error', (e) => done(e));
    server.listen(8080);

  });

  after(function() {
    return client && client.close();
  });

  after(function() {
    for (const socket of sockets.values()) {
      socket.destroy();
    }
    return server.close();
  });

  after(function() {
    for (const socket of tlssockets.values()) {
      socket.destroy();
    }
    return tlsserver.close();
  });

  it('should construct', function() {
    const client = new HL7Client();
    assert(client instanceof HL7Client);
    assert.strictEqual(client.connected, false);
    assert.strictEqual(client.connecting, false);
  });

  it('should construct with existing socket', function() {
    const socket = new net.Socket({host: 'localhost', port: 8080});
    const client = new HL7Client(socket);
    assert(client instanceof HL7Client);
    assert.strictEqual(client._extSocket, socket);
    assert.strictEqual(client.connected, false);
    assert.strictEqual(client.connecting, false);
  });

  it('should construct validate argument', function() {
    assert.throws(() => {
      new HL7Client(1234, {});
    }, /You can provide/);
  });

  it('should set encoding', function() {
    const client = new HL7Client();
    client.setEncoding('win1254');
    assert.strictEqual(client.encoding, 'win1254');
  });

  it('should setEncoding() validate argument', function() {
    assert.throws(() => {
      const client = new HL7Client();
      client.setEncoding('abcde');
    }, /Unsupported encoding/);
  });

  it('should set keep alive', function() {
    const client = new HL7Client();
    client.setKeepAlive(true);
    assert.strictEqual(client._keepAlive, 0);
    client.setKeepAlive();
    assert.strictEqual(client._keepAlive, null);
    client.setKeepAlive(true, 100);
    assert.strictEqual(client._keepAlive, 100);
    return client.connect(8080).then(() => {
      client.setKeepAlive(true, 200);
      assert.strictEqual(client._keepAlive, 200);
    });
  });

  it('should connect() validate argument', function() {
    client = new HL7Client();
    return assert.rejects(() => client.connect('sfdasf'),
        /Invalid argument/);
  });

  it('should validate port number', function() {
    client = new HL7Client();
    return assert.rejects(() => client.connect(66000),
        /You must provide a valid/);
  });

  it('should connect(port)', function() {
    client = new HL7Client();
    return client.connect(8080);
  });

  it('should connect(port, host)', function() {
    client = new HL7Client();
    return client.connect(8080, 'localhost');
  });

  it('should connect(port, host, options)', function() {
    client = new HL7Client();
    return client.connect(8080, 'localhost', {timeout: 1000});
  });

  it('should connect(port, options)', function() {
    client = new HL7Client();
    return client.connect(8080, {host: 'localhost', timeout: 1000});
  });

  it('should connect(options)', function() {
    client = new HL7Client();
    return client.connect({port: 8080, host: 'localhost'});
  });

  it('should connect to secure server', function() {
    client = new HL7Client();
    return client.connect(tlsoptions);
  });

  it('should connect() return resolved promise if already connected', function() {
    client = new HL7Client();
    return client.connect(8080)
        .then(() => client.connect());
  });

  it('should connect(...args) return rejected promise if already connected', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        assert.rejects(() => client.connect(8080), /Already/)
    );
  });

  it('should connect static', function() {
    return connect(8080);
  });


  it('can reconnect after close', function() {
    client = new HL7Client();
    return client.connect(8080)
        .then(() => client.close())
        .then(() => client.connect(8080));
  });

  it('should close() return resolved promise if already closed', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        client.close().then(() => client.close()));
  });

  it('should connect() rejected promise after timeout', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        client.connect().then(() => client.close())
    );
  });

  it('should connect() return rejected promise after timeout', function() {
    client = new HL7Client();
    return assert.rejects(() =>
            client.connect(8081, 'tempuri.org', {timeout: 1}),
        /timeout/);
  });

  it('should send HL7Message', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        client.send(msg1).then(() =>
            listenerOnData().then(data => {
              assert(data, VT + sampleMessage1 + FS + CR);
            })
        )
    );
  });

  it('should send string hl7 message', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        client.send(sampleMessage1).then(() =>
            listenerOnData().then(data => {
              assert(data, VT + sampleMessage1 + FS + CR);
            })
        )
    );
  });

  it('should send message and receive response', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        client.sendReceive(msg1).then(resp => {
          assert.strictEqual(resp.getSegment('MSA').MessageControlId.value, msg1.MSH.MessageControlId.value);
        })
    );
  });

  it('should send HL7Message to secure server', function() {
    client = new HL7Client();
    return client.connect(tlsoptions).then(() =>
        client.send(msg1).then(() =>
            listenerOnData().then(data => {
              assert(data, VT + sampleMessage1 + FS + CR);
            })
        )
    );
  });

  it('should send message and receive response from secure server', function() {
    client = new HL7Client();
    return client.connect(tlsoptions).then(() =>
        client.sendReceive(msg1).then(resp => {
          assert.strictEqual(resp.getSegment('MSA').MessageControlId.value, msg1.MSH.MessageControlId.value);
        })
    );
  });

  it('should send message and wait till given time', function() {
    client = new HL7Client();
    return client.connect(8080).then(() =>
        assert.rejects(() =>
                client.sendReceive(msg1, 1),
            /timed out/)
    );
  });

  it('should use external socket instance', function(done) {
    const socket = new net.Socket();
    socket.connect(8080, 'localhost');
    socket.once('connect', () => {
      client = new HL7Client(socket);
      client.close()
          .then(() => client.connect(8080))
          .then(() => client.close())
          .then(() => done())
          .catch((e => done(e)));
    });
  });

  it('can reconnect after close (external socket)', function() {
    client = new HL7Client();
    return client.connect(8080)
        .then(() => client.close())
        .then(() => client.connect(8080));
  });

  describe('events', function() {

    it('should emit "connect"', function(done) {
      client = new HL7Client();
      client.on('connect', () => {
        try {
          assert.strictEqual(client.connected, true);
          done();
        } catch (e) {
          done(e);
        }
      });
      client.connect(8080).then(() => client.close());
    });

    it('should emit "close"', function(done) {
      client = new HL7Client();
      client.on('close', () => {
        try {
          assert.strictEqual(client.connected, false);
          done();
        } catch (e) {
          done(e);
        }
      });
      client.connect(8080).then(() => client.close());
    });

    it('should emit "error"', function(done) {
      client = new HL7Client();
      client.on('error', (ignored) => {
        done();
      });
      client.connect(8082).catch(() => {});
    });

    it('should emit "message"', function(done) {
      client = new HL7Client();
      client.on('message', (resp) => {
        try {
          assert.strictEqual(resp.getSegment('MSA').MessageControlId.value, msg1.MSH.MessageControlId.value);
        } catch (e) {
          return done(e);
        }
        done();
      });
      client.connect(8080).then(() =>
          client.send(msg1));
    });
  });

  it('should parse custom segments', function() {
    const customDict = {
      segments: {
        ZDS: {
          desc: '',
          fields: [
            {
              dt: 'RP',
              desc: 'Study Instance UID',
              opt: 'R',
              rep: 1
            },
            {
              dt: 'ST',
              desc: 'pointer',
              opt: 'R',
              rep: 1
            }
          ]
        }
      },
      fields: {
        RP: {
          desc: "Reference Pointer",
          components: [
            {
              dt: 'ST',
              desc: 'pointer',
              opt: 'O',
              rep: 1
            }
          ]
        }
      }
    };

    client = new HL7Client({customDict});

    const messageString = 'MSH|^~\\&||||||||||2.5\r' +
      'ZDS|1.2.345.67.8.9.12341234123412.345|1.2.345.67.8.9.12341234123412.345'
    const hl7Message = HL7Message.parse(messageString, {customDict});

    return client.connect(8080).then(() =>
      client.send(hl7Message).then(() =>
        listenerOnData().then(data => {
          assert(data, VT + hl7Message + FS + CR);
        })
      ));
  });
});
