/* Technology image lookup.
 * ResearchIcons owns category and mapping resolution; this helper only exposes
 * the same local technology directory for other screens without overriding it.
 */
(function () {
  'use strict';
  const base = 'assets/technology';
  const normalize = value => String(value || '').replace(/^tech_/i, '').trim();
  const index = () => (typeof GameAssetData !== 'undefined' && Array.isArray(GameAssetData.technology))
    ? GameAssetData.technology
    : [];
  const find = id => {
    const wanted = normalize(id).toLowerCase();
    return index().find(file => file.replace(/\\.png$/i, '').toLowerCase() === wanted) || null;
  };
  const TechnologyAssets = {
    base,
    resolve(country, id) {
      const file = find(id);
      return { src: file ? `${base}/${file}` : `${base}/${encodeURIComponent(normalize(id))}.png`, file };
    },
    apply(image, country, id) {
      const asset = this.resolve(country, id);
      image.src = asset.src;
      return image;
    }
  };
  window.TechnologyAssets = TechnologyAssets;
})();
