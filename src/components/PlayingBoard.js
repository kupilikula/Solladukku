import '../styles/Styles.css';
import WordBoard from "./WordBoard";
import LetterRack from "./LetterRack";
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import ActionMenu from "./ActionMenu";
import {TouchBackend} from "react-dnd-touch-backend";

import { usePreview } from 'react-dnd-preview'
import LetterTile from "./LetterTile";

const MyPreview = () => {
    const preview = usePreview()
    if (!preview.display) {
        return null
    }
    const {itemType, item, style} = preview;
    return <div style={{...style, zIndex: 100}}> <LetterTile tile={item.tile} location={item.origin} played={false} /> </div>
}

export default function PlayingBoard() {
    return (
        <DndProvider backend={TouchBackend} options={{enableTouchEvents: true, enableMouseEvents: true}}>
            <div className="PlayingBoard">
                <WordBoard />
                <LetterRack />
                <ActionMenu />
            </div>
            <MyPreview />
        </DndProvider>
    )
}