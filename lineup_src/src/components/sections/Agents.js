import React from "react";
import "../../styles/components/Agents.css";
import * as agentImgs from '../../assets/img/agents';

const Agents = ({ globalState, setGlobalState }) => {

    const onAgentClick = (selectedAgent) => {
        setGlobalState({
            ...globalState,
            selectedAgent,
            selectedMap: 'any',
            selectedAbility: null,
            selectedSide: 'all',
        });
    }

    const renderAgent = (agentName, selected) => {
        return (
            <div 
                onClick={() => { onAgentClick(selected ? null : agentName)}} 
                className={`Agent ${selected ? 'Agent-active' : ''}`} 
                key={agentName}>
                <img src={agentImgs[agentName]} alt={agentName} />
            </div> 
        );
    }

    const { allData, selectedSource, selectedAgent } = globalState;

    return (
        <div>
            {Object.keys(allData[selectedSource] || {}).map(agentName => renderAgent(agentName, agentName === selectedAgent))}
        </div>
    );
}

export default Agents;
