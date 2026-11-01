import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import MapView from '../map/core/MapView';
import MapSelectedDevice from '../map/main/MapSelectedDevice';
import MapAccuracy from '../map/main/MapAccuracy';
import MapGeofence from '../map/MapGeofence';
import MapCurrentLocation from '../map/MapCurrentLocation';
import PoiMap from '../map/main/PoiMap';
import MapPadding from '../map/MapPadding';
import { devicesActions } from '../store';
import { publishMapFollow } from '../common/util/mapFollow';
import MapDefaultCamera from '../map/main/MapDefaultCamera';
import MapLiveRoutes from '../map/main/MapLiveRoutes';
import MapPositions from '../map/MapPositions';
import MapOverlay from '../map/overlay/MapOverlay';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import MapScale from '../map/MapScale';
import MapNotification from '../map/notification/MapNotification';
import useFeatures from '../common/util/useFeatures';
import usePersistedState from '../common/util/usePersistedState';
import { useAttributePreference } from '../common/util/preferences';
import { map } from '../map/core/MapView';
import MapToolbar from '../map/main/MapToolbar';
import MapTraffic from '../map/main/MapTraffic';
import useMapOverlays from '../map/overlay/useMapOverlays';
import { Snackbar } from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';
import MapRuler from '../map/main/MapRuler';
import PanelMapLayers from '../panels/PanelMapLayers';
import PanelLauncher from '../panels/PanelLauncher';

const MainMap = ({ filteredPositions, selectedPosition, onEventsClick }) => {
  const theme = useTheme();
  const dispatch = useDispatch();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const eventsAvailable = useSelector((state) => !!state.events.items.length);

  const features = useFeatures();

  const onMarkerClick = useCallback((_, deviceId) => {
    dispatch(devicesActions.selectId(deviceId));
  }, [dispatch]);

  const geofencesPreference = useAttributePreference('mapGeofences', true);
  const clusterPreference = useAttributePreference('mapCluster', true);
  const followPreference = useAttributePreference('mapFollow', false);
  const [toolValues, setToolValues] = usePersistedState('mapTools', {});
  const [ruler, setRuler] = useState(false);
  const [distance, setDistance] = useState(null);
  const [trafficHint, setTrafficHint] = useState(false);
  const t = useTranslation();
  const overlays = useMapOverlays();
  const trafficOverlay = ['googleTraffic', 'tomTomFlow', 'hereFlow'].map((key) => overlays.find((overlay) => overlay.id === key && overlay.available)).find(Boolean);

  const values = {
    geofences: toolValues.geofences ?? geofencesPreference,
    labels: toolValues.labels ?? true,
    cluster: toolValues.cluster ?? clusterPreference,
    follow: toolValues.follow ?? followPreference,
    ruler,
    traffic: Boolean(toolValues.traffic && trafficOverlay),
  };

  const fitAll = () => {
    if (filteredPositions.length) {
      const lons = filteredPositions.map((it) => it.longitude);
      const lats = filteredPositions.map((it) => it.latitude);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {
        padding: { top: 60, bottom: 60, left: desktop ? 420 : 40, right: 80 },
        maxZoom: 15,
      });
    }
  };

  useEffect(() => {
    publishMapFollow(values.follow, () => setToolValues((current) => ({ ...current, follow: !values.follow })));
    return () => publishMapFollow(false, null);
  }, [values.follow]);

  const tools = {
    values,
    toggle: (key) => {
      if (key === 'fit') {
        fitAll();
      } else if (key === 'fullscreen') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen?.();
        }
      } else if (key === 'ruler') {
        setRuler(!ruler);
      } else if (key === 'traffic' && !trafficOverlay) {
        setTrafficHint(true);
      } else {
        setToolValues({ ...toolValues, [key]: !values[key] });
      }
    },
  };

  return (
    <>
      <MapView>
        <MapOverlay />
        {values.traffic && <MapTraffic overlay={trafficOverlay} />}
        {values.geofences && <MapGeofence />}
        <MapAccuracy positions={filteredPositions} />
        <MapLiveRoutes />
        <MapPositions
          positions={filteredPositions}
          onMarkerClick={onMarkerClick}
          selectedPosition={selectedPosition}
          showStatus
          liveStatus
          titleField="label"
          cluster={values.cluster}
          showTitles={values.labels}
        />
        <MapDefaultCamera />
        <MapSelectedDevice follow={values.follow} />
        <MapRuler active={ruler} color={theme.palette.primary.main} onDistance={setDistance} />
        <PoiMap />
        <PanelMapLayers />
      </MapView>
      <PanelLauncher />
      <MapToolbar tools={tools} distance={ruler ? (distance ?? 0) : null} />
      <MapScale />
      <Snackbar open={trafficHint} autoHideDuration={8000} onClose={() => setTrafficHint(false)} message={t('mapTrafficHint')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
      <MapCurrentLocation />
      <MapGeocoder />
      {!features.disableEvents && (
        <MapNotification enabled={eventsAvailable} onClick={onEventsClick} />
      )}
      {desktop && (
        <MapPadding start={parseInt(theme.dimensions.deviceListWidth, 10) + parseInt(theme.spacing(1.5), 10)} />
      )}
    </>
  );
};

export default MainMap;
