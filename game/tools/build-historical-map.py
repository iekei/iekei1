"""Build an explicitly approximate 1936-01 map from GPL historical-basemaps sources.
Run: python3 -m venv .venv; .venv/bin/pip install shapely; .venv/bin/python game/tools/build-historical-map.py
Sources and known limitations: game/data/maps/README.md.
"""
import json
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import make_valid

ROOT = Path(__file__).resolve().parents[1] / 'data/maps'
def load(year):
    return json.loads((ROOT / f'world-{year}.geojson').read_text())['features']
def geom(f):
    return make_valid(shape(f['geometry']))
old, base = load(1930), load(1938)
restored = ['Austria', 'Czechoslovakia', 'Ethiopia', 'Danzig']
restore = {name: unary_union([geom(f) for f in old if f['properties']['NAME'] == name]) for name in restored}
# Restore pre-Anschluss Austria and pre-Munich Czechoslovakia, independent Ethiopia.
cut = unary_union(list(restore.values()))
features = []
for f in base:
    name = f['properties']['NAME'] or 'Unknown'
    if name in ['Czechoslovakia', 'Ethiopia (Italy)']:
        continue
    g = geom(f).difference(cut)
    if not g.is_empty:
        features.append({'type': 'Feature', 'properties': {'name': name}, 'geometry': mapping(g)})
for name, g in restore.items():
    features.append({'type': 'Feature', 'properties': {'name': name}, 'geometry': mapping(g)})
# Manchukuo boundary is an approximation from the separately encoded Manchuria region.
manchuria = unary_union([geom(f) for f in old if f['properties']['NAME'] == 'Manchuria'])
if not manchuria.is_empty:
    for f in features:
        if f['properties']['name'] in ['Empire of Japan', 'Chinese warlords']:
            f['geometry'] = mapping(geom(f).difference(manchuria))
    features.append({'type': 'Feature', 'properties': {'name': 'Manchukuo'}, 'geometry': mapping(manchuria)})
tags = {'Germany':'GER','Empire of Japan':'JAP','USSR':'SOV','United Kingdom':'ENG','United States':'USA','France':'FRA','Italy':'ITA','Austria':'AUS','Czechoslovakia':'CZE','Poland':'POL','Turkey':'TUR','Egypt':'EGY','Chinese warlords':'CHI','Manchukuo':'MAN','British Raj':'RAJ','Spain':'SPA'}
for f in features:
    f['properties']['tag'] = tags.get(f['properties']['name'], '')
(ROOT/'world-1936.geojson').write_text(json.dumps({'type':'FeatureCollection','metadata':{'date':'1936-01-01','accuracy':'approximate reconstruction; see README.md','projection':'EPSG:4326'},'features':features},ensure_ascii=False,separators=(',',':')))
print(f'Built {len(features)} geographic country/coastline features')
