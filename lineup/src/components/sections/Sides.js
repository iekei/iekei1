import React from 'react';
import '../../styles/components/Sides.css';

const Sides = ({ globalState, setGlobalState }) => {
    const renderSide = () => {
        const { selectedSide } = globalState;
        return (
            <div>
                <ul 
                    className={`ListEl ${selectedSide === 'all' ? 'ListEl-selected' : ''}`}
                    onClick={() => {
                        setGlobalState({
                            ...globalState,
                            selectedSide: 'all',
                        });
                    }}
                >
                    All
                </ul>

                <ul 
                    className={`ListEl ${selectedSide === 'attack' ? 'ListEl-selected' : ''}`}
                    onClick={() => {
                        setGlobalState({
                            ...globalState,
                            selectedSide: selectedSide !== 'attack' ? 'attack' : 'all',
                        });
                    }}
                >
                    Attack
                </ul>

                <ul 
                    className={`ListEl ${selectedSide === 'defence' ? 'ListEl-selected' : ''}`}
                    onClick={() => {
                        setGlobalState({
                            ...globalState,
                            selectedSide: selectedSide !== 'defence' ? 'defence' : 'all',
                        });
                    }}
                >
                    Defence
                </ul>
            </div>
        );
    }

    return (
        <div>
            {renderSide()}
        </div>
    );
}

export default Sides;