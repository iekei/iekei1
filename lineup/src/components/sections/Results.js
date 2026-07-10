import React from "react";
import "../../styles/components/Results.css";
import { bookmark, bookmark_filled } from '../../assets/img';
import * as abilityIcons from '../../assets/img/abilities';

const Results = ({ globalState, openPopup, addFavorite, removeFavorite }) => {

    const renderVideoBlock = (data) => {
        if (data.hide) {
            return <div key={data.key} className="imgBlocks"></div>;
        }

        const isFavorite = globalState.favorites[data.videoUrl];

        return (
            <div key={data.videoUrl} className="imgBlocks">
                <img onClick={() => openPopup(data)} className="imgPreviewBlock" src={data.previewImageUrl} alt='img preview' />
                {data.ability && <img className="lineup-ability" src={abilityIcons[globalState.selectedAgent][data.ability]} alt='lineup-ability' />}
                <div className="imgBlocksBottom">
                    <span onClick={() => openPopup(data)} className="lineup-title">{data.title}</span>
                    <img
                        className={`bookmark-icon ${isFavorite ? 'bookmark-icon-selected' : ''}`}
                        src={isFavorite ? bookmark_filled : bookmark}
                        onClick={() => {
                            if (!isFavorite) { addFavorite(data.videoUrl); }
                            else { removeFavorite(data.videoUrl); }
                        }}
                        alt='bookmark-icon'
                    />
                </div>
            </div>
        );
    };

    const {
        allData,
        selectedSource,
        selectedAgent,
        selectedMap,
        selectedAbility,
        selectedSide,
        selectedFavorite,
        favorites,
    } = globalState;

    let dataToRender = [];

    if (selectedMap === 'any' && selectedAgent) {
        for (const mapName of Object.keys(allData[selectedSource][selectedAgent])) {
            for (const [videoUrl, videoData] of Object.entries(allData[selectedSource][selectedAgent][mapName])) {
                dataToRender.push({
                    ...videoData,
                    videoUrl,
                    mapName,
                });
            }
        }
    } else if (selectedAgent && selectedMap) {
        for (const [videoUrl, videoData] of Object.entries(allData[selectedSource][selectedAgent][selectedMap])) {
            dataToRender.push({
                ...videoData,
                videoUrl,
                mapName: selectedMap,
            });
        }
    }

    dataToRender = dataToRender
        .filter(d => !selectedAbility || d.ability === selectedAbility)
        .filter(d => selectedSide === 'all' || d.side === selectedSide)
        .filter(d => selectedFavorite === 'all' || d.videoUrl in favorites)
        .sort((a, b) => b.score - a);

    if (dataToRender.length % 3 !== 0) {
        for (let i = 0; i < dataToRender.length % 3; i++) {
            dataToRender.push({ hide: true, key: `hide-${i}` });
        }
    }

    return (
        <>
            <h3>Found {dataToRender.length} results</h3>
            <div className="Results-Block">
                {dataToRender.map(data => renderVideoBlock(data))}
            </div>
        </>
    );
};

export default Results;
