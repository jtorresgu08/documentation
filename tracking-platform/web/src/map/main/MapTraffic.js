import { useEffect, useId } from 'react';
import { map } from '../core/MapView';

// traffic over the map from the first provider with a key (Google, TomTom or HERE), above the base map
const MapTraffic = ({ overlay }) => {
  const id = useId();

  useEffect(() => {
    if (!overlay) return undefined;
    map.addSource(id, overlay.source);
    map.addLayer({
      id, type: 'raster', source: id, paint: { 'raster-opacity': 0.9 },
    });
    return () => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [id, overlay?.id]);

  return null;
};

export default MapTraffic;
