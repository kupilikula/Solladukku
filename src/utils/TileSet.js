import constants from "./constants";

const Vowels = [
    '\u0b85',
    '\u0b86',
    '\u0b87',
    '\u0b88',
    '\u0b89',
    '\u0b8a',
    '\u0b8e',
    '\u0b8f',
    '\u0b90',
    '\u0b92',
    '\u0b93',
    '\u0b94',
];
const VowelDiacritics= [
    '',
    '\u0BBE',
    '\u0BBF',
    '\u0BC0',
    '\u0BC1',
    '\u0BC2',
    '\u0BC6',
    '\u0BC7',
    '\u0BC8',
    '\u0BCA',
    '\u0BCB',
    '\u0BCC',
];
const UnmarkedConsonants= [
    '\u0b95',
    '\u0b99',
    '\u0b9a',
    '\u0b9e',
    '\u0b9f',
    '\u0ba3',
    '\u0ba4',
    '\u0ba8',
    '\u0baa',
    '\u0bae',
    '\u0baf',
    '\u0bb0',
    '\u0bb2',
    '\u0bb5',
    '\u0bb4',
    '\u0bb3',
    '\u0bb1',
    '\u0ba9',
    '\u0b9c',
    '\u0bb7',
    '\u0bb8',
    '\u0bb9',
];
const MarkedConsonants = UnmarkedConsonants.map(c=> c + '\u0bcd');

const MeyTiles = {
    'க்': {
        key: 'க்',
        letter: 'க்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ச்': {
        key: 'ச்',
        letter: 'ச்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ட்': {
        key: 'ட்',
        letter: 'ட்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'த்': {
        key: 'த்',
        letter: 'த்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ப்': {
        key: 'ப்',
        letter: 'ப்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ற்': {
        key: 'ற்',
        letter: 'ற்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ங்': {
        key: 'ங்',
        letter: 'ங்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ஞ்': {
        key: 'ஞ்',
        letter: 'ஞ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 6,
    },
    'ண்': {
        key: 'ண்',
        letter: 'ண்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 4,
    },
    'ந்': {
        key: 'ந்',
        letter: 'ந்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ம்': {
        key: 'ம்',
        letter: 'ம்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ன்': {
        key: 'ன்',
        letter: 'ன்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ய்': {
        key: 'ய்',
        letter: 'ய்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ர்': {
        key: 'ர்',
        letter: 'ர்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ல்': {
        key: 'ல்',
        letter: 'ல்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'வ்': {
        key: 'வ்',
        letter: 'வ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ழ்': {
        key: 'ழ்',
        letter: 'ழ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ள்': {
        key: 'ள்',
        letter: 'ள்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ஜ்': {
        key: 'ஜ்',
        letter: 'ஜ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 8,
    },
    'ஷ்': {
        key: 'ஷ்',
        letter: 'ஷ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 8,
    },
    'ஸ்': {
        key: 'ஸ்',
        letter: 'ஸ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 8,
    },
    'ஹ்': {
        key: 'ஹ்',
        letter: 'ஹ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 8,
    },
};

const UyirTiles = {
    'அ': {
        key: 'அ',
        letter: 'அ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 1,
    },
    'ஆ': {
        key: 'ஆ',
        letter: 'ஆ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'இ': {
        key: 'இ',
        letter: 'இ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 1,
    },
    'ஈ': {
        key: 'ஈ',
        letter: 'ஈ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 4,
    },
    'உ': {
        key: 'உ',
        letter: 'உ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 1,
    },
    'ஊ': {
        key: 'ஊ',
        letter: 'ஊ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 5,
    },
    'எ': {
        key: 'எ',
        letter: 'எ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'ஏ': {
        key: 'ஏ',
        letter: 'ஏ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 4,
    },
    'ஐ': {
        key: 'ஐ',
        letter: 'ஐ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'ஒ': {
        key: 'ஒ',
        letter: 'ஒ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 4,
    },
    'ஓ': {
        key: 'ஓ',
        letter: 'ஓ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 4,
    },
    'ஔ': {
        key: 'ஔ',
        letter: 'ஔ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 8,
    }
};

const UyirMeyTiles={};

const joinMeyTileAndUyirTileReturnLetter = (cTile,vTile) => {
    return UnmarkedConsonants[MarkedConsonants.indexOf(cTile.letter)] + VowelDiacritics[Vowels.indexOf(vTile.letter)];
};
const joinMeyAndUyirLetters = (c,v) => {
    if (c==='-' && v==='-') {
        return '';
    }
    if (c==='-') {
        return v;
    }
    if (v==='-') {
        return c;
    }

    return UnmarkedConsonants[MarkedConsonants.indexOf(c)] + VowelDiacritics[Vowels.indexOf(v)];
};
const joinMeyTileAndUyirTile = (cTile,vTile) => {
    let l = joinMeyTileAndUyirTileReturnLetter(cTile, vTile);
    return {
        key: l,
        letter: l,
        letterType: constants.LetterTile.letterType.UYIRMEY,
        points: cTile.points + vTile.points,
    }
};

const splitUyirMeyTile = (umTile) => {
    const c = MarkedConsonants[UnmarkedConsonants.indexOf(umTile.letter[0])];
    const v = umTile.letter.length===2 ? Vowels[VowelDiacritics.indexOf(umTile.letter[1])] : Vowels[0];
    return [ MeyTiles[c], UyirTiles[v] ];
}

for (const [c, cTile] of Object.entries(MeyTiles)) {
    for (const [v, vTile] of Object.entries(UyirTiles)) {
        const newTile = joinMeyTileAndUyirTile(cTile, vTile);
        UyirMeyTiles[newTile.letter] = newTile;
    }
}

// export {UyirMeyTiles, joinMeyTileAndUyirTile, joinMeyTileAndUyirTileReturnLetter, splitUyirMeyTile};

const BonusTiles = {
'?': {
    key: '?',
    letter: '',
    letterType: constants.LetterTile.letterType.BONUS,
    points: 0,
    }
}

const isConsonant = (l) => MarkedConsonants.includes(l);
const isVowel = (l) => Vowels.includes(l);

const TileSet = { ...UyirTiles, ...MeyTiles, ...UyirMeyTiles, ...BonusTiles };
const TileMethods = { joinMeyTileAndUyirTile, splitUyirMeyTile , isConsonant, isVowel, joinMeyAndUyirLetters}
export { TileSet, TileMethods, Vowels, MarkedConsonants, UnmarkedConsonants };