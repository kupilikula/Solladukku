import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {
    moveTileOnBoardFromBoard,
    moveTileOnRack,
    placeTileOnBoardFromRack,
    placeTileOnRackFromBoard
} from "../store/actions";
import {useDispatch} from "react-redux";

export default function LetterTile(props) {

    const dispatch = useDispatch();
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'TILE',
        item: {tile: props.tile, origin: props.location},
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging()
        })
    }));

    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TILE',
        drop: (droppedTileItem, monitor) => {
            console.log('Dropped Tile:', droppedTileItem);
            if (droppedTileItem.origin.host ==='RACK') {
                dispatch(moveTileOnRack(droppedTileItem));
            } else if (droppedTileItem.origin.host ==='WORDBOARD') {
                dispatch(placeTileOnRackFromBoard(droppedTileItem));
            }

        },
        canDrop: (tile, monitor) => {},
        collect: monitor => ({
            isOver: !!monitor.isOver(),
        }),
    }), [])

    return (
        <>
        {
    !isDragging &&
    <div ref={drag} className={`LetterTile ${props.tile.letterType} ${props.played ? 'Played' : 'Unplayed'} ${props.location.host}`}
         draggable={!props.played}>
        <div>{props.tile.letter}</div>
        <span className={'Points'}>{props.tile.points}</span>
    </div>
    }
        </>
    )
}
