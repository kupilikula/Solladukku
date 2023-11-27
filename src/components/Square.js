import '../styles/Styles.css';
import {useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import {UyirMeyTiles} from "../utils/TileSet";
import {useDrop} from "react-dnd";


export default function Square(props) {
    // const wordList = useSelector( state => state.wordList.words);

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (item, monitor) => {console.log('QQQ:', item)},
            // dropTile(monitor.getItem(), props.row, props.col),
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [props.row, props.col])

    const squareAnnotate = props.row.toString() + ',' + props.col.toString();
    const squareTile = useSelector(state => state.WordBoard.tiles[props.row][props.col]);
    return (
        <div
            ref={drop}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
            }}
        >
        <div className="Square">
            {squareTile!=='' ? <LetterTile tileType={UyirMeyTiles[squareTile]} /> : null}
        </div>
            {isOver && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: '100%',
                        zIndex: 1,
                        opacity: 0.5,
                        backgroundColor: 'black',
                    }}
                />
            )}
        </div>
    )
}