import React from "react";
import { cancel } from '../../assets/img';
import '../../styles/components/Popup.css';
// import * as abilitiesImgs from './img/abilities';

const Popup = ({ popupData, closePopup, globalState }) => {
    // The async function post is commented out as per the original code.

    // const post = async (key, value, videoId) => {
    //     try {
    //         const myHeaders = new Headers();
    //         myHeaders.append("Content-Type", "application/json");
    
    //         const saveRes_raw = await fetch("http://localhost:3002/setAdditionalData", {
    //             method: "POST",
    //             headers: myHeaders,
    //             body: JSON.stringify({
    //                 source: globalState.selectedSource,
    //                 agent: globalState.selectedAgent,
    //                 map: globalState.selectedMap,
    //                 videoUrl: videoId,
    //                 key,
    //                 value,
    //             }),
    //             redirect: "follow",
    //         });
    //         const saveRes = await saveRes_raw.json();
    //         console.log(saveRes);
    //     } 
    //     catch (error) {
    //         console.error(error);
    //     }
    // }

    const renderVideo = (videoId, videoTitle) => {
        return (
            <>
                <h3 className="videoTitle">{videoTitle}</h3>
                <iframe 
                    title={videoTitle}
                    className="videoFrame"
                    src={'https://iframe.videodelivery.net/'+videoId}
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                ></iframe>
                {/* The code below is commented out as per the original code.
                <div>
                    <p>Ability:</p>
                    {Object.keys(abilitiesImgs[globalState.selectedAgent]).map(abilityName => (
                        <img onClick={() => post('ability', abilityName, videoId)} width="40px" src={abilitiesImgs[globalState.selectedAgent][abilityName]} alt={abilityName} />
                    ))}
                </div>
                <br />
                <div>
                    <p>Side:</p>
                    {['attack', 'defence', 'both'].map(side => (
                        <p onClick={() => post('side', side, videoId)}>{side}</p>
                    ))}
                </div>
                */}
            </>
        );
    }

    return (
        popupData === null ? null : (
            <div onClick={closePopup} id="popupWrapper">
                <div id="popup">
                    <img
                        className="popupClose"
                        src={cancel}
                        onClick={closePopup}
                        alt="close"
                    />
                    {renderVideo(popupData.videoUrl, popupData.title)}
                </div>
            </div>
        )
    );
}

export default Popup;