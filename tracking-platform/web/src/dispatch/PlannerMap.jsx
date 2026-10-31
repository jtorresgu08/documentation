import { useEffect, useId } from 'react';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import { findFonts } from '../map/core/mapUtil';

// orders and planned routes (one color per vehicle), the depot and the stop numbers
const PlannerMap = ({ orders, routes, depot, colors }) => {
  const id = useId();

  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-lines`, type: 'line', source: id, filter: ['==', '$type', 'LineString'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.75 },
    });
    map.addLayer({
      id: `${id}-points`, type: 'circle', source: id, filter: ['==', 'kind', 'order'], paint: { 'circle-radius': ['case', ['get', 'planned'], 11, 7], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });
    map.addLayer({
      id: `${id}-labels`, type: 'symbol', source: id, filter: ['==', 'kind', 'order'], layout: { 'text-field': ['get', 'label'], 'text-font': findFonts(map), 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#fff' },
    });
    map.addLayer({
      id: `${id}-depot`, type: 'circle', source: id, filter: ['==', 'kind', 'depot'], paint: { 'circle-radius': 10, 'circle-color': '#232a38', 'circle-stroke-color': '#ffd166', 'circle-stroke-width': 4 },
    });
    return () => {
      [`${id}-depot`, `${id}-labels`, `${id}-points`, `${id}-lines`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);

  useEffect(() => {
    const byId = Object.fromEntries(orders.map((order) => [order.id, order]));
    const features = [];
    const planned = {};
    routes.forEach((route, index) => {
      const color = colors[index % colors.length];
      const start = [route.startPoint[1], route.startPoint[0]];
      const line = [start, ...route.orderIds.map((orderId) => [byId[orderId]?.longitude, byId[orderId]?.latitude]).filter((point) => point[0] !== undefined)];
      if (route.returnToDepot) line.push(start);
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { color } });
      route.orderIds.forEach((orderId, position) => { planned[orderId] = { color, label: String(position + 1) }; });
    });
    orders.forEach((order) => features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [order.longitude, order.latitude] },
      properties: {
        kind: 'order', color: planned[order.id]?.color || '#9aa3b2', label: planned[order.id]?.label || '', planned: !!planned[order.id],
      },
    }));
    if (depot) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [depot.longitude, depot.latitude] }, properties: { kind: 'depot' } });
    map.getSource(id)?.setData({ type: 'FeatureCollection', features });
  }, [orders, routes, depot]);

  useEffect(() => {
    const points = [...orders.map((order) => [order.longitude, order.latitude]), ...(depot ? [[depot.longitude, depot.latitude]] : [])];
    if (points.length) {
      const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [orders.length, depot?.id]);

  return null;
};

export default PlannerMap;
