import ScoreBoard from "./ScoreBoard";
import LetterBags from "./LetterBags";
import TurnHistory from "./TurnHistory";
import ConnectionStatus from "./ConnectionStatus";
import Chat from "./Chat";
import {useLanguage} from "../context/LanguageContext";

export default function InfoBoard() {
    const { language, toggleLanguage } = useLanguage();

    return (
        <div className="InfoBoard" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            borderRadius: 10,
            width: 300,
            backgroundColor: 'white',
            margin: 20,
            marginLeft: 0,
            overflow: 'hidden',
            alignSelf: 'stretch',
            maxHeight: 'calc(100vh - 40px)',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '6px 10px 0 10px',
            }}>
                <button
                    onClick={toggleLanguage}
                    style={{
                        background: 'none',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        width: 28,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        cursor: 'pointer',
                        color: '#666',
                        fontFamily: 'Tamil Sangam MN, sans-serif',
                        padding: 0,
                        lineHeight: 1,
                    }}
                >
                    {language === 'ta' ? 'EN' : 'த'}
                </button>
            </div>
            <ConnectionStatus />
            <ScoreBoard />
            <LetterBags />
            <TurnHistory />
            <Chat />
        </div>
    )
}
