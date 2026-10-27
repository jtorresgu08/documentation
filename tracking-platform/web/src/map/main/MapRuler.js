import { useEffect, useId, useState } from 'react';
import { map } from '../core/MapView';

const EMPTY = { type: 'FeatureCollection', features: [] };

const distanceKm = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Measures a path drawn by clicking on the map while active
const MapRuler = ({ active, color, onDistance }) => {
  const id = useId();
  const [points, setPoints] = useState([]);

  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: `${id}-line`,
      type: 'line',
      source: id,
      filter: ['==', '$type', 'LineString'],
      paint: { 'line-color': color, 'line-width': 3, 'line-dasharray': [2, 1] },
    });
    map.addLayer({
      id: `${id}-points`,
      type: 'circle',
      source: id,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-color': color, 'circle-stroke-width': 2,
      },
    });
    return () => {
      [`${id}-points`, `${id}-line`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setPoints([]);
      return undefined;
    }
    const onClick = (event) => {
      event.preventDefault();
      setPoints((current) => [...current, [event.lngLat.lng, event.lngLat.lat]]);
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [active]);

  useEffect(() => {
    const features = points.map((coordinates) => ({ type: 'Feature', geometry: { type: 'Point', coordinates } }));
    if (points.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: points } });
    }
    map.getSource(id)?.setData({ type: 'FeatureCollection', features });
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distanceKm(points[i - 1], points[i]);
    }
    onDistance(points.length ? total : null);
  }, [points]);

  return null;
};

export default MapRuler;
