
const constants = {
    LetterTile: {
        containedIn: {
            RACK: 'RACK',
            WORDBOARD: 'WORDBOARD',
            BAG: 'BAG',
        },
        playState: {
            PLAYED: 'PLAYED',
            UNPLAYED: 'UNPLAYED',
        },
        letterType: {
            UYIR: 'UYIR',
            MEY: 'MEY',
            UYIRMEY: 'UYIRMEY',
        }
    },
    Square: {
        occupancy: {
            PLAYED: 'PLAYED',
            OCCUPIED: 'OCCUPIED',
            UNOCCUPIED: 'UNOCCUPIED',
        },
        scoringType: {
            NORMAL: 'NORMAL',
            DOUBLELETTER: 'DOUBLELETTER',
            DOUBLEWORD: 'DOUBLEWORD',
            TRIPLELETTER: 'TRIPLELETTER',
            TRIPLEWORD: 'TRIPLEWORD',
        }
    }
}
export default constants;