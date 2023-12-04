import '../styles/Styles.css';
import {useDispatch, useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";
import {useDrop} from "react-dnd";
import {useState} from "react";
import {moveTileOnBoardFromBoard, placeTileOnBoardFromRack} from "../store/actions";
import {multiplierLabels} from "../utils/squareMultipliers";


export default function Square(props) {
    const dispatch = useDispatch();

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            if (droppedTileItem.origin.host ==='RACK') {
                dispatch(placeTileOnBoardFromRack({row: props.row, col: props.col, tile: droppedTileItem.tile, origin: droppedTileItem.origin}));
            } else if (droppedTileItem.origin.host ==='WORDBOARD') {
                dispatch(moveTileOnBoardFromBoard({row: props.row, col: props.col, tile: droppedTileItem.tile, origin: droppedTileItem.origin}));
            }
        },
        canDrop: (tile, monitor) => {
            return props.tile===null;
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
            {props.tile ? <LetterTile tile={props.tile} played = {props.played} location={{host: 'WORDBOARD', pos: { row: props.row, col: props.col }}}/> : null}
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