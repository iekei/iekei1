import React from 'react';
import '../../styles/components/Maps.css';

const Maps = ({ globalState, setGlobalState }) => {

    const mapExistForAgent = (allData, selectedSource, selectedAgent, mapName) => {
        // console.log(allData[selectedSource][selectedAgent])
        return (mapName === 'any') || (selectedAgent && Object.keys(allData[selectedSource][selectedAgent]).includes(mapName));
    }

    const renderMap = (mapName) => {
        const { allData, selectedSource, selectedAgent, selectedMap } = globalState;
        const mapNameUpper = mapName[0].toUpperCase() + mapName.slice(1);
        const mapForAgentExists = mapExistForAgent(allData, selectedSource, selectedAgent, mapName);

        return (
            <div className={`Map ${selectedMap === mapName ? 'Map-active' : ''}`} key={'sm-' + mapName} onClick={() => {
                if (mapForAgentExists) {
                    setGlobalState({
                        ...globalState,
                        selectedMap: mapName !== selectedMap ? mapName : null,
                    });
                }
            }}>
                <span style={{ color: mapForAgentExists ? 'white' : 'grey' }}>{mapNameUpper}</span>
            </div>
        );
    }

    const { allMapNames } = globalState;

    return (
        <div className='MapList'>
            {console.log(allMapNames)}
            {allMapNames.map(mapName => renderMap(mapName))}
        </div>
    );
}

export default Maps;
