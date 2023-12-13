import {useSelector} from "react-redux";

export default function LetterBags() {
    const letterBags = useSelector( state => state.LetterBags);

    return (
        <div className="LetterBags">
        </div>
    )
}
