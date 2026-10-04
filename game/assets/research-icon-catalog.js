/** Shared by the browser and the JSON converter. Only registered local PNGs resolve. */
const ResearchIconCatalog = {
  key(value) {
    return String(value || '').replace(/\\/g, '/').split('/').pop()
      .replace(/\.(png|dds|tga)$/i, '').toLowerCase().replace(/\s+/g, '_');
  },

  create(mappings) {
    const images = new Map();
    const aliases = new Map();
    for (const mapping of mappings) {
      for (const image of mapping?.images || []) {
        if (image.local && !images.has(this.key(image.key))) {
          images.set(this.key(image.key), { ...image, category: mapping.id });
        }
      }
      for (const [alias, key] of Object.entries(mapping?.aliases || {})) {
        aliases.set(this.key(alias), this.key(key));
      }
    }
    return {
      resolve: keys => {
        for (const candidate of keys.filter(Boolean)) {
          const key = this.key(candidate);
          const image = images.get(aliases.get(key) || key);
          if (image) return image;
        }
        return null;
      }
    };
  }
};
if (typeof module !== 'undefined') module.exports = ResearchIconCatalog;
if (typeof window !== 'undefined') window.ResearchIconCatalog = ResearchIconCatalog;
