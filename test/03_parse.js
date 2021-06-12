/* eslint-disable */
const assert = require('assert');
const {HL7Message} = require('../');
const HL7Segment = require('../lib/HL7Segment')
const {VT, FS, CR} = require('../lib/types');

const sampleMessage1 = `MSH|^~\\&|LCS|LCA|LIS|TEST9999|19980731153200||ORU^R01|3629|P|2.2
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
`;

describe('Parse HL7 message', function() {

  it('should parse HL7 strings', function() {
    const msg = HL7Message.parse('MSH|^~\\&|A');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.SendingApplication.value, 'A');
  });

  it('should parse sub components', function() {
    const msg = HL7Message.parse('MSH|^~\\&|A^B^C^D');
    assert.strictEqual(msg.MSH.SendingApplication.value, 'A');
    assert.strictEqual(msg.MSH.SendingApplication[0].value, 'A');
    assert.strictEqual(msg.MSH.SendingApplication[0][1].value, 'A');
    assert.strictEqual(msg.MSH.SendingApplication[0][2].value, 'B');
    assert.strictEqual(msg.MSH.SendingApplication[0][3].value, 'C');
    assert.strictEqual(msg.MSH.SendingApplication[0][4].value, 'D');
  });

  it('should parse null fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&|||||199807311532|||||2.2|""');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.SequenceNumber.value, null);
  });

  it('should parse number fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&|||||199807311532|||||2.2|1234');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.SequenceNumber.value, 1234);
  });

  it('should parse Date Time fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&|||||199807311532|||||2.2');
    assert(msg.MSH);
    assert.deepStrictEqual(msg.MSH.DateTimeOfMessage.value, new Date('1998-07-31T15:32:00.000Z'));
  });

  it('should parse Date Time fields with milliseconds', function() {
    const msg = HL7Message.parse('MSH|^~\\&|||||199807311532.123|||||2.2');
    assert(msg.MSH);
    assert.deepStrictEqual(msg.MSH.DateTimeOfMessage.value, new Date('1998-07-31T15:32:00.123Z'));
  });

  it('should parse Date Time fields with timezone', function() {
    const msg = HL7Message.parse('MSH|^~\\&|||||199807311532.123+0500|||||2.2');
    assert(msg.MSH);
    assert.deepStrictEqual(msg.MSH.DateTimeOfMessage.value, new Date('1998-07-31T15:32:00.123+0500'));
  });

  it('should parse Date fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.5\r' +
        'AL1|1|||||20151231');
    const seg = msg.getSegment('AL1');
    assert.deepStrictEqual(seg.IdentificationDate.value, new Date('2015-12-31T00:00:00.000Z'));
  });

  it('should parse Time fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.5\r' +
        'TQ1||||134523');
    const seg = msg.getSegment('TQ1');
    assert.deepStrictEqual(seg.ExplicitTime.value, new Date('0000-01-01T13:45:23.000Z'));
  });

  it('should parse Time fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.5\r' +
        'TQ1||||134523');
    const seg = msg.getSegment('TQ1');
    assert.deepStrictEqual(seg.ExplicitTime.value, new Date('0000-01-01T13:45:23.000Z'));
  });

  it('should parse escaped characters', function() {
    const msg = HL7Message.parse('MSH|^~\\&|\\F\\\\S\\\\R\\\\E\\\\T\\abcd\\U\\|\\c65\\\\M015f\\\\M0000\\||||||||2.2|1234');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.SendingApplication.value, '|^~\\&abcdU');
    assert.strictEqual(msg.MSH.SendingFacility.value,
        'e' + String.fromCharCode(0x15f) + String.fromCharCode(0));

  });

  it('should parse hex field', function() {
    const msg = HL7Message.parse('MSH|^~\\&|\\x01020304\\');
    assert(msg.MSH);
    assert(msg.MSH.SendingApplication.value instanceof Buffer);
    assert.deepStrictEqual(msg.MSH.SendingApplication.value, Buffer.from('01020304', 'hex'));
  });

  it('should parse repeated values', function() {
    const msg = HL7Message.parse('MSH|^~\\&|A~B~C');
    assert.strictEqual(msg.MSH.SendingApplication.value, 'A');
    assert.strictEqual(msg.MSH.SendingApplication[0].value, 'A');
    assert.strictEqual(msg.MSH.SendingApplication[1].value, 'B');
    assert.strictEqual(msg.MSH.SendingApplication[2].value, 'C');
  });

  it('should get segments', function() {
    const msg = HL7Message.parse(sampleMessage1);
    assert.strictEqual(msg.segments[0].type, 'MSH');
    assert.strictEqual(msg.segments[1].type, 'PID');
    assert.strictEqual(msg.segments[2].type, 'ORC');
    assert.strictEqual(msg.segments[3].type, 'OBR');
    assert.strictEqual(msg.segments[4].type, 'OBX');
    assert.strictEqual(msg.segments[5].type, 'ORC');
    assert.strictEqual(msg.segments[5].index, 5);
    assert.strictEqual(msg.getSegment('OBR', 1)[1].value, '2');
  });

  it('should init v2.1 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.1');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'ContinuationPointer');
  });

  it('should init v2.2 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.2');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'CountryCode');
  });

  it('should init v2.3 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.3');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'PrincipalLanguageOfMessage');
  });

  it('should init v2.3.1 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.3.1');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'AlternateCharacterSetHandlingScheme');
  });

  it('should init v2.4 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.4');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'ConformanceStatementId');
  });

  it('should init v2.5 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.5');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'MessageProfileIdentifier');
  });

  it('should init v2.5.1 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.5.1');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'MessageProfileIdentifier');
  });

  it('should init v2.6 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.6');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'ReceivingNetworkAddress');
  });

  it('should init v2.7 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.7');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'ReceivingNetworkAddress');
  });

  it('should init v2.7.1 fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.7.1');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.fields[msg.MSH.fields.length - 1].name,
        'ReceivingNetworkAddress');
  });

  it('should parse VT-msg-FS', function() {
    let msg = HL7Message.parse(VT + 'MSH|^~\\&||||||||||2.7.1' + FS);
    assert(msg.MSH);
    msg = HL7Message.parse(VT + 'MSH|^~\\&||||||||||2.7.1' + FS + CR);
    assert(msg.MSH);
  });

  it('should parse from Buffer', function() {
    let buf = Buffer.from(VT + 'MSH|^~\\\\&||||||||||2.5||||||UTF-8' + FS + CR);
    let msg = HL7Message.parse(buf);
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.CharacterSet.value, 'UTF-8');
    buf = Buffer.from(VT + 'MSH|^~\\\\&||||||||||2.5||||||UTF-8|' + FS);
    msg = HL7Message.parse(buf);
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.CharacterSet.value, 'UTF-8');
  });

  it('should message start with MSH segment', function() {
    assert.throws(() => {
      HL7Message.parse('PID|');
    }, /Message must start with/);
  });

  it('should not parse unknown segments', function() {
    assert.throws(() => {
      HL7Message.parse('MSH|^~\\&||||||||||2.7.1\r' + 'PDD|');
    }, /Unknown HL7 segment/);
  });

  it('should provide line# and segment type on parse error', function() {
    assert.throws(() => {
      HL7Message.parse('MSH|^~\\&||||||||||2.5\r' + 'PDD|');
    }, (e) => {
      assert.strictEqual(e.line, 2);
      assert.strictEqual(e.segmentId, 'PDD');
      return true;
    });
  });

  it('should provide sequence on parse error', function() {
    assert.throws(() => {
      HL7Message.parse('MSH|^~\\&||||||||||2.5\r' +
          'PID|1||||||ABCD');
    }, (e) => {
      assert.strictEqual(e.line, 2);
      assert.strictEqual(e.segmentId, 'PID');
      assert.strictEqual(e.sequence, '1');
      assert.strictEqual(e.fieldPosition, 8);
      assert.strictEqual(e.repetition, 1);
      assert.strictEqual(e.component, 1);
      return true;
    });
  });

  it('should add fields if values exceeds dictionary fields', function() {
    const msg = HL7Message.parse('MSH|^~\\&||||||||||2.1||||||1234');
    assert(msg.MSH);
    assert.strictEqual(msg.MSH.CustomField18.value, '1234');
  });


  it('should parse custom segments', function() {
    const messageString = sampleMessage1 + '\rZDS|1.2.345.67.8.9.12341234123412.345|1.2.345.67.8.9.12341234123412.345';

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

    HL7Message.parse(messageString, { customDict })
  })
});
