import { useMemo } from 'react';
import MapView from '../../map/core/MapView';
import MapRouteCoordinates from '../../map/MapRouteCoordinates';
import MapMarkers from '../../map/MapMarkers';
import MapCamera from '../../map/MapCamera';
import MapScale from '../../map/MapScale';

// route of the period with the fills (green) and drains (red); zooms to the selected event
const FuelEventsMap = ({
  deviceId, points, events, selected,
}) => {
  const coordinates = useMemo(
    () => points.filter((point) => point.latitude || point.longitude).map((point) => [point.longitude, point.latitude]),
    [points],
  );
  const markers = useMemo(() => events
    .filter((event) => event.kind !== 'level')
    .map((event) => ({
      latitude: event.latitude,
      longitude: event.longitude,
      image: event.kind === 'fill' ? 'default-success' : 'default-error',
      title: event.title,
    })), [events]);
  const focus = events.find((event) => event.key === selected);

  return (
    <MapView>
      <MapRouteCoordinates name="" coordinates={coordinates} deviceId={deviceId} />
      <MapMarkers markers={markers} showTitles />
      <MapScale />
      {focus
        ? <MapCamera latitude={focus.latitude} longitude={focus.longitude} />
        : coordinates.length > 0 && <MapCamera coordinates={coordinates} />}
    </MapView>
  );
};

export default FuelEventsMap;
