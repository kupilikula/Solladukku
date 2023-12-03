import '../styles/Styles.css';
import WordBoard from "./WordBoard";
import LetterRack from "./LetterRack";
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ActionMenu from "./ActionMenu";

export default function PlayingBoard() {
    return (
        <DndProvider backend={HTML5Backend}>
        <div className="PlayingBoard">
            <WordBoard />
            <LetterRack />
            <ActionMenu />
        </div>
        </DndProvider>
    )
}