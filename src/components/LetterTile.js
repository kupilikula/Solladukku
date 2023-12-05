import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {useState} from "react";
import {useDispatch} from "react-redux";
import {toggleActivatedOfTileOnBoard, toggleActivatedOfTileOnRack} from "../store/actions";

export default function LetterTile(props) {

    const dispatch = useDispatch();
    // const [activated, setActivated]= useState(props.tile.activated);

    const onDoubleClick = () => {
        // setActivated(!activated);
        if (props.location.host==='RACK') {
            dispatch(toggleActivatedOfTileOnRack(props.location.pos));
        } else if (!props.played && props.location.host==='WORDBOARD'){
            dispatch(toggleActivatedOfTileOnBoard(props.location.pos));
        }
    };

    const [{ isDragging }, drag] = useDrag(() => {
            return ({
                type: 'TILE',
                item: {tile: props.tile, origin: props.location},
                collect: (monitor) => ({
                    isDragging: !!monitor.isDragging()
                }),
                canDrag: () => !props.played,
            });
        }
    ,[props.tile, props.location]);

    return (
        <>
        {
    !isDragging &&
    <div style={{userSelect: "none"}} ref={drag} onDoubleClick={onDoubleClick} className={`LetterTile ${props.tile.letterType} ${props.played ? 'Played' : 'Unplayed'} ${props.location.host} ${props.tile.activated ? 'activated' : ''} `}>
        <div>{props.tile.letter}</div>
        <span className={'Points'}>{props.tile.points}</span>
    </div>
    }
        </>
    )
}
