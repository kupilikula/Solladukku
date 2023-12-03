import {useSelector} from "react-redux";

export default function InfoBoard() {
    const scoreBoard = useSelector( state => state.ScoreBoard);

    return (
        <div className="InfoBoard">
            {/*<ul> {scoresItems} </ul>*/}
            {/*<div className={'ScoringRules'}>*/}
            {/*    ?*/}
            {/*</div>*/}
        </div>
    )
}
