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
        letter: 'க்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ச்': {
        letter: 'ச்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ட்': {
        letter: 'ட்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'த்': {
        letter: 'த்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ப்': {
        letter: 'ப்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ற்': {
        letter: 'ற்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ங்': {
        letter: 'ங்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ஞ்': {
        letter: 'ஞ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ண்': {
        letter: 'ண்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ந்': {
        letter: 'ந்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ம்': {
        letter: 'ம்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ன்': {
        letter: 'ன்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ய்': {
        letter: 'ய்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ர்': {
        letter: 'ர்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'ல்': {
        letter: 'ல்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 1,
    },
    'வ்': {
        letter: 'வ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 2,
    },
    'ழ்': {
        letter: 'ழ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ள்': {
        letter: 'ள்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 3,
    },
    'ஜ்': {
        letter: 'ஜ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ஷ்': {
        letter: 'ஷ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ஸ்': {
        letter: 'ஸ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
    'ஹ்': {
        letter: 'ஹ்',
        letterType: constants.LetterTile.letterType.MEY,
        points: 5,
    },
};

const UyirTiles = {
    'அ': {
        letter: 'அ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 1,
    },
    'ஆ': {
        letter: 'ஆ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'இ': {
        letter: 'இ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 1,
    },
    'ஈ': {
        letter: 'ஈ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'உ': {
        letter: 'உ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'ஊ': {
        letter: 'ஊ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'எ': {
        letter: 'எ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'ஏ': {
        letter: 'ஏ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 2,
    },
    'ஐ': {
        letter: 'ஐ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'ஒ': {
        letter: 'ஒ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'ஓ': {
        letter: 'ஓ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 3,
    },
    'ஔ': {
        letter: 'ஔ',
        letterType: constants.LetterTile.letterType.UYIR,
        points: 5,
    }
};

const UyirMeyTiles={};

const joinMeyTileAndUyirTileReturnLetter = (cTile,vTile) => {
    return UnmarkedConsonants[MarkedConsonants.indexOf(cTile.letter)] + VowelDiacritics[Vowels.indexOf(vTile.letter)];
};
const joinMeyTileAndUyirTile = (cTile,vTile) => {
    return {
        letter: joinMeyTileAndUyirTileReturnLetter(cTile, vTile),
        letterType: constants.LetterTile.letterType.UYIRMEY,
        points: cTile.points + vTile.points,
    }
};

const splitUyirMeyTile = (umTile) => {
    const c = MarkedConsonants[UnmarkedConsonants.indexOf(umTile.letter[0])];
    const v = Vowels[VowelDiacritics.indexOf(umTile.letter[1])];
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
    letter: '',
    letterType: constants.LetterTile.letterType.BONUS,
    points: 0,
    }
}

const TileSet = { ...UyirTiles, ...MeyTiles, ...UyirMeyTiles, ...BonusTiles };
const TileMethods = { joinMeyTileAndUyirTile, splitUyirMeyTile }
export { TileSet, TileMethods };