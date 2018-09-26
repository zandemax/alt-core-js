import 'mocha';
import {expect} from 'chai';
import {encodeProto, decodeProto} from "../protoParsing";

describe('PROTO parsing', () => {

    const TEST_PROTO = 'src/tests/resources/proto/test.proto';

    it('can encode simple nested messages into proto buffers', () => {
        const result = encodeProto(TEST_PROTO, {
            nested: {
                nestedText: 'hello'
            },
            text: 'world'
        }, 'Test');
        expect(result.toString('utf-8')).to.be.equal('\n\u0007\n\u0005hello\u0012\u0005world');
    });

    it('can decode proto messages into objects', () => {
        const result = decodeProto(TEST_PROTO, 'Test', new Buffer('\n\u0007\n\u0005hello\u0012\u0005world', 'utf-8'));
        expect(result).to.have.property('nested');
        expect(result).to.have.property('text');
        expect(result.nested.nestedText).to.be.equal('hello');
        expect(result.text).to.be.equal('world');
    })
});