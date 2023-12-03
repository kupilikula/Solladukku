import {useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";
import RackSlot from "./RackSlot";
import constants from "../utils/constants";

export default function LetterRack() {

    const completedTurns = useSelector(state => state.ScoreBoard.completedTurns);
    const rackLetters = useSelector( state => state.LetterRack.tilesList);

    return (
        <div className="LetterRack">
            {constants.arrayRange(0,13,1).map(i =>
                (<RackSlot key={i} index={i}>
                    {rackLetters[i]!==null ? <LetterTile key={i + rackLetters[i] + completedTurns} tile={TileSet[rackLetters[i]]} played={false} location={{host: 'RACK', pos: i}}/> : null}
                </RackSlot>)

            )}
        </div>
    )
}