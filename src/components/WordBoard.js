import '../styles/Styles.css';
import {shallowEqual, useSelector} from "react-redux";
import Square from "./Square";
import {squareMultipliers} from "../utils/squareMultipliers";


export default function WordBoard() {
    const playedTilesWithPositions = useSelector(state => state.WordBoard.playedTilesWithPositions, [shallowEqual]);
    const unplayedTilesWithPositions = useSelector(state => state.WordBoard.unplayedTilesWithPositions, [shallowEqual]);
    console.log('line10, XXX:', unplayedTilesWithPositions);
    const allTiles = Array(15).fill().map(() => Array(15).fill({tile: null, played: false}));

    playedTilesWithPositions.forEach(({row, col, tile}) => {
        allTiles[row][col] = {tile: tile, played: true};
    });

    unplayedTilesWithPositions.forEach(({row, col, tile}) => {
        allTiles[row][col] = {tile: tile, played: false};
    });

    const rows = Array.from({length: 15}, (_, j) => j)
        .map(j =>
            Array.from({length: 15}, (_, i) => i).map(i => {
                    return (<Square key={15 * j + i} col={i} row={j} tile={allTiles[j][i].tile} played={allTiles[j][i].played} multiplier={squareMultipliers[j][i]}/>);
                }
            ));

    return (
        <div className="WordBoard">
            {rows.map((r, r_i) => (<div className="BoardRow" key={r_i}>
                {r}
            </div>))}

        </div>
    )
}