/** Equirectangular projection, WGS84 degrees -> shared SVG coordinates. */
export function project(lon, lat) { return { x: (lon + 180) * 1200 / 360, y: (90 - lat) * 640 / 180 }; }
export function kmToPixels(km) { return km / 111.32 * 1200 / 360; }
