/* eslint-disable */
const assert = require('assert');
const net = require('net');
const {HL7Message, HL7Server, HL7Client} = require('../');
const {VT, FS} = require('../lib/types');

const sampleMessage1 = `MSH|^~\\&|LCS|LCA|LIS|TEST9999|19980731153200||ORU^R01|1234|P|2.2
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
`.replace(/\n/, '\r');

describe('HL7SocketListener', function() {

  let server;

  before(function() {
  });

  after(function() {
    server && server.close();
  });

  it('should construct', function() {
    server = new HL7Server();
    assert(server instanceof HL7Server);
    assert.equal(server.listening, false);
    assert.equal(server.sockets.size, 0);
  });

  it('should construct with existing server', function() {
    const srv = new net.Server();
    server = new HL7Server(srv);
    assert(server instanceof HL7Server);
    assert.equal(server._server, srv);
  });

  it('should listen than close', function() {
    server = new HL7Server();
    return server.listen(8080).then(() => server.close());
  });

  it('should reject on listen errors', function(done) {
    server = new HL7Server();
    server.listen(8080)
        .then(() => server.listen())
        .then(() => done('Failed'))
        .catch(ignored => {
          server.close().then(() => done());
        });
  });

  it('should add middle-wares', function() {
    server = new HL7Server();
    server.use(() => {});
  });

  it('should receive hl7 messages', function(done) {
    server = new HL7Server();
    server.listen(8080).then(() => {
      const msg = HL7Message.parse(sampleMessage1);
      let i = 0;

      server.use('ORU^R01', (req) => {
        i++;
        try {
          assert.equal(req.toHL7(), msg.toHL7());
        } catch (e) {
          done(e);
        }
      });

      server.use((req) => {
        i++;
        try {
          assert.equal(i, 2);
          assert.equal(req.toHL7(), msg.toHL7());
          server.close().then(() => done());
        } catch (e) {
          done(e);
        }
      });

      const client = new HL7Client();
      client.connect(8080).then(() => {
        client.send(msg);
      });
    }).catch((e) => done(e));
  });

  it('should send nak if widdle-ware matches', function(done) {
    server = new HL7Server();
    server.listen(8080).then(() => {
      const msg = HL7Message.parse(sampleMessage1);
      server.use('ORU^R02', () => {});
      const client = new HL7Client();
      client.connect(8080).then(() => {
        client.sendReceive(msg).then(msg => {
          assert(msg);
          assert.equal(msg.MSH.MessageType.value, 'ACK');
          const msa = msg.getSegment('MSA');
          assert.equal(msa[1].value, 'AR');
          server.close().then(() => done());
        });
      });
    }).catch((e) => done(e));
  });

  it('should not exceed max buffer size', function(done) {
    server = new HL7Server({
      maxBufferPerSocket: 32
    });

    server.on('error', e => {
      if (e.message.includes('exceeded'))
        return server.close().then(() => done());
      done(e);
    });

    server.listen(8080).then(() => {
      const client = new HL7Client();
      client.connect(8080).then(() => {
        client.send(sampleMessage1);
      });
    }).catch((e) => done(e));
  });

  it('should close socket if error count >= maxErrorsPerSocket', function(done) {
    server = new HL7Server();
    const client = new HL7Client();

    client.on('close', () => {
      return server.close().then(() => done());
    });

    server.listen(8080).then(() => {
      client.connect(8080).then(() => {
        const send = () => {
          client._socket.write(VT + 'INVALID' + FS);
          client._socket.write(VT + 'INVALID' + FS);
          client._socket.write(VT + 'INVALID' + FS);
          client._socket.write(VT + 'INVALID' + FS);
          client._socket.write(VT + 'INVALID' + FS);
        };
        send();
      });
    }).catch((e) => done(e));
  });

  it('should send nak if error in middle-wares', function(done) {
    server = new HL7Server();
    const client = new HL7Client();

    server.use(() => {
      throw new Error('Any error');
    });

    server.listen(8080).then(() => {
      client.connect(8080).then(() => {
        client.sendReceive(sampleMessage1).then(msg => {
          assert(msg);
          assert(msg.MSH);
          assert(msg.getSegment('ERR'));
          server.close().then(() => done());
        });
      });
    }).catch((e) => done(e));
  });

  it('should send nak if rejected in middle-wares', function(done) {
    server = new HL7Server();
    const client = new HL7Client();

    server.use(() => {
      return Promise.reject(new Error('Any error'));
    });

    server.listen(8080).then(() => {
      client.connect(8080).then(() => {
        client.sendReceive(sampleMessage1).then(msg => {
          assert(msg);
          assert(msg.MSH);
          assert(msg.getSegment('ERR'));
          server.close().then(() => done());
        });
      });
    }).catch((e) => done(e));
  });

});