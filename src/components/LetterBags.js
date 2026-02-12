import {useSelector} from "react-redux";
import {useLanguage} from "../context/LanguageContext";

export default function LetterBags() {
    const letterBags = useSelector(state => state.LetterBags);
    const { t } = useLanguage();

    // Calculate totals
    const consonantTotal = Object.values(letterBags.consonantsBag).reduce((sum, count) => sum + count, 0);
    const vowelTotal = Object.values(letterBags.vowelsBag).reduce((sum, count) => sum + count, 0);
    const bonusTotal = Object.values(letterBags.bonusBag).reduce((sum, count) => sum + count, 0);
    const grandTotal = consonantTotal + vowelTotal + bonusTotal;

    return (
        <div className="LetterBags" style={{
            padding: '15px 15px',
            marginTop: 10,
            borderTop: '1px solid #eee',
            borderBottom: '1px solid #eee',
        }}>
            <div style={{
                fontSize: 14,
                fontWeight: 'bold',
                marginBottom: 10,
                color: '#333',
            }}>
                {t.tilesRemaining}
            </div>
            <div style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 10,
            }}>
                <TileBagCount
                    tamilLabel="மெய்"
                    count={consonantTotal}
                    color="#B5D4E6"
                />
                <TileBagCount
                    tamilLabel="உயிர்"
                    count={vowelTotal}
                    color="#E8BAA8"
                />
                <TileBagCount
                    tamilLabel="மாயம்"
                    count={bonusTotal}
                    color="#F0DCA8"
                />
            </div>
            <div style={{
                marginTop: 10,
                textAlign: 'center',
                fontSize: 13,
                color: '#4f4f4f',
            }}>
                {t.total}: <strong>{grandTotal}</strong> {t.tiles}
            </div>
        </div>
    );
}

function TileBagCount({ tamilLabel, count, color }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 8,
            borderRadius: 6,
            backgroundColor: color,
            minWidth: 60,
        }}>
            <div style={{ fontSize: 13, fontFamily: 'Tamil Sangam MN', fontWeight: '500', color: '#333' }}>{tamilLabel}</div>
            <div style={{ fontSize: 18, fontWeight: 'bold' }}>{count}</div>
        </div>
    );
}
