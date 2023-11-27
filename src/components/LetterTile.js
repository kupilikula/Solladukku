import '../styles/Styles.css';
import {useDrag} from "react-dnd";

export default function LetterTile(props) {
    console.log('yyy:', props.tileType);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'TILE',
        item: props.tileType,
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging()
        })
    }));

    return (
        <div ref={drag} className={`LetterTile ${props.tileType.letterType}`} draggable={true}>
            {props.tileType.letter}
        </div>
    )
}
