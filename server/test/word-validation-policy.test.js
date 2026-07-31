const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    createGameplayPolicy,
    hasPlayableAnalysis,
    isPlayableAnalysis,
    isPlayableWordShape,
    tamilLetterCount,
} = require('../word-validation-policy');

test('word shape matches the board dictionary limits', () => {
    assert.equal(isPlayableWordShape('மரம்'), true);
    assert.equal(isPlayableWordShape('அ'), false);
    assert.equal(isPlayableWordShape('தமிழ்2'), false);
    assert.equal(isPlayableWordShape('Tamil'), false);
    assert.equal(tamilLetterCount('மரம்'), 3);
});

test('Sandhi, abbreviation, proper-name and entity analyses are not playable', () => {
    assert.equal(isPlayableAnalysis('ஊராட்சி+noun+nom+sandhit'), false);
    assert.equal(isPlayableAnalysis('என்+pronoun+comp+sandhik=க்'), false);
    assert.equal(isPlayableAnalysis('செய்+verb+vpart=உ+sandhi-t=த்'), false);
    assert.equal(isPlayableAnalysis('கி+abbrev'), false);
    assert.equal(isPlayableAnalysis('சென்னை+proper+noun'), false);
    assert.equal(isPlayableAnalysis('சென்னை+entity_city+nom'), false);
});

test('a genuine lexical analysis keeps an ambiguous surface playable', () => {
    assert.equal(hasPlayableAnalysis([
        'உலகம்\tஉலகம்+entity_other+nom',
        'உலகம்\tஉலகம்+noun+nom',
    ]), true);
    assert.equal(hasPlayableAnalysis([
        'ஊராட்சித்\tஊராட்சி+noun+nom+sandhit',
        'ஊராட்சித்\t+?',
    ]), false);
});

test('reviewed common-word exceptions override the proper-name exclusion list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solmaalai-policy-'));
    const exclusions = path.join(dir, 'excluded.txt');
    const exceptions = path.join(dir, 'exceptions.txt');
    fs.writeFileSync(exclusions, 'சென்னை\nஉலகம்\n', 'utf8');
    fs.writeFileSync(exceptions, 'உலகம்\n', 'utf8');
    const policy = createGameplayPolicy({
        exclusionPath: exclusions,
        exceptionPath: exceptions,
    });
    assert.equal(policy.isExcluded('சென்னை'), true);
    assert.equal(policy.isExcluded('உலகம்'), false);
});

test('deployed dictionary and gameplay policy exclude reviewed proper names', () => {
    const policy = createGameplayPolicy();
    const dictionary = new Set(
        fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'tamil_dictionary.txt'), 'utf8')
            .split(/\r?\n/u)
            .filter(Boolean)
    );
    assert.ok(policy.excluded.size >= 3800);
    for (const word of ['சென்னை', 'மதுரை', 'இந்தியா', 'முருகன்', 'இராமன்']) {
        assert.equal(policy.isExcluded(word), true, `${word} must be blocked`);
        assert.equal(dictionary.has(word), false, `${word} must not be cached as playable`);
    }
    for (const word of ['உலகம்', 'சாடை']) {
        assert.equal(policy.isExcluded(word), false, `${word} must keep its common reading`);
        assert.equal(dictionary.has(word), true, `${word} must remain in the dictionary`);
    }
});
