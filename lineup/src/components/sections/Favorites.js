import React from 'react';
import '../../styles/components/Favorites.css';

const Favorites = ({ globalState, setGlobalState }) => {

    const renderFavorites = () => {
        const { selectedFavorite } = globalState;

        return (
            <div>
                <ul 
                    className={`ListElFav ${selectedFavorite === 'all' ? 'ListElFav-selected' : ''}`}
                    onClick={() => {
                        setGlobalState({
                            ...globalState,
                            selectedFavorite: 'all',
                        });
                    }}
                >
                    Show All
                </ul>

                <ul 
                    className={`ListElFav ${selectedFavorite === 'favorite' ? 'ListElFav-selected' : ''}`}
                    onClick={() => {
                        setGlobalState({
                            ...globalState,
                            selectedFavorite: selectedFavorite !== 'favorite' ? 'favorite' : 'all',
                        });
                    }}
                >
                    Favorites only
                </ul>
            </div>
        );
    }

    return (
        <div>
            {renderFavorites()}
        </div>
    );
}

export default Favorites;