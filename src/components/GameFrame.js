import '../styles/Styles.css';
import WordBoard from "./WordBoard";
import ScoreBoard from "./ScoreBoard";
import LetterRack from "./LetterRack";
import PlayingBoard from "./PlayingBoard";
import InfoBoard from "./InfoBoard";
export default function GameFrame(props) {
    console.log('line8:', props.wsConnection);
    return (
        <div className="GameFrame">
            <PlayingBoard wsConnection={props.wsConnection} />
            <InfoBoard wsConnection={props.wsConnection} />
        </div>
    )
}