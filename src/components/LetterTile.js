import '../styles/Styles.css';
import {useDrag, useDrop} from "react-dnd";
import {useState} from "react";
import {useDispatch} from "react-redux";
import {
    mergeTiles,
    moveTileOnRack,
    placeTileOnRackFromBoard, splitUyirMeyTile, toggleActivatedOfTile,
    toggleActivatedOfTileOnBoard,
    toggleActivatedOfTileOnRack
} from "../store/actions";
import constants from "../utils/constants";
import {ReactFitty} from "react-fitty";
import ChooseLetter from "./ChooseLetter";

export default function LetterTile(props) {

    const dispatch = useDispatch();
    // const [showBonusTileChooseLetter, setShowBonusTileChooseLetter]= useState(false);
    const {enableModals = true} = props;
    const showBonusTileChooseLetter = props.tile.activated && props.tile.letterType===constants.LetterTile.letterType.BONUS && enableModals;

    const onDoubleClick = () => {
        // setActivated(!activated);
        const isAlreadyActivated = props.tile.activated;
        if (!props.played) {
            dispatch(toggleActivatedOfTile({location: props.location}));
        }
        if (props.tile.letterType===constants.LetterTile.letterType.UYIRMEY && !isAlreadyActivated) {
            setTimeout( () => {
                dispatch(splitUyirMeyTile({tile: props.tile, location: props.location}));
            }, 770);
        }
    };

    const [{ isDragging }, drag] = useDrag(() => {
            return ({
                type: 'TILE',
                item: {tile: props.tile, origin: props.location},
                collect: (monitor) => ({
                    isDragging: !!monitor.isDragging()
                }),
                canDrag: () => !props.played,
            });
        }
    ,[props.tile, props.location]);

    return (
        <div style={{position: "relative"}} >
        {
    !isDragging &&
    <div style={{userSelect: "none"}} ref={drag} onDoubleClick={onDoubleClick} className={`LetterTile ${props.tile.letterType} ${props.played ? 'Played' : 'Unplayed'} ${props.location.host} ${props.tile.activated ? 'activated' : ''} `}>
        <ReactFitty maxSize={20}>{props.tile.letter}</ReactFitty>
        <span className={'Points'}>{props.tile.points}</span>
    </div>
    }
            {showBonusTileChooseLetter ? <ChooseLetter location={props.location} modalCloser={ () => { dispatch(toggleActivatedOfTile({location: props.location}));}}/> : null}

        </div>
    )
}
