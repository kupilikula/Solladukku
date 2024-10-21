import '../styles/Styles.css';
import {useDispatch} from "react-redux";
import LetterTile from "./LetterTile";
import {useDrop} from "react-dnd";
import {mergeTiles, moveTileOnBoardFromBoard, placeTileOnBoardFromRack} from "../store/actions";
import {multiplierLabels} from "../utils/squareMultipliers";
import constants from "../utils/constants";


export default function Square(props) {
    const dispatch = useDispatch();

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            if ( !props.tile || (!props.tile.activated && !droppedTileItem.tile.activated)) {
                if (droppedTileItem.origin.host === 'RACK') {
                    dispatch(placeTileOnBoardFromRack({
                        row: props.row,
                        col: props.col,
                        tile: droppedTileItem.tile,
                        origin: droppedTileItem.origin
                    }));
                } else if (droppedTileItem.origin.host === 'WORDBOARD') {
                    dispatch(moveTileOnBoardFromBoard({
                        row: props.row,
                        col: props.col,
                        tile: droppedTileItem.tile,
                        origin: droppedTileItem.origin
                    }));
                }
            } else {
                dispatch(mergeTiles({droppedTileItem: droppedTileItem, targetTile: props.tile, targetLocation: {host: 'WORDBOARD', pos: {
                            row: props.row, col: props.col
                        }}}));
            }
        },
        canDrop: (droppedTileItem, monitor) => {
            if (!props.tile) {
                return true;
            }
            if (props.tile.activated || droppedTileItem.tile.activated) {
                return ((droppedTileItem.tile.letterType === constants.LetterTile.letterType.UYIR && props.tile.letterType === constants.LetterTile.letterType.MEY) || (droppedTileItem.tile.letterType === constants.LetterTile.letterType.MEY && props.tile.letterType === constants.LetterTile.letterType.UYIR));
            } else {
                return false;
            }

            },
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [props.row, props.col, props.tile])

    return (
        <div
            ref={drop}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
            }}
        >
        <div className={`Square ${props.multiplier}`}>
            {props.tile ? <LetterTile tile={props.tile}
                                      played = {props.played}
                                      location={{host: 'WORDBOARD', pos: { row: props.row, col: props.col }}}
            /> : null}
            <span className={'Multiplier'}>{multiplierLabels[props.multiplier]}</span>
        </div>
            {isOver && (
                <div
                    className={'DropShadow'}
                />
            )}
        </div>
    )
}