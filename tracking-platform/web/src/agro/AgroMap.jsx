import { useEffect, useId } from 'react';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';

export const PASS_COLORS = ['#f2b8b5', '#4caf50', '#f4c430', '#e8590c'];

// Field outline, coverage by passes (0 = left without work, 1, 2, 3+) and the working track
const AgroMap = ({ work }) => {
  const id = useId();

  useEffect(() => {
    map.addSource(`${id}-coverage`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource(`${id}-lines`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-fill`,
      type: 'fill',
      source: `${id}-coverage`,
      paint: {
        'fill-color': ['match', ['get', 'passes'], 0, PASS_COLORS[0], 1, PASS_COLORS[1], 2, PASS_COLORS[2], PASS_COLORS[3]],
        'fill-opacity': ['match', ['get', 'passes'], 0, 0.55, 0.75],
        'fill-antialias': false,
      },
    });
    map.addLayer({
      id: `${id}-track`, type: 'line', source: `${id}-lines`, filter: ['==', 'kind', 'track'], paint: { 'line-color': '#1b3a1d', 'line-width': 1, 'line-opacity': 0.55 },
    });
    map.addLayer({
      id: `${id}-field`, type: 'line', source: `${id}-lines`, filter: ['==', 'kind', 'field'], paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 1] },
    });
    return () => {
      [`${id}-field`, `${id}-track`, `${id}-fill`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      [`${id}-coverage`, `${id}-lines`].forEach((source) => map.getSource(source) && map.removeSource(source));
    };
  }, []);

  useEffect(() => {
    if (!work) return undefined;
    map.getSource(`${id}-coverage`)?.setData(work.coverage);
    const lines = (work.tracks || []).map((track) => ({
      type: 'Feature', properties: { kind: 'track' }, geometry: { type: 'LineString', coordinates: track.map(([lat, lon]) => [lon, lat]) },
    }));
    if (work.fieldPolygon) {
      const ring = work.fieldPolygon.map(([lat, lon]) => [lon, lat]);
      lines.push({ type: 'Feature', properties: { kind: 'field' }, geometry: { type: 'LineString', coordinates: [...ring, ring[0]] } });
    }
    map.getSource(`${id}-lines`)?.setData({ type: 'FeatureCollection', features: lines });
    const points = work.fieldPolygon || (work.tracks || []).flat();
    if (!points.length) return undefined;
    const bounds = points.reduce((box, [lat, lon]) => box.extend([lon, lat]), new maplibregl.LngLatBounds([points[0][1], points[0][0]], [points[0][1], points[0][0]]));
    const timer = setTimeout(() => {
      map.resize();
      map.fitBounds(bounds, { padding: 40, maxZoom: 18, duration: 0 });
    }, 150);
    return () => clearTimeout(timer);
  }, [work]);

  return null;
};

export default AgroMap;
