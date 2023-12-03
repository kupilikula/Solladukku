import '../styles/Styles.css';
import {useDrag} from "react-dnd";

export default function LetterTile(props) {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'TILE',
        item: {tile: props.tile, origin: props.location},
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging()
        })
    }));

    return (
        <>
        {
    !isDragging &&
    <div ref={drag} className={`LetterTile ${props.tile.letterType} ${props.played ? 'Played' : 'Unplayed'} `}
         draggable={!props.played}>
        {props.tile.letter}
    </div>
    }
        </>
    )
}
