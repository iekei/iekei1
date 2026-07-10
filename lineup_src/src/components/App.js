import React, { useState, useEffect } from "react";
import axios from "axios";
import Filter from './sections/Filter';
import Popup from "./sections/Popup";
import Results from './sections/Results';

const App = () => {
  const [globalState, setGlobalState] = useState({
    selectedSource: 'trackerGG',
    allData: {},
    allMapNames: [],
    abilities: {},
    favorites: JSON.parse(localStorage.getItem('favorites') || '{}'),
    popupData: null,
    selectedMap: 'any',
    selectedAgent: null,
    selectedAbility: null,
    selectedSide: 'all',
    selectedFavorite: 'all',
  });

  useEffect(() => {
    const fetchData = async () => {
      const [lineupsRes, mapNamesRes, abilitiesRes] = await Promise.all([
        axios("https://valo-lineup-server.onrender.com/lineups"),
        axios("https://valo-lineup-server.onrender.com/mapNames"),
        axios("https://valo-lineup-server.onrender.com/abilities"),
      ]);
      setGlobalState(prevState => ({
        ...prevState,
        allData: lineupsRes.data,
        allMapNames: mapNamesRes.data,
        abilities: abilitiesRes.data,
      }));
    };

    fetchData();
  }, []);

  const addFavorite = (videoID) => {
    const favorites = { ...globalState.favorites, [videoID]: true };
    setGlobalState(prevState => ({ ...prevState, favorites }));
    localStorage.setItem('favorites', JSON.stringify(favorites));
  };

  const removeFavorite = (videoID) => {
    const favorites = { ...globalState.favorites };
    delete favorites[videoID];
    setGlobalState(prevState => ({ ...prevState, favorites }));
    localStorage.setItem('favorites', JSON.stringify(favorites));
  };

  const openPopup = (data) => {
    setGlobalState(prevState => ({ ...prevState, popupData: data }));
  };

  const closePopup = () => {
    setGlobalState(prevState => ({ ...prevState, popupData: null }));
  };

  return (
    <>
      <Filter globalState={globalState} setGlobalState={setGlobalState} />
      <Results 
        globalState={globalState} 
        setGlobalState={setGlobalState}
        openPopup={openPopup}
        addFavorite={addFavorite}
        removeFavorite={removeFavorite}
      />
      <Popup 
        globalState={globalState}
        popupData={globalState.popupData} 
        closePopup={closePopup}
      />
    </>
  );
}

export default App;
