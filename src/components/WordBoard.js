import '../styles/Styles.css';
import {useSelector} from "react-redux";
import Square from "./Square";


export default function WordBoard() {
    const wordList = useSelector( state => state.WordBoard.words);
    // const wordListItems = wordList.map( w =>
    //     <li key={w.id}>
    //         {w.word}
    //     </li>
    // );
    const rows = Array.from({length: 15}, (_, j) => j)
        .map( j =>
            Array.from({length: 15}, (_, i) => i).map( i => <Square key={15*j + i} col={i} row={j} />) );

    return (
        <div className="WordBoard">
            {rows.map( (r, r_i) => (<div className="BoardRow" key={r_i}>
                {r}
            </div>))}

        </div>
    )
}