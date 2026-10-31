import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, IconButton, InputAdornment, MenuItem, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import RouteIcon from '@mui/icons-material/Route';
import circle from '@turf/circle';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { geofencesActions } from '../store';

const SOURCE = 'geofence-create-preview';

// "lat, lon" or "lat lon" (as copied from Google Maps) to [lon, lat]
export const parsePoint = (text) => {
  const parts = (text || '').trim().split(/[\s,;]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null;
  return [parts[1], parts[0]];
};

const formatPoint = ([lon, lat]) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

const formatDistance = (meters) => (meters >= 1000 ? `${(meters / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`);
const formatDuration = (seconds) => {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// Panel over the geofences map to create a circular geofence from its center and radius, or a route geofence from
// the start and end coordinates (and stops in between): the route follows the roads (OSRM routing service), is
// previewed with its distance and time, and is saved as a corridor with the chosen width and optional speed limit
const GeofenceCreatePanel = ({ onClose }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tab, setTab] = useState('route');
  const [center, setCenter] = useState('');
  const [radius, setRadius] = useState(300);
  const [points, setPoints] = useState(['', '']);
  const [profile, setProfile] = useState('driving');
  const [width, setWidth] = useState(50);
  const [speedLimit, setSpeedLimit] = useState('');
  const [name, setName] = useState('');
  const [route, setRoute] = useState(null);
  const [picking, setPicking] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${SOURCE}-fill`, type: 'fill', source: SOURCE, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': theme.palette.primary.main, 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: `${SOURCE}-line`,
      type: 'line',
      source: SOURCE,
      filter: ['in', '$type', 'LineString', 'Polygon'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': theme.palette.primary.main, 'line-width': ['coalesce', ['get', 'width'], 3], 'line-opacity': ['coalesce', ['get', 'opacity'], 1] },
    });
    map.addLayer({
      id: `${SOURCE}-points`,
      type: 'circle',
      source: SOURCE,
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });
    return () => {
      [`${SOURCE}-points`, `${SOURCE}-line`, `${SOURCE}-fill`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, []);

  const fit = (coordinates, instant) => {
    if (coordinates.length) {
      const bounds = coordinates.reduce((result, point) => result.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      // leave room for this panel on the right
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 460 }, maxZoom: 16, duration: instant ? 0 : 800,
      });
    }
  };

  // preview: the circle, or the route corridor with its start, stops and end
  useEffect(() => {
    const features = [];
    if (tab === 'circle') {
      const point = parsePoint(center);
      if (point && radius > 0) {
        const shape = circle(point, Number(radius), { steps: 64, units: 'meters' });
        features.push(shape);
        fit(shape.geometry.coordinates[0], true);
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: { color: theme.palette.primary.main } });
      }
    } else {
      if (route) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: route.coordinates }, properties: { width: 5 } });
      }
      points.map(parsePoint).forEach((point, index) => {
        if (point) {
          const last = index === points.length - 1;
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: { color: index === 0 ? '#2e7d32' : last ? '#c62828' : '#1565c0' } });
        }
      });
    }
    map.getSource(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }, [tab, center, radius, points, route]);

  useEffect(() => {
    if (picking === null) return undefined;
    const onClick = (event) => {
      const value = formatPoint([event.lngLat.lng, event.lngLat.lat]);
      if (picking === 'center') {
        setCenter(value);
      } else {
        setPoints((current) => current.map((item, index) => (index === picking ? value : item)));
        setRoute(null);
      }
      setPicking(null);
    };
    map.once('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [picking]);

  const calculate = async () => {
    const parsed = points.map(parsePoint);
    if (parsed.some((point) => !point)) {
      setError(t('geofenceInvalidCoordinates'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({ profile });
      parsed.forEach(([lon, lat]) => query.append('point', `${lat},${lon}`));
      const result = await (await fetchOrThrow(`/api/routing/route?${query}`)).json();
      setRoute(result);
      fit(result.coordinates);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    let item;
    if (tab === 'circle') {
      const point = parsePoint(center);
      if (!point || !(radius > 0)) {
        setError(t('geofenceInvalidCoordinates'));
        return;
      }
      item = { name: name.trim() || t('geofenceCircle'), area: `CIRCLE (${point[1].toFixed(6)} ${point[0].toFixed(6)}, ${Math.round(radius)})`, attributes: {} };
    } else {
      item = {
        name: name.trim() || `${t('geofenceRoute')} ${points[0]} - ${points[points.length - 1]}`,
        area: route.area,
        attributes: {
          polylineDistance: Number(width) || 50, routeDistance: route.distance, routeDuration: route.duration, routeFrom: points[0], routeTo: points[points.length - 1],
        },
      };
    }
    if (speedLimit) item.attributes.speedLimitKmh = Number(speedLimit);
    setBusy(true);
    try {
      const response = await fetchOrThrow('/api/geofences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      const created = await response.json();
      dispatch(geofencesActions.update([created]));
      navigate(`/settings/geofence/${created.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const pickButton = (target) => (
    <InputAdornment position="end">
      <Tooltip title={t('geofencePickOnMap')}>
        <IconButton size="small" color={picking === target ? 'primary' : 'default'} onClick={() => setPicking(picking === target ? null : target)}><AdsClickIcon fontSize="small" /></IconButton>
      </Tooltip>
    </InputAdornment>
  );

  const pointLabel = (index) => {
    if (index === 0) return t('geofenceRouteStart');
    if (index === points.length - 1) return t('geofenceRouteEnd');
    return `${t('geofenceRouteStop')} ${index}`;
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute', top: 12, right: 56, width: 380, maxWidth: 'calc(100% - 80px)', maxHeight: 'calc(100% - 24px)', overflowY: 'auto', zIndex: 5, borderRadius: '16px',
        bgcolor: alpha(theme.palette.background.paper, 0.95), backdropFilter: 'blur(10px)',
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 2, pt: 1.5 }}>
        <RouteIcon color="primary" sx={{ mr: 1 }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>{t('geofenceByCoordinates')}</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => { setTab(value); setError(null); }} variant="fullWidth" sx={{ px: 1 }}>
        <Tab value="route" label={t('geofenceRoute')} />
        <Tab value="circle" label={t('geofenceCircle')} />
      </Tabs>
      <Stack spacing={1.5} sx={{ p: 2 }}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {tab === 'circle' ? (
          <>
            <TextField size="small" label={t('geofenceCenter')} placeholder="-12.046374, -77.042793" value={center} onChange={(event) => setCenter(event.target.value)} slotProps={{ input: { endAdornment: pickButton('center') } }} helperText={t('geofenceCoordinatesHelp')} />
            <TextField size="small" type="number" label={t('geofenceRadius')} value={radius} onChange={(event) => setRadius(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} />
          </>
        ) : (
          <>
            {points.map((value, index) => (
              <Stack key={index} direction="row" spacing={0.5} alignItems="flex-start">
                <Box sx={{ width: 10, height: 10, mt: 1.6, borderRadius: '50%', flexShrink: 0, bgcolor: index === 0 ? '#2e7d32' : index === points.length - 1 ? '#c62828' : '#1565c0' }} />
                <TextField
                  size="small"
                  fullWidth
                  label={pointLabel(index)}
                  placeholder="-12.046374, -77.042793"
                  value={value}
                  error={Boolean(value) && !parsePoint(value)}
                  onChange={(event) => { setPoints(points.map((item, i) => (i === index ? event.target.value : item))); setRoute(null); }}
                  slotProps={{ input: { endAdornment: pickButton(index) } }}
                />
                {index > 0 && index < points.length - 1 && (
                  <IconButton size="small" onClick={() => { setPoints(points.filter((_, i) => i !== index)); setRoute(null); }}><DeleteIcon fontSize="small" /></IconButton>
                )}
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<AddIcon />} disabled={points.length >= 10} onClick={() => { setPoints([...points.slice(0, -1), '', points[points.length - 1]]); setRoute(null); }}>{t('geofenceAddStop')}</Button>
              <Button size="small" startIcon={<SwapVertIcon />} onClick={() => { setPoints([...points].reverse()); setRoute(null); }}>{t('geofenceReverse')}</Button>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField select size="small" label={t('geofenceProfile')} value={profile} onChange={(event) => { setProfile(event.target.value); setRoute(null); }} sx={{ flex: 1 }}>
                <MenuItem value="driving">{t('geofenceProfileDriving')}</MenuItem>
                <MenuItem value="bike">{t('geofenceProfileBike')}</MenuItem>
                <MenuItem value="foot">{t('geofenceProfileFoot')}</MenuItem>
              </TextField>
              <TextField size="small" type="number" label={t('geofenceCorridor')} value={width} onChange={(event) => setWidth(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} sx={{ flex: 1 }} />
            </Stack>
            <Button variant="outlined" startIcon={<RouteIcon />} onClick={calculate} disabled={busy}>{t('geofenceCalculateRoute')}</Button>
            {route && (
              <Alert severity="success" icon={false}>
                <Typography variant="body2" fontWeight={700}>{`${formatDistance(route.distance)} · ${formatDuration(route.duration)}`}</Typography>
                <Typography variant="caption">{`${route.coordinates.length} ${t('geofenceRoutePoints')} (${route.points} ${t('geofenceRouteOriginal')}) · ${t('geofenceCorridor')} ${width} m`}</Typography>
              </Alert>
            )}
          </>
        )}
        <TextField size="small" label={t('sharedName')} value={name} onChange={(event) => setName(event.target.value)} placeholder={tab === 'circle' ? t('geofenceCircle') : t('geofenceRouteNameExample')} />
        <TextField size="small" type="number" label={t('geofenceSpeedLimitOptional')} value={speedLimit} onChange={(event) => setSpeedLimit(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }} />
        <Button variant="contained" onClick={save} disabled={busy || (tab === 'route' && !route) || (tab === 'circle' && !parsePoint(center))}>{t('geofenceCreate')}</Button>
      </Stack>
    </Paper>
  );
};

export default GeofenceCreatePanel;
