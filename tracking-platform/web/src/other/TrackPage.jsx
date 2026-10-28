import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, Box, Card, LinearProgress, Stack, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import FlagIcon from '@mui/icons-material/Flag';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SpeedIcon from '@mui/icons-material/Speed';
import dayjs from 'dayjs';
import MapView, { map } from '../map/core/MapView';
import MapMarkers from '../map/MapMarkers';
import { mapIconKey } from '../map/core/preloadImages';
import { sessionActions } from '../store';
import useQuery from '../common/util/useQuery';
import { useBrandAttribute } from '../common/util/brand';
import { useTranslation } from '../common/components/LocalizationProvider';

const REFRESH = 10000;
const ROAD_FACTOR = 1.25;
const DEFAULT_SPEED = 35;

// fit the unit and the destination above the bottom card
const TrackCamera = ({ coordinates }) => {
  useEffect(() => {
    const lons = coordinates.map((item) => item[0]);
    const lats = coordinates.map((item) => item[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {
      padding: {
        top: 70, bottom: 280, left: 50, right: 70,
      },
      maxZoom: 15,
      duration: 0,
    });
  }, [coordinates]);
  return null;
};

const distanceKm = (lat1, lon1, lat2, lon2) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
};

// Public tracking page for a shared unit (delivery, cargo): live position, destination and estimated arrival.
// Opened with a share token; the destination travels in the link (?dest=lat,lon&label=...).
const TrackPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const dispatch = useDispatch();
  const query = useQuery();
  const brandName = useBrandAttribute('title');
  const brandLogo = useBrandAttribute('logo');

  const user = useSelector((state) => state.session.user);
  const [device, setDevice] = useState(null);
  const [position, setPosition] = useState(null);
  const [expired, setExpired] = useState(false);

  const [destLat, destLon] = (query.get('dest') || '').split(',').map(Number);
  const destination = Number.isFinite(destLat) && Number.isFinite(destLon) && query.get('dest')
    ? { latitude: destLat, longitude: destLon, label: query.get('label') || t('trackDestination') } : null;

  useEffect(() => {
    const start = async () => {
      if (!user) {
        const response = await fetch('/api/session');
        if (!response.ok) {
          setExpired(true);
          return;
        }
        dispatch(sessionActions.updateUser(await response.json()));
      }
    };
    start();
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    const load = async () => {
      const devices = await (await fetch('/api/devices')).json();
      if (!devices.length) {
        setExpired(true);
        return;
      }
      setDevice(devices[0]);
      const positions = await (await fetch(`/api/positions?deviceId=${devices[0].id}`)).json();
      if (positions.length) {
        setPosition(positions[0]);
      }
    };
    load();
    const interval = setInterval(load, REFRESH);
    return () => clearInterval(interval);
  }, [user]);

  // fit the unit and the destination once, then leave the map to the viewer
  const [initial, setInitial] = useState(null);
  useEffect(() => {
    if (position && !initial) {
      setInitial(destination
        ? [[position.longitude, position.latitude], [destination.longitude, destination.latitude]]
        : [[position.longitude, position.latitude]]);
    }
  }, [position]);

  const markers = useMemo(() => [
    ...(position && device ? [{
      latitude: position.latitude,
      longitude: position.longitude,
      image: `${mapIconKey(device.category)}-${position.attributes.motion ? 'success' : 'warning'}`,
      title: device.name,
    }] : []),
    ...(destination ? [{ ...destination, image: 'finish-error', title: destination.label }] : []),
  ], [position, device, query]);

  if (expired) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">{t('trackExpired')}</Alert>
      </Box>
    );
  }

  const speed = position ? Math.round(position.speed * 1.852) : 0;
  const remaining = position && destination
    ? distanceKm(position.latitude, position.longitude, destination.latitude, destination.longitude) * ROAD_FACTOR : null;
  const arrived = remaining !== null && remaining < 0.3;
  const minutes = remaining !== null && !arrived ? Math.round((remaining / Math.max(speed, DEFAULT_SPEED)) * 60) : null;

  return (
    <Box sx={{ position: 'fixed', inset: 0 }}>
      {user && (
        <MapView>
          <MapMarkers markers={markers} showTitles />
          {initial && <TrackCamera coordinates={initial} />}
        </MapView>
      )}
      <Card
        sx={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 16,
          mx: 'auto',
          maxWidth: 420,
          p: 2,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.88),
          backdropFilter: 'blur(12px)',
          boxShadow: `0 12px 40px ${alpha(theme.palette.common.black, 0.25)}`,
        }}
      >
        {!position && <LinearProgress />}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          {brandLogo && <Box component="img" src={brandLogo} alt="" sx={{ height: 28 }} />}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography fontWeight={700} noWrap>{device?.name || brandName || ''}</Typography>
            <Typography variant="caption" color="text.secondary">{t('trackLive')}</Typography>
          </Box>
        </Stack>
        {position && (
          <Stack spacing={1}>
            {destination && (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(arrived ? theme.palette.success.main : theme.palette.primary.main, 0.1) }}>
                <FlagIcon color={arrived ? 'success' : 'primary'} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2" color="text.secondary">{destination.label}</Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {arrived ? t('trackArrived') : t('trackEta').replace('{time}', dayjs().add(minutes, 'minute').format('HH:mm')).replace('{minutes}', minutes)}
                  </Typography>
                  {!arrived && <Typography variant="caption" color="text.secondary">{`${remaining.toFixed(1)} km · ${t('trackApprox')}`}</Typography>}
                </Box>
              </Stack>
            )}
            <Stack direction="row" spacing={3}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <SpeedIcon fontSize="small" color="action" />
                <Typography variant="body2">{`${speed} km/h`}</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ScheduleIcon fontSize="small" color="action" />
                <Typography variant="body2">{`${t('cardLastUpdate')}: ${dayjs(position.fixTime).format('HH:mm')}`}</Typography>
              </Stack>
            </Stack>
          </Stack>
        )}
      </Card>
    </Box>
  );
};

export default TrackPage;
