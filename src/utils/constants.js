
const constants = {
    arrayRange: (start, stop, step) =>
        Array.from(
            { length: (stop - start) / step + 1 },
            (value, index) => start + index * step
        ),
    LetterTile: {
        host: {
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
            BONUS: 'BONUS',
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