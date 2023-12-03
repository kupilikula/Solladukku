import '../styles/Styles.css';
import {useDispatch, useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";
import {useDrop} from "react-dnd";
import {useState} from "react";
import {moveTileOnBoardFromBoard, placeTileOnBoardFromRack} from "../store/actions";


export default function Square(props) {
    // const wordList = useSelector( state => state.wordList.words);

    // const [hasUnplayedTile, setHasUnplayedTile] = useState(false);
    // const [hasPlayedTile, setHasPlayedTile] = useState(false);
    // const [tile, setTile] = useState(null);
    const dispatch = useDispatch();

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            console.log('Dropped Tile:', droppedTileItem);
            if (droppedTileItem.origin.host ==='RACK') {
                dispatch(placeTileOnBoardFromRack({row: props.row, col: props.col, tile: droppedTileItem.tile, origin: droppedTileItem.origin}));
            } else if (droppedTileItem.origin.host ==='WORDBOARD') {
                dispatch(moveTileOnBoardFromBoard({row: props.row, col: props.col, tile: droppedTileItem.tile, origin: droppedTileItem.origin}));
            }

        },
        canDrop: (tile, monitor) => props.tile===null,
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [props.row, props.col])

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
            {props.tile ? <LetterTile tile={props.tile} played = {props.played} location={{host: 'WORDBOARD', pos: { row: props.row, col: props.col }}}/> : null}
        </div>
            {isOver && (
                <div
                    className={'DropShadow'}
                />
            )}
        </div>
    )
}