import { useEffect, useId, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import { map } from '../map/core/MapView';
import MapRoutePath from '../map/MapRoutePath';
import MapPositions from '../map/MapPositions';
import MapCamera from '../map/MapCamera';
import { usePanels } from '../common/util/floatingPanels';

const EMPTY = { type: 'FeatureCollection', features: [] };

// GeoJSON drawn by a panel: lines, polygons and points with the given colors
const MapGeoJson = ({ data, color }) => {
  const id = useId();
  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: `${id}-fill`, type: 'fill', source: id, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.15 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: 'line',
      source: id,
      filter: ['in', '$type', 'LineString', 'Polygon'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], color], 'line-width': ['coalesce', ['get', 'width'], 3], 'line-dasharray': [2, 1],
      },
    });
    map.addLayer({
      id: `${id}-points`,
      type: 'circle',
      source: id,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': ['coalesce', ['get', 'radius'], 5],
        'circle-color': ['coalesce', ['get', 'fill'], '#fff'],
        'circle-stroke-color': ['coalesce', ['get', 'color'], color],
        'circle-stroke-width': 2,
      },
    });
    return () => {
      [`${id}-points`, `${id}-line`, `${id}-fill`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);
  useEffect(() => {
    map.getSource(id)?.setData(data);
  }, [data]);
  return null;
};

const feature = (type, coordinates, properties = {}) => ({ type: 'Feature', geometry: { type, coordinates }, properties });

const ReplayLayer = ({ data }) => {
  const current = data.positions[Math.min(data.index, data.positions.length - 1)];
  const fit = useMemo(() => data.positions, [data.fit]);
  return (
    <>
      <MapRoutePath positions={data.positions} />
      {current && <MapPositions positions={[current]} titleField="fixTime" />}
      <MapCamera positions={fit} />
    </>
  );
};

const MeasureLayer = ({ data, color }) => {
  const geojson = useMemo(() => {
    const features = [];
    const { points, mode, real, off } = data;
    if (real?.length > 1) features.push(feature('LineString', real, { color: '#1565c0', width: 3 }));
    (off || []).forEach((point) => features.push(feature('Point', point, { color: '#c62828', fill: '#c62828', radius: 3 })));
    if (mode === 'area' && points.length > 2) {
      features.push(feature('Polygon', [[...points, points[0]]]));
    } else if (points.length > 1) {
      features.push(feature('LineString', points, mode === 'route' ? { color: '#2e7d32', width: 5 } : {}));
    }
    points.forEach((point) => features.push(feature('Point', point)));
    return { type: 'FeatureCollection', features };
  }, [data]);
  return <MapGeoJson data={geojson} color={color} />;
};

const NearestLayer = ({ data, color }) => {
  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: [
      ...data.targets.map((target) => feature('LineString', [data.point, target], { width: 2 })),
      feature('Point', data.point, { fill: color, radius: 8 }),
    ],
  }), [data]);
  return <MapGeoJson data={geojson} color={color} />;
};

// Map drawings of the open floating panels (quick replay route, measurements, planned route, nearest units); placed
// inside the main map so they are added once the map is ready
const PanelMapLayers = () => {
  const theme = useTheme();
  const panels = usePanels();
  return panels.filter((panel) => panel.data).map((panel) => {
    switch (panel.kind) {
      case 'replay':
        return <ReplayLayer key={panel.id} data={panel.data} />;
      case 'measure':
        return <MeasureLayer key={panel.id} data={panel.data} color={theme.palette.info.main} />;
      case 'nearest':
        return <NearestLayer key={panel.id} data={panel.data} color={theme.palette.primary.main} />;
      default:
        return null;
    }
  });
};

export default PanelMapLayers;
