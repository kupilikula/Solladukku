
const squareMultipliers = Array(15).fill().map(() => Array(15).fill(''));
squareMultipliers[0][0] = 'Word3';
squareMultipliers[0][7] = 'Word3';
squareMultipliers[0][14] = 'Word3';
squareMultipliers[7][0] = 'Word3';
squareMultipliers[7][14] = 'Word3';
squareMultipliers[14][0] = 'Word3';
squareMultipliers[14][7] = 'Word3';
squareMultipliers[14][14] = 'Word3';

squareMultipliers[1][1] = 'Word2';
squareMultipliers[2][2] = 'Word2';
squareMultipliers[3][3] = 'Starred';
squareMultipliers[4][4] = 'Word2';
squareMultipliers[1][13] = 'Word2';
squareMultipliers[2][12] = 'Word2';
squareMultipliers[3][11] = 'Starred';
squareMultipliers[4][10] = 'Word2';
squareMultipliers[13][1] = 'Word2';
squareMultipliers[12][2] = 'Word2';
squareMultipliers[11][3] = 'Starred';
squareMultipliers[10][4] = 'Word2';
squareMultipliers[13][13] = 'Word2';
squareMultipliers[12][12] = 'Word2';
squareMultipliers[11][11] = 'Starred';
squareMultipliers[10][10] = 'Word2';

squareMultipliers[0][3] = 'Letter2';
squareMultipliers[0][11] = 'Letter2';
squareMultipliers[2][6] = 'Letter2';
squareMultipliers[2][8] = 'Letter2';
squareMultipliers[3][0] = 'Letter2';
squareMultipliers[3][7] = 'Letter2';
squareMultipliers[3][14] = 'Letter2';
squareMultipliers[6][2] = 'Letter2';
squareMultipliers[6][6] = 'Letter2';
squareMultipliers[6][8] = 'Letter2';
squareMultipliers[6][12] = 'Letter2';
squareMultipliers[7][3] = 'Letter2';
squareMultipliers[7][11] = 'Letter2';
squareMultipliers[8][2] = 'Letter2';
squareMultipliers[8][6] = 'Letter2';
squareMultipliers[8][8] = 'Letter2';
squareMultipliers[8][12] = 'Letter2';
squareMultipliers[11][0] = 'Letter2';
squareMultipliers[11][7] = 'Letter2';
squareMultipliers[11][14] = 'Letter2';
squareMultipliers[12][6] = 'Letter2';
squareMultipliers[12][8] = 'Letter2';
squareMultipliers[14][3] = 'Letter2';
squareMultipliers[14][12] = 'Letter2';

squareMultipliers[1][5] = 'Letter3';
squareMultipliers[1][9] = 'Letter3';
squareMultipliers[5][1] = 'Letter3';
squareMultipliers[5][5] = 'Letter3';
squareMultipliers[5][9] = 'Letter3';
squareMultipliers[5][13] = 'Letter3';
squareMultipliers[9][1] = 'Letter3';
squareMultipliers[9][5] = 'Letter3';
squareMultipliers[9][9] = 'Letter3';
squareMultipliers[9][13] = 'Letter3';
squareMultipliers[13][5] = 'Letter3';
squareMultipliers[13][9] = 'Letter3';

squareMultipliers[7][7] = 'Starred';

const multiplierLabels = {
    'Word3': (<><span>3x</span><span>சொல்</span></>),
    'Word2': (<><span>2x</span><span>சொல்</span></>),
    'Letter3': (<><span>3x</span><span>எழு</span></>),
    'Letter2': (<><span>2x</span><span>எழு</span></>),
    'Starred': (
        <span style={{position: 'relative'}}>
            <span className={'StarMultiplier'}>
                <span>2x</span>
                <span>சொல்</span>
            </span>
            <span className={'Star'} >★</span>
        </span>
),
}

export {squareMultipliers, multiplierLabels};