import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

// Own maps of SAFE CONNECTION: one PMTiles file with Latin America served by the same web server (/maps), drawn
// with the Protomaps styles in Spanish; fonts and icons also local. Without the file the platform uses OpenFreeMap.
export const OWN_MAP_PATH = '/maps/latam.pmtiles';

maplibregl.addProtocol('pmtiles', new Protocol({ metadata: true }).tile);

export const ownMapStyle = (flavor) => {
  const origin = window.location.origin;
  return {
    version: 8,
    glyphs: `${origin}/maps/assets/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/maps/assets/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${origin}${OWN_MAP_PATH}`,
        attribution: '<a href="https://openstreetmap.org/copyright">© OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a> · Safe Connection',
      },
    },
    layers: layers('protomaps', namedFlavor(flavor), { lang: 'es' }),
  };
};

let availability;

// whether the own map file is installed (checked once per page load)
export const checkOwnMaps = () => {
  if (!availability) {
    availability = fetch(OWN_MAP_PATH, { method: 'HEAD' })
      .then((response) => response.ok && !(response.headers.get('content-type') || '').includes('text/html'))
      .catch(() => false);
  }
  return availability;
};
