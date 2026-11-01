import { useEffect, useId } from 'react';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import { findFonts } from '../map/core/mapUtil';

// path of the line, its stops and the buses with their names (selected one highlighted)
const TransitMap = ({
  path, stops, units, color, selectedId, fitKey,
}) => {
  const id = useId();

  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-path`, type: 'line', source: id, filter: ['==', 'kind', 'path'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.8 },
    });
    map.addLayer({
      id: `${id}-stops`, type: 'circle', source: id, filter: ['==', 'kind', 'stop'], paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 },
    });
    map.addLayer({
      id: `${id}-buses`, type: 'circle', source: id, filter: ['==', 'kind', 'bus'], paint: { 'circle-radius': ['case', ['get', 'selected'], 11, 9], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
    });
    map.addLayer({
      id: `${id}-labels`, type: 'symbol', source: id, filter: ['==', 'kind', 'bus'], layout: { 'text-field': ['get', 'name'], 'text-font': findFonts(map), 'text-size': 11, 'text-offset': [0, -1.6], 'text-allow-overlap': true }, paint: { 'text-color': '#232a38', 'text-halo-color': '#fff', 'text-halo-width': 2 },
    });
    return () => {
      [`${id}-labels`, `${id}-buses`, `${id}-stops`, `${id}-path`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);

  useEffect(() => {
    const line = path.length > 1 ? path : stops.map((stop) => [stop.latitude, stop.longitude]);
    const features = [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: line.map(([lat, lon]) => [lon, lat]) }, properties: { kind: 'path', color } },
      ...stops.map((stop) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] }, properties: { kind: 'stop', color } })),
      ...units.filter((unit) => unit.latitude !== undefined).map((unit) => {
        let busColor = '#2f9e5b';
        if (!unit.active) busColor = '#8a93a3';
        else if (unit.offRoute) busColor = '#d9534f';
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [unit.longitude, unit.latitude] },
          properties: {
            kind: 'bus', name: unit.name, color: busColor, selected: unit.deviceId === selectedId,
          },
        };
      }),
    ];
    map.getSource(id)?.setData({ type: 'FeatureCollection', features });
  }, [path, stops, units, selectedId, color]);

  useEffect(() => {
    const points = (path.length > 1 ? path : stops.map((stop) => [stop.latitude, stop.longitude])).map(([lat, lon]) => [lon, lat]);
    if (!points.length) return undefined;
    const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
    // the shared map is moved into this card, so measure it again before fitting the line
    const timer = setTimeout(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
    }, 150);
    return () => clearTimeout(timer);
  }, [fitKey]);

  return null;
};

export default TransitMap;
