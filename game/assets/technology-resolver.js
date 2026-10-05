(function () {
  'use strict';
  const TechnologyAssets = {
    base: 'assets/technology',
    country(country, id) {
      const tag = String(country || window.CoreEngine?.gameState?.country || 'generic').toUpperCase();
      const key = encodeURIComponent(id);
      return `${this.base}/${tag}/${key}.png`;
    },
    generic(id) { return `${this.base}/${encodeURIComponent(id)}.png`; },
    resolve(country, id) {
      const key = String(id || '').replace(/^tech_/, '');
      const countryPath = this.country(country, key);
      return { src: countryPath, fallback: `${this.base}/${encodeURIComponent(key)}.png` };
    },
    apply(image, country, id) {
      const asset = this.resolve(country, id);
      image.src = asset.src;
      image.onerror = () => { image.onerror = null; image.src = asset.fallback; };
      return image;
    }
  };
  window.TechnologyAssets = TechnologyAssets;
  if (window.ResearchIcons) {
    const original = window.ResearchIcons.resolve;
    window.ResearchIcons.resolve = function (tech, category) {
      const result = original ? original.call(this, tech, category) : { src: TechnologyAssets.generic(tech.id), key: tech.id, source: category };
      const country = window.CoreEngine?.gameState?.country;
      const paths = TechnologyAssets.resolve(country, tech.id);
      return { ...result, src: paths.src, github: paths.fallback, key: tech.id };
    };
  }
})();
