import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { parseCsv } from '../other/geofenceFormats';
import {
  STOP_COLORS, formatHour, optimizeStops, parseCoordinates, routeLength, stopLabel, timeOnDate,
} from './dispatchUtils';

const emptyStop = () => ({
  key: Math.random().toString(36).slice(2), name: '', address: '', contact: '', phone: '', coordinates: '', from: '', to: '', radius: 100, notes: '',
});

const toForm = (stop) => ({
  ...emptyStop(),
  ...stop,
  key: String(stop.id || Math.random()),
  coordinates: `${Number(stop.latitude).toFixed(6)}, ${Number(stop.longitude).toFixed(6)}`,
  from: formatHour(stop.windowStart),
  to: formatHour(stop.windowEnd),
});

const pick = (row, keys) => {
  const entry = Object.entries(row).find(([key]) => keys.includes(key.trim().toLowerCase()));
  return entry ? entry[1] : '';
};

// Create or edit a trip: unit, driver, planned start and its stops (name, address, contact, phone, coordinates,
// delivery window); stops can be imported from a CSV and put in the best visiting order
const TripDialog = ({ trip, onClose, onSaved }) => {
  const t = useTranslation();
  const devices = useSelector((state) => Object.values(state.devices.items));
  const positions = useSelector((state) => state.session.positions);
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [plannedStart, setPlannedStart] = useState(dayjs().add(1, 'hour').minute(0).format('YYYY-MM-DDTHH:mm'));
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState([emptyStop()]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trip) {
      setName(trip.name);
      setDeviceId(trip.deviceId);
      setDriverName(trip.driverName || '');
      setDriverPhone(trip.driverPhone || '');
      setPlannedStart(dayjs(trip.plannedStart).format('YYYY-MM-DDTHH:mm'));
      setNotes(trip.notes || '');
      setStops(trip.stops.map(toForm));
    }
  }, [trip]);

  const update = (index, changes) => setStops(stops.map((stop, i) => (i === index ? { ...stop, ...changes } : stop)));
  const move = (index, offset) => {
    const list = [...stops];
    const [item] = list.splice(index, 1);
    list.splice(index + offset, 0, item);
    setStops(list);
  };

  const located = stops.map((stop) => ({ ...stop, ...parseCoordinates(stop.coordinates) })).filter((stop) => stop.latitude !== undefined);
  const position = positions[deviceId];
  const start = position ? [position.longitude, position.latitude] : null;
  const distance = located.length > 1 ? routeLength(located, start) : 0;

  const optimize = () => {
    const withPoints = stops.map((stop) => ({ ...stop, ...parseCoordinates(stop.coordinates) }));
    if (withPoints.some((stop) => stop.latitude === undefined)) {
      setError(t('dispatchInvalidStop'));
      return;
    }
    setStops(optimizeStops(withPoints, start));
  };

  const importCsv = async (file) => {
    const rows = parseCsv(await file.text());
    const imported = rows.map((row) => {
      const latitude = pick(row, ['latitud', 'latitude', 'lat']);
      const longitude = pick(row, ['longitud', 'longitude', 'lon', 'lng']);
      return {
        ...emptyStop(),
        name: pick(row, ['nombre', 'name', 'cliente', 'customer']),
        address: pick(row, ['direccion', 'dirección', 'address']),
        contact: pick(row, ['contacto', 'contact']),
        phone: pick(row, ['telefono', 'teléfono', 'phone', 'celular']),
        coordinates: latitude && longitude ? `${latitude}, ${longitude}` : pick(row, ['coordenadas', 'coordinates']),
        from: pick(row, ['desde', 'from', 'inicio']),
        to: pick(row, ['hasta', 'to', 'fin']),
        notes: pick(row, ['notas', 'notes', 'pedido']),
      };
    }).filter((stop) => stop.name);
    if (imported.length) {
      setStops([...stops.filter((stop) => stop.name || stop.coordinates), ...imported]);
    } else {
      setError(t('dispatchCsvEmpty'));
    }
  };

  const save = async () => {
    setError(null);
    const body = {
      ...(trip || {}),
      name: name.trim(),
      deviceId: Number(deviceId),
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      plannedStart: dayjs(plannedStart).toISOString(),
      notes,
      stops: stops.map((stop) => {
        const coordinates = parseCoordinates(stop.coordinates);
        return {
          id: stop.id,
          name: stop.name.trim(),
          address: stop.address,
          contact: stop.contact,
          phone: stop.phone,
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          radius: Number(stop.radius) || 100,
          windowStart: timeOnDate(plannedStart, stop.from),
          windowEnd: timeOnDate(plannedStart, stop.to),
          notes: stop.notes,
        };
      }),
    };
    if (!body.name || !body.deviceId) {
      setError(t('dispatchMissingTrip'));
      return;
    }
    if (!body.stops.length || body.stops.some((stop) => !stop.name || stop.latitude === undefined)) {
      setError(t('dispatchInvalidStop'));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(trip ? `/api/dispatch/trips/${trip.id}` : '/api/dispatch/trips', {
        method: trip ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.text()).split('\n')[0]);
      onSaved(await response.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{trip ? t('dispatchEditTrip') : t('dispatchNewTrip')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '2fr 1.4fr 1.2fr 1fr 1.2fr' } }}>
            <TextField size="small" label={t('dispatchTripName')} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('dispatchTripNameExample')} />
            <TextField size="small" select label={t('sharedDevice')} value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
              {devices.map((device) => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('dispatchDriver')} value={driverName} onChange={(event) => setDriverName(event.target.value)} />
            <TextField size="small" label={t('dispatchDriverPhone')} value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} placeholder="+51 9…" />
            <TextField size="small" type="datetime-local" label={t('dispatchPlannedStart')} value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>
              {`${t('dispatchStops')} (${stops.length})`}
              {distance > 0 && <Chip size="small" sx={{ ml: 1 }} label={`≈ ${(distance * 1.3 / 1000).toFixed(1)} km`} />}
            </Typography>
            <Button size="small" startIcon={<UploadFileIcon />} component="label">
              {t('dispatchImportCsv')}
              <input hidden type="file" accept=".csv,.txt" onChange={(event) => { if (event.target.files[0]) importCsv(event.target.files[0]); event.target.value = ''; }} />
            </Button>
            <Button size="small" startIcon={<AutoFixHighIcon />} onClick={optimize} disabled={stops.length < 3}>{t('dispatchOptimize')}</Button>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setStops([...stops, emptyStop()])}>{t('dispatchAddStop')}</Button>
          </Stack>
          <Stack spacing={1}>
            {stops.map((stop, index) => (
              <Box key={stop.key} sx={{ display: 'grid', gap: 1, alignItems: 'center', gridTemplateColumns: { xs: '1fr', md: '28px 1.4fr 1.6fr 1fr 1fr 1.5fr 118px 118px 96px' } }}>
                <Box sx={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 700, bgcolor: STOP_COLORS[stop.status || 'pending'],
                }}
                >
                  {index + 1}
                </Box>
                <TextField size="small" label={t('dispatchCustomer')} value={stop.name} onChange={(event) => update(index, { name: event.target.value })} />
                <TextField size="small" label={t('positionAddress')} value={stop.address} onChange={(event) => update(index, { address: event.target.value })} />
                <TextField size="small" label={t('dispatchContact')} value={stop.contact} onChange={(event) => update(index, { contact: event.target.value })} />
                <TextField size="small" label={t('sharedPhone')} value={stop.phone} onChange={(event) => update(index, { phone: event.target.value })} />
                <TextField size="small" label={t('dispatchCoordinates')} placeholder="-12.0464, -77.0428" value={stop.coordinates} error={!!stop.coordinates && !parseCoordinates(stop.coordinates)} onChange={(event) => update(index, { coordinates: event.target.value })} />
                <TextField size="small" type="time" label={t('dispatchFrom')} value={stop.from} onChange={(event) => update(index, { from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label={t('dispatchTo')} value={stop.to} onChange={(event) => update(index, { to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <Stack direction="row">
                  {stop.status && stop.status !== 'pending' ? (
                    <Chip size="small" label={stopLabel(t, stop.status)} sx={{ bgcolor: STOP_COLORS[stop.status], color: '#fff' }} />
                  ) : (
                    <>
                      <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                      <IconButton size="small" disabled={index === stops.length - 1} onClick={() => move(index, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                      <Tooltip title={t('sharedRemove')}><IconButton size="small" onClick={() => setStops(stops.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary">{t('dispatchCsvHelp')}</Typography>
          <TextField size="small" multiline minRows={2} label={t('dispatchNotes')} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TripDialog;
