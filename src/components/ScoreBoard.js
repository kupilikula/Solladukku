import {useSelector} from "react-redux";
//style={{display: "flex", flexDirection: 'row', justifyContent: 'space-between', borderStyle: 'solid', borderWidth: 2, borderColor: 'black', borderRadius: 10, width: 280, margin: 10, backgroundColor: 'white'}}s

export default function ScoreBoard() {
    const scores = useSelector( state => state.ScoreBoard);
    return (
        <div className="ScoreBoard" style={{display: "flex", flexDirection: 'row', justifyContent: 'space-between', width: 280, margin: 10, backgroundColor: 'white'}}>
            <div style={{padding: 15, display: "flex", flexDirection: 'column', justifyContent: 'space-between', borderStyle: 'solid', borderRightWidth: 1, borderColor: 'black', borderTopLeftRadius: 10, borderBottomLeftRadius: 10, width: 140, backgroundColor: 'white', height: '100%'}}>
                <div style={{ borderBottomStyle: 'solid', borderBottomWidth: 1}}>
                    Player1 Name
                </div>
                <div style={{fontSize: 36, fontWeight: 'bold'}}>
                    {scores.myTotalScore}
                </div>
            </div>
            <div style={{padding: 15, display: "flex", flexDirection: 'column', justifyContent: 'space-between', borderStyle: 'solid', borderLeftWidth: 1, borderColor: 'black', borderTopRightRadius: 10, borderBottomRightRadius: 10, width: 140, backgroundColor: 'white', height: '100%'}}>
                <div style={{ borderBottomStyle: 'solid', borderBottomWidth: 1}}>
                    Player2 Name
                </div>
                <div style={{fontSize: 36, fontWeight: 'bold'}}>
                    {scores.otherPlayersTotalScores[0]}
                </div>
            </div>
        </div>
    )
}
