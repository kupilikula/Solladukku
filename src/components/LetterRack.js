import {useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import {TileSet} from "../utils/TileSet";

export default function LetterRack() {

    const turnNumber = useSelector(state => state.ScoreBoard.turnNumber);
    const rackLetters = useSelector( state => state.LetterRack.tilesList);

    return (
        <div className="LetterRack">
            {rackLetters.map( (l, l_i) => {return <LetterTile key={l_i + l + turnNumber} tile={TileSet[l]} played={false} location={{host: 'RACK', pos: l_i}}/>})}
        </div>
    )
}