jest.mock('../utils/dictionary', () => ({
    getDictionary: () => ['அகரம்', 'மரம்'],
}));

jest.mock('../utils/aiPrefixIndex', () => ({
    hasAIPrefix: prefix => 'மரத்தை'.startsWith(prefix),
}));

import { hasPrefix } from './aiHelpers';

test('uses the morphology index when a prefix is absent from compact headwords', () => {
    expect(hasPrefix('மரத்')).toBe(true);
    expect(hasPrefix('மரத்தை')).toBe(true);
    expect(hasPrefix('ழழ')).toBe(false);
});
