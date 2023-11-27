import '../styles/Styles.css';
import WordBoard from "./WordBoard";
import ScoreBoard from "./ScoreBoard";
import LetterRack from "./LetterRack";
import PlayingBoard from "./PlayingBoard";
import InfoBoard from "./InfoBoard";
export default function GameFrame() {
    return (
        <div className="GameFrame">
            <PlayingBoard />
            <InfoBoard />
        </div>
    )
}