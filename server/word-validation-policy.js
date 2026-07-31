const fs = require('fs');
const path = require('path');

const TAMIL_ONLY_RE = /^[\u0B80-\u0BFF]+$/u;
const TAMIL_DIGIT_RE = /[\u0BE6-\u0BEF\u0BF0-\u0BF9]/u;
const FORBIDDEN_ANALYSIS_RE = /(?:\+sandhi(?:[a-z]+|-[a-z]+)?(?:=|$)|\+(?:abbrev|proper|propn)(?:\+|$)|\+entity_[a-z]+(?:\+|$))/u;
const COMBINING_CATEGORIES = new Set(['Mc', 'Mn']);

function loadWordSet(filename) {
    try {
        return new Set(
            fs.readFileSync(filename, 'utf8')
                .split(/\r?\n/u)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))
                .map((line) => line.normalize('NFC'))
        );
    } catch (error) {
        if (error.code === 'ENOENT') return new Set();
        throw error;
    }
}

function tamilLetterCount(word) {
    let count = 0;
    for (const character of word) {
        if (!COMBINING_CATEGORIES.has(/\p{Mc}/u.test(character) ? 'Mc' : /\p{Mn}/u.test(character) ? 'Mn' : 'base')) {
            count += 1;
        }
    }
    return count;
}

function isPlayableWordShape(rawWord) {
    if (typeof rawWord !== 'string') return false;
    const word = rawWord.normalize('NFC');
    if (!TAMIL_ONLY_RE.test(word) || TAMIL_DIGIT_RE.test(word)) return false;
    const count = tamilLetterCount(word);
    return count >= 2 && count <= 15;
}

function analysisFromLookupLine(line) {
    const tab = line.indexOf('\t');
    if (tab < 0) return '';
    return line.slice(tab + 1).trim();
}

function isPlayableAnalysis(analysis) {
    return Boolean(analysis && analysis !== '+?' && !FORBIDDEN_ANALYSIS_RE.test(analysis));
}

function hasPlayableAnalysis(lines) {
    return lines.some((line) => isPlayableAnalysis(analysisFromLookupLine(line)));
}

function createGameplayPolicy(options = {}) {
    const exclusionPath = options.exclusionPath
        || path.join(__dirname, 'gameplay-proper-noun-exclusions.txt');
    const exceptionPath = options.exceptionPath
        || path.join(__dirname, 'gameplay-common-word-exceptions.txt');
    const excluded = loadWordSet(exclusionPath);
    const commonWordExceptions = loadWordSet(exceptionPath);

    return {
        excluded,
        commonWordExceptions,
        isExcluded(word) {
            const normalized = String(word || '').normalize('NFC');
            return excluded.has(normalized) && !commonWordExceptions.has(normalized);
        },
    };
}

module.exports = {
    analysisFromLookupLine,
    createGameplayPolicy,
    hasPlayableAnalysis,
    isPlayableAnalysis,
    isPlayableWordShape,
    tamilLetterCount,
};
