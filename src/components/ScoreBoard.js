import {useSelector} from "react-redux";

export default function ScoreBoard() {
    const scores = useSelector( state => state.scoreBoard.scores);
    const scoresItems = scores.map( (s,i) =>
        <li key={i}>
            {s}
        </li>
    );
    return (
        <div className="ScoreBoard">
            <ul> {scoresItems} </ul>
            <div className={'ScoringRules'}>
                ?
            </div>
        </div>
    )
}
