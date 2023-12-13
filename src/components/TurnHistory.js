import {useSelector} from "react-redux";

export default function TurnHistory() {
    const scoreBoard = useSelector( state => state.ScoreBoard);

    return (
        <div className="TurnHistory">
        </div>
    )
}
