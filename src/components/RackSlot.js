import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {
    moveTileOnRack,
    placeTileOnRackFromBoard
} from "../store/actions";
import {useDispatch, useSelector} from "react-redux";
import {useEffect, useState} from "react";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";

export default function RackSlot(props) {

    const dispatch = useDispatch();
    const rackTiles = useSelector( state => state.LetterRack.tilesList);
    const myTile = rackTiles[props.index];
    // const [tileActiveOnDrop, setTileActiveOnDrop] = useState(false);

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            console.log('Dropped Tile:', droppedTileItem);
            // setTileActiveOnDrop(droppedTileItem.activated);
            if (droppedTileItem.origin.host ==='RACK') {
                dispatch(moveTileOnRack({...droppedTileItem, toRackSlotPos: props.index}));
            } else if (droppedTileItem.origin.host ==='WORDBOARD') {
                dispatch(placeTileOnRackFromBoard({...droppedTileItem, toRackSlotPos: props.index}));
            }

        },
        canDrop: (tile, monitor) => { return true;},
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [props.index])

    return (
        <div className={'RackSlot'} ref={drop}>
            {myTile!==null ? <LetterTile key={props.index + myTile.key} tile={myTile} played={false} location={{host: 'RACK', pos: props.index}} /> : null}
        </div>
    )
}
