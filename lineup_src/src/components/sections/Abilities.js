import React from "react";
import '../../styles/components/Abilities.css';
import * as abilitiesImgs from '../../assets/img/abilities';

const Abilities = ({ globalState, setGlobalState }) => {

    const renderAbilities = (selectedAgent) => {
        if (selectedAgent) {
            return (
                <div>
                    {Object.keys(abilitiesImgs[selectedAgent]).map(abilityName => (
                        <img 
                            src={abilitiesImgs[selectedAgent][abilityName]} 
                            key={abilityName} 
                            alt={abilityName}
                            className={`Ability ${abilityName === globalState.selectedAbility ? 'Ability-active' : ''}`} 
                            onClick={() => {
                                setGlobalState({
                                    ...globalState,
                                    selectedAbility: abilityName === globalState.selectedAbility ? null : abilityName,
                                });
                            }}
                        />
                    ))}
                </div>
            );
        }
    }

    const { selectedAgent } = globalState;
    return (
        <div>
            {renderAbilities(selectedAgent)}
        </div>
    );
}

export default Abilities;