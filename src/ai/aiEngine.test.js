jest.mock('../utils/dictionary', () => ({
    getDictionary: () => [],
    validateWordsWithHttpServer: jest.fn(async words => ({
        valid: words.every(word => word === 'அகன்று'),
        invalidWords: words.filter(word => word !== 'அகன்று'),
    })),
}));

jest.mock('../utils/aiPrefixIndex', () => ({
    hasAIPrefix: prefix => 'அகன்று'.startsWith(prefix),
    hasAIWord: word => word === 'அகன்று',
}));

import { validateWordsWithHttpServer } from '../utils/dictionary';
import { computeAIMove } from './aiEngine';

test('discovers and plays an FST-only inflection through morphology prefixes', async () => {
    validateWordsWithHttpServer.mockImplementation(async words => ({
        valid: words.every(word => word === 'அகன்று'),
        invalidWords: words.filter(word => word !== 'அகன்று'),
    }));
    const result = await computeAIMove(
        { playedTilesWithPositions: [] },
        ['அ', 'க்', 'அ', 'ன்', 'ற்', 'உ'],
        { vowelsBag: {}, consonantsBag: {}, bonusBag: {} },
        'computer-player',
        { timeLimitMs: 1000, serverValidationEnabled: true }
    );

    expect(validateWordsWithHttpServer).toHaveBeenCalled();
    expect(result.type).toBe('play');
    const words = result.turnInfo.turnFormedWords.map(
        word => word.map(entry => entry.tile.letter).join('')
    );
    expect(words).toContain('அகன்று');
});
