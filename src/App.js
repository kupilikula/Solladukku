import './App.css';
import GameFrame from './components/GameFrame';
import {validate as isValidUUID} from 'uuid';
import {useEffect, useRef} from "react";
import {useDispatch} from "react-redux";
import {addOtherPlayerTurn, storeUserId} from "./store/actions";

function App() {
    const dispatch = useDispatch();
    let userId;
    let cookieValue = document.cookie.replace(/(?:(?:^|.*;\s*)solladukku\s*=\s*([^;]*).*$)|^.*$/, "$1");
    console.log('cookieValue:', cookieValue);
    if (!isValidUUID(cookieValue)) {
        userId = crypto.randomUUID();
    } else {
        userId = cookieValue;
    }
    const WS_URL = "ws://localhost:8000" + '/' + userId;
    const ws = useRef(null);

    useEffect(() => {
        const wsCurrent = new WebSocket(WS_URL);
        // const wsCurrent = ws.current;
        wsCurrent.onopen = () => {
            console.log("ws opened");
        };

        wsCurrent.onclose = () => console.log("ws closed");

        wsCurrent.onmessage = e => {
            const message = JSON.parse(e.data);
            console.log("message", message);
            if (message.messageType==='turn') {
                dispatch(addOtherPlayerTurn(message.turnInfo));
            }
        };

        ws.current = wsCurrent;
    // , connection: wsCurrent
        console.log('wsCurrent: ', wsCurrent);
        console.log('ws.current: ', ws.current);
        // console.log('stringify: ', JSON.stringify(wsCurrent));
        dispatch(storeUserId({userId: userId}));

        return () => {
            wsCurrent.close();
        };
    }, []);

    return (
        <div style={{background: '#E6E6F0', height: '100vh', width: '100vw'}}>
            <GameFrame wsConnection={ws.current}/>
        </div>
    );
}

export default App;
