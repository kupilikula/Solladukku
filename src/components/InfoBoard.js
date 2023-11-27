import {useSelector} from "react-redux";

export default function InfoBoard() {
    const scores = useSelector( state => state.ScoreBoard.scores);
    const scoresItems = scores.map( (s,i) =>
        <li key={i}>
            {s}
        </li>
    );
    return (
        <div className="InfoBoard">
            <ul> {scoresItems} </ul>
            <div className={'ScoringRules'}>
                ?
            </div>
        </div>
    )
}
