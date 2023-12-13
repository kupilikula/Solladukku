import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {
    mergeTiles,
    moveTileOnRack,
    placeTileOnRackFromBoard
} from "../store/actions";
import {useDispatch, useSelector} from "react-redux";
import {useEffect, useState} from "react";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";
import constants from "../utils/constants";

export default function RackSlot(props) {

    const dispatch = useDispatch();
    const rackTiles = useSelector(state => state.LetterRack.tilesList);
    const myTile = rackTiles[props.index];

    const [{isOver}, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            console.log('Dropped Tile:', droppedTileItem);
            // setTileActiveOnDrop(droppedTileItem.activated);
            if ( !myTile || (!myTile.activated && !droppedTileItem.tile.activated)) {
                if (droppedTileItem.origin.host === 'RACK') {
                    dispatch(moveTileOnRack({...droppedTileItem, toRackSlotPos: props.index}));
                } else if (droppedTileItem.origin.host === 'WORDBOARD') {
                    dispatch(placeTileOnRackFromBoard({...droppedTileItem, toRackSlotPos: props.index}));
                }
            } else {
                dispatch(mergeTiles({droppedTileItem: droppedTileItem, targetTile: myTile, targetLocation: {host: 'RACK', pos: props.index}}));
            }
        },
        canDrop: (droppedTileItem, monitor) => {

            if (!myTile) {
                return true;
            }
            if (myTile.activated || droppedTileItem.tile.activated) {
                return ((droppedTileItem.tile.letterType === constants.LetterTile.letterType.UYIR && myTile.letterType === constants.LetterTile.letterType.MEY) || (droppedTileItem.tile.letterType === constants.LetterTile.letterType.MEY && myTile.letterType === constants.LetterTile.letterType.UYIR));
            } else {
                return true;
            }

        },
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [myTile, props.index])

    return (
        <div className={'RackSlot'} ref={drop}>
            {myTile ? <LetterTile key={props.index + myTile.key} tile={myTile} played={false}
                                           location={{host: 'RACK', pos: props.index}}/> : null}
        </div>
    )
}
