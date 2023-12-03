import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {
    moveTileOnBoardFromBoard,
    moveTileOnRack,
    placeTileOnBoardFromRack,
    placeTileOnRackFromBoard
} from "../store/actions";
import {useDispatch} from "react-redux";

export default function RackSlot(props) {

    const dispatch = useDispatch();
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            console.log('Dropped Tile:', droppedTileItem);
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
    }), [])

    return (
        <div className={'RackSlot'} ref={drop}>
            {props.children}
        </div>
    )
}
