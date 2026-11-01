import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Stack, Switch,
  Tab, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RouteIcon from '@mui/icons-material/Route';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useModule } from '../common/util/permissions';
import { parseCsv } from '../other/geofenceFormats';
import { parseCoordinates } from '../dispatch/dispatchUtils';
import { addMinutes, plannedMinutes, stopDistances } from './transitTimes';

const COLORS = ['#2563c9', '#e67e22', '#2f9e5b', '#8e44ad', '#d9534f', '#1a9aa3', '#c0a000'];
const emptyStop = () => ({
  key: Math.random().toString(36).slice(2), name: '', coordinates: '', radius: '', minutes: '',
});
const pick = (row, keys) => {
  const entry = Object.entries(row).find(([key]) => keys.includes(key.trim().toLowerCase()));
  return entry ? entry[1] : '';
};

// Create or edit a public transport line: stops, path along the roads, frequency or departure times, alert thresholds
// and the units assigned to it
const RouteDialog = ({ route, onClose, onSaved }) => {
  const t = useTranslation();
  const hasRoutes = useModule('routes');
  const devices = useSelector((state) => Object.values(state.devices.items).sort((a, b) => a.name.localeCompare(b.name)));
  const [tab, setTab] = useState('stops');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [circular, setCircular] = useState(true);
  const [stops, setStops] = useState([emptyStop(), emptyStop()]);
  const [path, setPath] = useState([]);
  const [mode, setMode] = useState('bands');
  const [bands, setBands] = useState([{ from: '05:00', to: '23:00', minutes: 10 }]);
  const [departures, setDepartures] = useState('');
  const [settings, setSettings] = useState({
    speedKmh: 20, bunchingKm: 0.3, gapKm: '', offRouteMeters: 150, delayMinutes: 10,
  });
  const [deviceIds, setDeviceIds] = useState([]);
  const [error, setError] = useState(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!route) return;
    setName(route.name);
    setCode(route.code || '');
    setColor(route.color || COLORS[0]);
    setCircular(route.circular);
    setStops(route.stops.map((stop) => ({
      key: Math.random().toString(36).slice(2), name: stop.name, coordinates: `${stop.latitude}, ${stop.longitude}`, radius: stop.radius ?? '', minutes: stop.minutes ?? '',
    })));
    setPath(route.path || []);
    if (route.schedule?.departures?.length) {
      setMode('departures');
      setDepartures(route.schedule.departures.join(', '));
    } else if (route.schedule?.bands?.length) {
      setBands(route.schedule.bands);
    }
    setSettings((current) => ({ ...current, ...route.attributes }));
    setDeviceIds(route.deviceIds || []);
  }, [route]);

  const firstDeparture = mode === 'departures'
    ? departures.split(/[,;\s]+/).find((value) => /^\d{1,2}:\d{2}$/.test(value))
    : bands.find((band) => band.from)?.from;
  const referenceTime = reference || firstDeparture || '06:00';
  const timing = useMemo(() => {
    const measured = stopDistances(stops.map((stop) => parseCoordinates(stop.coordinates)), path, circular);
    if (!measured) return null;
    const planned = plannedMinutes(measured.distances, stops.map((stop) => stop.minutes), settings.speedKmh);
    const lap = plannedMinutes([measured.length], [''], settings.speedKmh)[0].minutes;
    return { distances: measured.distances, planned, length: measured.length, lap };
  }, [stops, path, circular, settings.speedKmh]);

  const update = (index, changes) => setStops(stops.map((stop, i) => (i === index ? { ...stop, ...changes } : stop)));
  const points = () => stops.map((stop) => parseCoordinates(stop.coordinates));

  const importCsv = async (file) => {
    const rows = parseCsv(await file.text());
    const imported = rows.map((row) => ({
      ...emptyStop(),
      name: pick(row, ['nombre', 'name', 'paradero']),
      coordinates: `${pick(row, ['latitud', 'latitude', 'lat'])}, ${pick(row, ['longitud', 'longitude', 'lon', 'lng'])}`,
      radius: pick(row, ['radio', 'radius']),
      minutes: pick(row, ['minutos', 'minutes']),
    })).filter((stop) => stop.name);
    if (imported.length) setStops(imported);
  };

  // path along the roads through every stop (the routing service takes up to 10 points per request)
  const tracePath = async () => {
    const list = points();
    if (list.some((point) => !point)) {
      setError(t('dispatchInvalidStop'));
      return;
    }
    const sequence = circular ? [...list, list[0]] : list;
    setBusy(true);
    try {
      const result = [];
      for (let start = 0; start < sequence.length - 1; start += 9) {
        const chunk = sequence.slice(start, start + 10);
        const query = chunk.map((point) => `point=${point.latitude},${point.longitude}`).join('&');
        const response = await fetch(`/api/routing/route?${query}`);
        if (!response.ok) throw new Error(t('transitRoutingError'));
        const data = await response.json();
        const coordinates = data.coordinates.map(([lon, lat]) => [lat, lon]);
        result.push(...(result.length ? coordinates.slice(1) : coordinates));
      }
      setPath(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setError(null);
    const list = points();
    if (!name.trim() || list.length < 2 || list.some((point) => !point)) {
      setError(t('transitInvalidLine'));
      return;
    }
    const body = {
      name: name.trim(),
      code,
      color,
      circular,
      stops: stops.map((stop, index) => ({
        name: stop.name || `${t('transitStop')} ${index + 1}`, ...list[index], ...(stop.radius !== '' ? { radius: Number(stop.radius) } : {}), ...(stop.minutes !== '' ? { minutes: Number(stop.minutes) } : {}),
      })),
      path,
      schedule: mode === 'bands' ? { bands: bands.map((band) => ({ ...band, minutes: Number(band.minutes) })) } : { departures: departures.split(/[,;\s]+/).filter(Boolean) },
      attributes: Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== '' && value !== null).map(([key, value]) => [key, key === 'timezone' ? value : Number(value)])),
      deviceIds,
    };
    const response = await fetch(route ? `/api/transit/routes/${route.id}` : '/api/transit/routes', {
      method: route ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (response.ok) onSaved(await response.json());
    else setError((await response.text()).split('\n')[0]);
  };

  const setting = (key, label, unit) => (
    <TextField size="small" type="number" label={label} value={settings[key] ?? ''} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }} />
  );

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{route ? t('transitEditLine') : t('transitNewLine')}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1.4fr' }, mb: 1 }}>
          <TextField size="small" label={t('transitLineName')} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('transitLineExample')} />
          <TextField size="small" label={t('transitCode')} value={code} onChange={(event) => setCode(event.target.value)} />
          <FormControlLabel control={<Switch checked={circular} onChange={(event) => setCircular(event.target.checked)} />} label={t('transitCircular')} />
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ mb: 1 }}>
          {COLORS.map((item) => <Box key={item} onClick={() => setColor(item)} sx={{
 width: 22, height: 22, borderRadius: '50%', bgcolor: item, cursor: 'pointer', outline: color === item ? '2px solid' : 'none', outlineOffset: 2, outlineColor: item 
}} />)}
        </Stack>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab value="stops" label={`${t('transitStops')} (${stops.length})`} />
          <Tab value="schedule" label={t('transitSchedule')} />
          <Tab value="alerts" label={t('transitAlerts')} />
          <Tab value="units" label={`${t('deviceTitle')} (${deviceIds.length})`} />
        </Tabs>
        {tab === 'stops' && (
          <Stack spacing={1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 1 }}>
              {setting('speedKmh', t('transitSpeed'), 'km/h')}
              <TextField size="small" type="time" label={t('transitReferenceDeparture')} value={referenceTime} onChange={(event) => setReference(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              {timing && (
                <Chip
                  color="primary"
                  variant="outlined"
                  label={circular
                    ? t('transitLapTime').replace('{0}', (timing.length / 1000).toFixed(1)).replace('{1}', Math.round(timing.lap)).replace('{2}', addMinutes(referenceTime, timing.lap))
                    : t('transitTripTime').replace('{0}', (timing.distances[timing.distances.length - 1] / 1000).toFixed(1)).replace('{1}', Math.round(timing.planned[timing.planned.length - 1].minutes))}
                />
              )}
            </Stack>
            {stops.map((stop, index) => (
              <Box key={stop.key} sx={{ display: 'grid', gap: 1, alignItems: 'center', gridTemplateColumns: { xs: '1fr', sm: '26px 1.5fr 1.5fr 90px 110px 150px 64px' } }}>
                <Box sx={{
 width: 22, height: 22, borderRadius: '50%', border: `4px solid ${color}`, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 
}}>{index + 1}</Box>
                <TextField size="small" label={t('transitStopName')} value={stop.name} onChange={(event) => update(index, { name: event.target.value })} />
                <TextField size="small" label={t('dispatchCoordinates')} placeholder="-12.0464, -77.0428" value={stop.coordinates} error={!!stop.coordinates && !parseCoordinates(stop.coordinates)} onChange={(event) => update(index, { coordinates: event.target.value })} />
                <TextField size="small" type="number" label={t('transitRadius')} value={stop.radius} onChange={(event) => update(index, { radius: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} />
                <TextField
                  size="small"
                  type="number"
                  label={t('transitMinutes')}
                  value={stop.minutes}
                  placeholder={timing ? timing.planned[index].minutes.toFixed(1) : t('transitAuto')}
                  onChange={(event) => update(index, { minutes: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Box sx={{ lineHeight: 1.2 }}>
                  {timing ? (
                    <>
                      <Typography variant="body2" fontWeight={700} component="div">
                        {`${addMinutes(referenceTime, timing.planned[index].minutes)} · +${timing.planned[index].minutes.toFixed(1)} min`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${(timing.distances[index] / 1000).toFixed(2)} km · ${timing.planned[index].auto ? t('transitAuto') : t('transitManual')}`}
                      </Typography>
                    </>
                  ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                </Box>
                <Stack direction="row">
                  {index > 0 && <IconButton size="small" onClick={() => { const list = [...stops]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; setStops(list); }}><ArrowUpwardIcon fontSize="small" /></IconButton>}
                  <IconButton size="small" onClick={() => setStops(stops.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Box>
            ))}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setStops([...stops, emptyStop()])}>{t('transitAddStop')}</Button>
              <Button size="small" startIcon={<UploadFileIcon />} component="label">
                {t('dispatchImportCsv')}
                <input hidden type="file" accept=".csv,.txt" onChange={(event) => { if (event.target.files[0]) importCsv(event.target.files[0]); event.target.value = ''; }} />
              </Button>
              {hasRoutes && <Button size="small" startIcon={<RouteIcon />} disabled={busy} onClick={tracePath}>{t('transitTracePath')}</Button>}
              <Chip size="small" label={path.length > 1 ? t('transitPathPoints').replace('{0}', path.length) : t('transitPathStraight')} onDelete={path.length > 1 ? () => setPath([]) : undefined} />
            </Stack>
            <Typography variant="caption" color="text.secondary">{t('transitStopsHelp')}</Typography>
          </Stack>
        )}
        {tab === 'schedule' && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <Chip label={t('transitFrequency')} color={mode === 'bands' ? 'primary' : 'default'} onClick={() => setMode('bands')} />
              <Chip label={t('transitDepartures')} color={mode === 'departures' ? 'primary' : 'default'} onClick={() => setMode('departures')} />
            </Stack>
            {mode === 'bands' ? (
              <>
                {bands.map((band, index) => (
                  <Stack key={`${band.from}-${index}`} direction="row" spacing={1} alignItems="center">
                    <TextField size="small" type="time" label={t('dispatchFrom')} value={band.from} onChange={(event) => setBands(bands.map((item, i) => (i === index ? { ...item, from: event.target.value } : item)))} slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField size="small" type="time" label={t('dispatchTo')} value={band.to} onChange={(event) => setBands(bands.map((item, i) => (i === index ? { ...item, to: event.target.value } : item)))} slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField size="small" type="number" label={t('transitEvery')} value={band.minutes} onChange={(event) => setBands(bands.map((item, i) => (i === index ? { ...item, minutes: event.target.value } : item)))} slotProps={{ input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
                    <IconButton size="small" onClick={() => setBands(bands.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => setBands([...bands, { from: '', to: '', minutes: 10 }])}>{t('transitAddBand')}</Button>
              </>
            ) : (
              <TextField multiline minRows={3} label={t('transitDepartureTimes')} placeholder="05:30, 05:45, 06:00, 06:12" value={departures} onChange={(event) => setDepartures(event.target.value)} />
            )}
            <Typography variant="caption" color="text.secondary">{t('transitScheduleHelp')}</Typography>
          </Stack>
        )}
        {tab === 'alerts' && (
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {setting('bunchingKm', t('transitBunchingLimit'), 'km')}
            {setting('gapKm', t('transitGapLimit'), 'km')}
            {setting('offRouteMeters', t('transitOffRouteLimit'), 'm')}
            {setting('delayMinutes', t('transitDelayLimit'), 'min')}
            <TextField size="small" label={t('sharedTimezone')} placeholder="America/Lima" value={settings.timezone ?? ''} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} />
            <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>{t('transitAlertsHelp')}</Typography>
          </Box>
        )}
        {tab === 'units' && (
          <Autocomplete
            multiple
            options={devices}
            getOptionLabel={(option) => option.name}
            value={devices.filter((device) => deviceIds.includes(device.id))}
            onChange={(_, next) => setDeviceIds(next.map((device) => device.id))}
            renderInput={(params) => <TextField {...params} label={t('transitAssignedUnits')} />}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default RouteDialog;
