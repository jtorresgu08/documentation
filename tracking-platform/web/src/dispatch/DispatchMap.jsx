import { useEffect, useId } from 'react';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import { findFonts } from '../map/core/mapUtil';
import { STOP_COLORS } from './dispatchUtils';

// Stops of a trip on the map (numbered and colored by status), the line in visiting order from the unit and the
// unit itself; fits the map when the trip changes
const DispatchMap = ({
  stops, position, fitKey, padding,
}) => {
  const id = useId();

  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-line`,
      type: 'line',
      source: id,
      filter: ['==', '$type', 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563c9', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [2, 1.5] },
    });
    map.addLayer({
      id: `${id}-stops`,
      type: 'circle',
      source: id,
      filter: ['==', 'kind', 'stop'],
      paint: {
        'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5,
      },
    });
    map.addLayer({
      id: `${id}-labels`,
      type: 'symbol',
      source: id,
      filter: ['==', 'kind', 'stop'],
      layout: {
        'text-field': ['get', 'label'], 'text-font': findFonts(map), 'text-size': 12, 'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });
    map.addLayer({
      id: `${id}-vehicle`,
      type: 'circle',
      source: id,
      filter: ['==', 'kind', 'vehicle'],
      paint: {
        'circle-radius': 9, 'circle-color': '#232a38', 'circle-stroke-color': '#9fe3e6', 'circle-stroke-width': 4,
      },
    });
    return () => {
      [`${id}-vehicle`, `${id}-labels`, `${id}-stops`, `${id}-line`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);

  useEffect(() => {
    const features = [];
    const vehicle = position ? [position.longitude, position.latitude] : null;
    const pending = stops.filter((stop) => stop.status === 'pending' || stop.status === 'arrived');
    const line = [...(vehicle ? [vehicle] : []), ...pending.map((stop) => [stop.longitude, stop.latitude])];
    if (line.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: {} });
    }
    stops.forEach((stop, index) => features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
      properties: {
        kind: 'stop', label: String(stop.sequence || index + 1), color: STOP_COLORS[stop.status || 'pending'],
      },
    }));
    if (vehicle) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: vehicle }, properties: { kind: 'vehicle' } });
    }
    map.getSource(id)?.setData({ type: 'FeatureCollection', features });
  }, [stops, position]);

  useEffect(() => {
    const points = [...stops.map((stop) => [stop.longitude, stop.latitude]), ...(position ? [[position.longitude, position.latitude]] : [])];
    if (points.length) {
      const bounds = points.reduce((box, item) => box.extend(item), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, {
        padding: padding || 60, maxZoom: 15, duration: 0,
      });
    }
  }, [fitKey]);

  return null;
};

export default DispatchMap;
