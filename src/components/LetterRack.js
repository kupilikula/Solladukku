import {useSelector} from "react-redux";
import LetterTile from "./LetterTile";
import constants from "../utils/constants";
import {MeyTiles, UyirTiles, UyirMeyTiles} from "../utils/TileSet";

export default function LetterRack() {

    const playingLetters = useSelector( state => state.LetterRack);
    console.log('xxx:',MeyTiles[playingLetters.consonants[0]]);
    const consonantTiles = playingLetters.consonants.map( (c,i) =>
        (<LetterTile key={i} tileType={MeyTiles[c]} containedIn={constants.LetterTile.containedIn.RACK} playState={constants.LetterTile.playState.UNPLAYED}/>)
    );

    const vowelTiles = playingLetters.vowels.map( (v,i) =>
        (<LetterTile key={i} tileType={UyirTiles[v]} containedIn={constants.LetterTile.containedIn.RACK} playState={constants.LetterTile.playState.UNPLAYED}/>)
    );

    return (
        <div className="LetterRack">
            <div className={'Consonants'}>
                {consonantTiles}
            </div>
            <div className={'Vowels'}>
                {vowelTiles}
            </div>
            <div className={''}>
                <LetterTile tileType={UyirMeyTiles['கு']} containedIn={constants.LetterTile.containedIn.RACK} playState={constants.LetterTile.playState.UNPLAYED} />
            </div>
        </div>
    )
}