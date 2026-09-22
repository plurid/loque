import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../canonical';

describe('canonical JSON and hashing', () => {
    it('sorts keys by UTF-16 code units at every depth without whitespace', () => {
        expect(canonicalJson({ b: [3, { z: 1, a: null }], a: 'x', '10': true, '2': false }))
            .toBe('{"10":true,"2":false,"a":"x","b":[3,{"a":null,"z":1}]}');
        expect(canonicalJson({ '€': 1, '😀': 2, é: 3 })).toBe('{"é":3,"€":1,"😀":2}');
    });

    it('serializes numbers and strings like RFC 8785', () => {
        expect(canonicalJson([-0, 1e21, 1e-7, 0.1, 100, 'a"\\\n'])).toBe('[0,1e+21,1e-7,0.1,100,"a\\"\\\\\\n"]');
        expect(canonicalJson(null)).toBe('null');
    });

    it('hashes UTF-8 text with SHA-256', async () => {
        expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
