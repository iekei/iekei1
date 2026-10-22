# Historical map data / attribution

Source: **Historical Basemaps**, curated by **André Ourednik** and contributors.
https://github.com/aourednik/historical-basemaps
Upstream revision at retrieval: `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`.
Files `world-1930.geojson` and `world-1938.geojson` are the corresponding upstream source files. License: GNU GPL v3, included as `LICENSE-GPL-3.0.txt`. Derived `world-1936.geojson` is distributed under that same license. Sources, transformation script and modifications are included here.

## Reconstruction and accuracy

This is **an approximate reconstruction for 1936-01-01**, not an authoritative or fully verified historical atlas. Real WGS84 coastlines and country polygons replace the old schematic city Voronoi regions.

`game/tools/build-historical-map.py` takes the 1938 source, restores Austria, Czechoslovakia, Ethiopia and Danzig using the 1930 polygons, subtracting their area from the remaining 1938 features. It introduces an approximate Manchukuo region from the 1930 Manchuria shape. The resulting dates are explicitly recorded in metadata. The source has temporal inconsistencies and generalized boundaries, especially in China, colonial territories and the Middle East; this conversion does not certify or fully repair them. The 1930 Manchuria extent is not a verified 1936 Manchukuo boundary. Province-level historical administrative boundaries are not included: only real country outlines and existing gameplay city nodes are shown. No fictitious Voronoi province boundaries remain.

Projection: equirectangular, x=(longitude+180)*1200/360, y=(90-latitude)*640/180. Shared by country polygons, city/base nodes, air/naval regions and range overlays. Range circles are still an approximate projected visualization, not geodesic circles. Gameplay adjacency remains the existing simplified graph, not historical transport routes. Initial colors group major countries; not every colonial dependency has yet been assigned its parent-country game tag. Country polygons are not dynamically split when city ownership changes.

Build: `.venv/bin/pip install shapely` then `.venv/bin/python game/tools/build-historical-map.py` (Python 3, Shapely 2).
