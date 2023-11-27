import '../styles/Styles.css';
import WordBoard from "./WordBoard";
import LetterRack from "./LetterRack";
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

export default function PlayingBoard() {
    return (
        <DndProvider backend={HTML5Backend}>
        <div className="PlayingBoard">
            <WordBoard />
            <LetterRack />
        </div>
        </DndProvider>
    )
}