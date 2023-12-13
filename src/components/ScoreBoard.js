import {useSelector} from "react-redux";

export default function ScoreBoard() {
    const scores = useSelector( state => state.scoreBoard);
    return (
        <div className="ScoreBoard">
        </div>
    )
}
