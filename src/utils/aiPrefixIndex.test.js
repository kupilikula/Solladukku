import { __testing, hasAIPrefix, hasAIWord } from './aiPrefixIndex';
import fs from 'fs';
import path from 'path';

function fnvHashPair(text) {
    const bytes = new TextEncoder().encode(text);
    let first = 2166136261;
    let second = (2166136261 ^ 0x9E3779B9) >>> 0;
    for (const byte of bytes) {
        first = Math.imul((first ^ byte) >>> 0, 16777619) >>> 0;
        second = Math.imul((second ^ byte) >>> 0, 16777619) >>> 0;
    }
    return [first, second | 1];
}

function makeIndex(values, bitCount = 1024, hashCount = 3) {
    const buffer = new ArrayBuffer(24 + bitCount / 8 * 2);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode('SMAIPF02'));
    const view = new DataView(buffer);
    view.setUint32(8, bitCount, true);
    view.setUint8(12, hashCount);
    view.setUint32(16, bitCount, true);
    view.setUint8(20, hashCount);
    for (const offset of [24, 24 + bitCount / 8]) {
        const bits = new Uint8Array(buffer, offset, bitCount / 8);
        for (const value of values) {
            const [first, second] = fnvHashPair(value);
            for (let index = 0; index < hashCount; index++) {
                const bit = ((first + Math.imul(index, second)) >>> 0) % bitCount;
                bits[bit >>> 3] |= 1 << (bit & 7);
            }
        }
    }
    return buffer;
}

afterEach(() => __testing.reset());

test('recognizes FST surface prefixes from a binary index', () => {
    __testing.hydrateAIPrefixIndex(makeIndex(['ம', 'மர', 'மரத்', 'மரத்தை']));

    expect(hasAIPrefix('மரத்')).toBe(true);
    expect(hasAIWord('மரத்தை')).toBe(true);
    expect(hasAIPrefix('வேறுசொல்')).toBe(false);
});

test('rejects malformed prefix artifacts', () => {
    expect(() => __testing.hydrateAIPrefixIndex(new ArrayBuffer(8))).toThrow(/truncated/);
});

test('checked-in release index contains representative FST-only prefixes', () => {
    const payload = fs.readFileSync(path.join(process.cwd(), 'public', 'tamil_ai_prefixes.bloom'));
    __testing.hydrateAIPrefixIndex(payload);

    expect(hasAIPrefix('அகன்')).toBe(true);
    expect(hasAIPrefix('அகன்று')).toBe(true);
    expect(hasAIWord('அகன்று')).toBe(true);
    expect(hasAIPrefix('வருகின்ற')).toBe(true);
    expect(hasAIPrefix('வைக்கப்பட்டிருந்')).toBe(true);
    expect(hasAIWord('வைக்கப்பட்டிருந்த')).toBe(true);
});
