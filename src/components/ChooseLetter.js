import {useDispatch, useSelector} from "react-redux";
import {Vowels, MarkedConsonants, TileMethods} from "../utils/TileSet";
import {useState} from "react";
import Select from "react-select";
import {FaCheck, FaRegWindowClose} from "react-icons/fa";
import {bonusTileLetterSelected} from "../store/actions";
export default function ChooseLetter(props) {
    const dispatch = useDispatch();
    const vowels =['-'].concat(Vowels).map(v => ({label: v, value: v}));
    const defaultVowel = vowels[0];
    const [selectedVowel, setSelectedVowel] = useState(vowels[0]);

    const consonants =['-'].concat(MarkedConsonants).map(c => ({label: c, value: c}));
    const defaultConsonant = consonants[0];
    const [selectedConsonant, setSelectedConsonant] = useState(consonants[0]);
    const selectedLetter = TileMethods.joinMeyAndUyirLetters(selectedConsonant.value, selectedVowel.value);

    function onSelectVowel(e) {
        console.log('e:', e);
        setSelectedVowel(e);
    }
    function onSelectConsonant(e) {
        console.log('e:', e);
        setSelectedConsonant(e);
    }


    function acceptLetterChoice(e) {
        console.log(e);
        dispatch(bonusTileLetterSelected({selectedLetter: selectedLetter, location: props.location}));
        props.modalCloser();
    }

    return (
        <div className="ChooseLetter">
            <div className={'ChooseLetterRow'} >
                <div>மெய்: </div>
                <Select styles={{control: (baseStyles, state) => ({
                        ...baseStyles,
                        width: "90px",
                        height: "40px",
                        borderColor: '#9e9e9e',
                    }),
                    // valueContainer: (baseStyles, state) => ({
                    //     ...baseStyles,
                    //     minHeight: "31px",
                    // }),
                    // input: (baseStyles, state) => ({
                    //     ...baseStyles,
                    //     minHeight: "23px",
                    //     verticalAlign: "middle",
                    // }),
                }} options={consonants} onChange={(e) => onSelectConsonant(e)} value={selectedConsonant}/>
            </div>
            <div className={'ChooseLetterRow'}>
                <div>உயிர்:</div>
                <Select styles={{control: (baseStyles, state) => ({
                    ...baseStyles,
                        width: "90px",
                        height: "40px",
                        borderColor: '#9e9e9e',
                }),
                    // valueContainer: (baseStyles, state) => ({
                    //     ...baseStyles,
                    //     // minHeight: "31px",
                    // }),
                    // input: (baseStyles, state) => ({
                    //     ...baseStyles,
                    //     // minHeight: "23px",
                    //     verticalAlign: "middle",
                    // }),
                }} options={vowels} onChange={(e) => onSelectVowel(e)} value={selectedVowel}/>
            </div>
            <div className={'ChooseLetterRow'}>
                <div>எழுத்து:</div>
                <div style={{width: "90px", textAlign: "center", fontSize: "20px", fontWeight: "bold"}}>{selectedLetter}</div>
            </div>
            <button id={'ChooseLetterButton'} onClick={(e) => acceptLetterChoice(e)}> <FaCheck size={24} style={{margin: "auto"}}/></button>
            <div id={'CloseChooseLetter'} onClick={ () => {props.modalCloser();}}><FaRegWindowClose size={24}/></div>
        </div>
    )
}
