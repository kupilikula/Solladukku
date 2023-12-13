import {useSelector} from "react-redux";
import ScoreBoard from "./ScoreBoard";
import LetterBags from "./LetterBags";
import Chat from "./Chat";
import TurnHistory from "./TurnHistory";

export default function InfoBoard() {
    const scoreBoard = useSelector( state => state.ScoreBoard);

    return (
        <div className="InfoBoard">
            <ScoreBoard/>
            <LetterBags />
            <Chat />
            <TurnHistory />
        </div>
    )
}
