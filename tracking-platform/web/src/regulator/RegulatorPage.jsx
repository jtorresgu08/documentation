import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, LinearProgress, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useRestriction } from '../common/util/permissions';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { downloadCsv } from '../reports/reportPeriods';

const STATES = ['ok', 'late', 'failing', 'offline', 'pending'];
const STATE_COLORS = {
  ok: '#2e9d5b', late: '#e0a100', failing: '#d9534f', offline: '#8a94a6', pending: '#2563c9',
};
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const PLACEHOLDERS = '${plate} ${imei} ${name} ${route} ${lat} ${lon} ${speedKmh} ${course} ${altitude} ${satellites} ${ignition} ${ignition01} ${event} ${alarm} ${driver} ${odometerKm} ${fixTime} ${fixTimeIso} ${fixTimeEpoch}';

const DestinationDialog = ({
  destination, presets, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [item, setItem] = useState(destination);
  const [test, setTest] = useState(null);
  const applyPreset = (type) => {
    const preset = presets?.[type];
    setItem({
      ...item, type, ...(preset && !item.id ? { name: item.name || preset.name, authHeader: preset.authHeader, template: preset.template, batch: preset.batch } : {}),
    });
  };
  const save = useCatch(async () => {
    const response = await fetchOrThrow(item.id ? `/api/regulator/destinations/${item.id}` : '/api/regulator/destinations', {
      method: item.id ? 'PUT' : 'POST', ...json(item),
    });
    onSaved(await response.json());
  });
  const runTest = useCatch(async () => {
    const response = await fetchOrThrow(`/api/regulator/destinations/${item.id}/test`, { method: 'POST' });
    setTest(await response.json());
  });
  const field = (key, label, props = {}) => (
    <TextField size="small" label={label} value={item[key] ?? ''} onChange={(event) => setItem({ ...item, [key]: event.target.value })} {...props} />
  );
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{item.id ? t('regulatorEditDestination') : t('regulatorAddDestination')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select size="small" label={t('regulatorAuthority')} value={item.type || 'custom'} onChange={(event) => applyPreset(event.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="sutran">SUTRAN</MenuItem>
              <MenuItem value="atu">ATU</MenuItem>
              <MenuItem value="custom">{t('regulatorOther')}</MenuItem>
            </TextField>
            {field('name', t('sharedName'), { sx: { flex: 1 } })}
          </Stack>
          {field('url', t('regulatorUrl'), { placeholder: 'https://...', helperText: t('regulatorUrlHelp') })}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('authHeader', t('regulatorAuthHeader'), { sx: { flex: 1 }, placeholder: 'Authorization' })}
            {field('authValue', t('regulatorAuthValue'), { sx: { flex: 2 }, type: 'password', helperText: t('regulatorAuthValueHelp') })}
          </Stack>
          {field('template', t('regulatorTemplate'), {
            multiline: true, minRows: 5, slotProps: { input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }, helperText: `${t('regulatorTemplateHelp')} ${PLACEHOLDERS}`,
          })}
          {item.type !== 'custom' && <Alert severity="warning">{t('regulatorPresetWarning')}</Alert>}
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Checkbox checked={Boolean(item.batch)} onChange={(event) => setItem({ ...item, batch: event.target.checked })} />} label={t('regulatorBatch')} />
            <FormControlLabel control={<Checkbox checked={item.enabled !== false} onChange={(event) => setItem({ ...item, enabled: event.target.checked })} />} label={t('regulatorEnabled')} />
          </Stack>
          {test && (
            <Alert severity={test.status >= 200 && test.status < 300 ? 'success' : 'error'}>
              <Typography variant="body2" fontWeight={700}>{test.error || `HTTP ${test.status}`}</Typography>
              <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{test.request}</Box>
              {test.body && <Box component="pre" sx={{ m: 0, mt: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}>{test.body}</Box>}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {item.id && <Button startIcon={<NetworkCheckIcon />} onClick={runTest}>{t('regulatorTest')}</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!item.name || !item.url}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const EnrollDialog = ({
  open, destinations, devices, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [destinationId, setDestinationId] = useState('');
  const [selected, setSelected] = useState([]);
  const save = useCatch(async (enrolled) => {
    await fetchOrThrow('/api/regulator/devices', { method: 'PUT', ...json({ destinationId, deviceIds: selected.map((device) => device.id), enrolled }) });
    setSelected([]);
    onSaved();
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('regulatorEnroll')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select size="small" label={t('regulatorDestination')} value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
            {destinations.map((destination) => <MenuItem key={destination.id} value={destination.id}>{destination.name}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            options={devices}
            value={selected}
            disableCloseOnSelect
            getOptionLabel={(option) => `${option.name}${option.attributes?.plate ? ` · ${option.attributes.plate}` : ''}`}
            onChange={(_, value) => setSelected(value)}
            renderInput={(params) => <TextField {...params} label={t('regulatorVehicles')} helperText={t('regulatorPlateHelp')} />}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button color="error" onClick={() => save(false)} disabled={!destinationId || !selected.length}>{t('regulatorUnenroll')}</Button>
        <Button variant="contained" onClick={() => save(true)} disabled={!destinationId || !selected.length}>{t('regulatorEnrollAction')}</Button>
      </DialogActions>
    </Dialog>
  );
};

// Transmission to authorities (SUTRAN, ATU): which enrolled vehicles are transmitting, late or failing, and the
// destinations the administrator configures
const RegulatorPage = () => {
  const t = useTranslation();
  const admin = useAdministrator();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [tab, setTab] = useState('status');
  const [status, setStatus] = useState(null);
  const [destinations, setDestinations] = useState([]);
  const [presets, setPresets] = useState(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  const load = async () => {
    const [state, list] = await Promise.all([fetch('/api/regulator/status'), fetch('/api/regulator/destinations')]);
    if (state.ok) setStatus(await state.json());
    if (list.ok) setDestinations(await list.json());
  };
  useEffect(() => {
    load();
    if (admin) fetch('/api/regulator/presets').then((response) => response.json()).then(setPresets);
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const remove = useCatch(async (destination) => {
    if (window.confirm(t('sharedRemoveConfirm'))) {
      await fetchOrThrow(`/api/regulator/destinations/${destination.id}`, { method: 'DELETE' });
      load();
    }
  });

  const vehicles = useMemo(() => (status?.vehicles || []).filter((vehicle) => !filter || vehicle.state === filter), [status, filter]);
  const total = status?.vehicles.length || 0;
  const exportCsv = () => downloadCsv('transmision-entidades', [t('regulatorPlate'), t('sharedDevice'), t('regulatorDestination'), t('simStatusLabel'), t('regulatorLastSent'), t('regulatorSent'), t('regulatorLastError')],
    vehicles.map((vehicle) => [vehicle.plate, vehicle.name, vehicle.destination, t(`regulatorState${capitalize(vehicle.state)}`), vehicle.lastSent && dayjs(vehicle.lastSent).format('DD/MM/YYYY HH:mm:ss'), vehicle.sent, vehicle.lastError]));

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('regulatorTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('regulatorSubtitle')}</Typography>
        </Box>
        <Chip label="CSV" variant="outlined" onClick={() => vehicles.length && exportCsv()} />
        {!readonly && destinations.length > 0 && <Button variant="outlined" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEnrolling(true)}>{t('regulatorEnroll')}</Button>}
        {admin && <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditing({ type: 'sutran', enabled: true, ...(presets?.sutran || {}) })}>{t('regulatorAddDestination')}</Button>}
      </Stack>
      {admin && (
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab value="status" label={t('regulatorStatusTab')} />
          <Tab value="destinations" label={t('regulatorDestinations')} />
        </Tabs>
      )}
      {!status && <LinearProgress />}
      {status && tab === 'status' && (
        <>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            {STATES.map((state) => (
              <Card
                key={state}
                variant="outlined"
                onClick={() => setFilter(filter === state ? '' : state)}
                sx={{
                  flex: 1, minWidth: 140, p: 1.5, borderRadius: 3, cursor: 'pointer', borderColor: filter === state ? STATE_COLORS[state] : undefined,
                }}
              >
                <Typography variant="caption" color="text.secondary">{t(`regulatorState${capitalize(state)}`)}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: STATE_COLORS[state] }}>{status.counts[state]}</Typography>
                <Typography variant="caption" color="text.secondary">{total ? `${Math.round((status.counts[state] / total) * 100)}%` : '—'}</Typography>
              </Card>
            ))}
          </Stack>
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('regulatorPlate')}</TableCell>
                  <TableCell>{t('regulatorDestination')}</TableCell>
                  <TableCell>{t('simStatusLabel')}</TableCell>
                  <TableCell>{t('regulatorLastReport')}</TableCell>
                  <TableCell>{t('regulatorLastSent')}</TableCell>
                  <TableCell align="right">{t('regulatorSent')}</TableCell>
                  <TableCell>{t('regulatorLastError')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={`${vehicle.deviceId}-${vehicle.destinationId}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{vehicle.plate}</Typography>
                      {vehicle.plate !== vehicle.name && <Typography variant="caption" color="text.secondary">{vehicle.name}</Typography>}
                    </TableCell>
                    <TableCell>{vehicle.destination}</TableCell>
                    <TableCell>
                      <Chip size="small" label={t(`regulatorState${capitalize(vehicle.state)}`)} sx={{ bgcolor: `${STATE_COLORS[vehicle.state]}22`, color: STATE_COLORS[vehicle.state], fontWeight: 700 }} />
                    </TableCell>
                    <TableCell>{vehicle.lastUpdate ? dayjs(vehicle.lastUpdate).fromNow() : '—'}</TableCell>
                    <TableCell>{vehicle.lastSent ? dayjs(vehicle.lastSent).format('DD/MM HH:mm:ss') : '—'}</TableCell>
                    <TableCell align="right">{vehicle.sent}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {vehicle.lastError ? (
                        <Tooltip title={vehicle.lastError}>
                          <Typography variant="caption" noWrap component="div" sx={{ color: vehicle.state === 'failing' ? '#d9534f' : 'text.secondary' }}>
                            {`${dayjs(vehicle.lastErrorTime).format('DD/MM HH:mm')} · ${vehicle.lastError}`}
                          </Typography>
                        </Tooltip>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {!vehicles.length && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>{destinations.length ? t('regulatorNoVehicles') : t('regulatorNoDestinations')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{t('regulatorStatesHelp')}</Typography>
        </>
      )}
      {tab === 'destinations' && admin && (
        <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('regulatorUrl')}</TableCell>
                <TableCell align="right">{t('regulatorSent')}</TableCell>
                <TableCell align="right">{t('regulatorQueued')}</TableCell>
                <TableCell align="right">{t('regulatorFailed')}</TableCell>
                <TableCell>{t('regulatorLastError')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {destinations.map((destination) => (
                <TableRow key={destination.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{destination.name}</Typography>
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" label={(destination.type || 'custom').toUpperCase()} />
                      {!destination.enabled && <Chip size="small" label={t('regulatorDisabled')} />}
                      {destination.batch && <Chip size="small" variant="outlined" label={t('regulatorBatchShort')} />}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{destination.url}</TableCell>
                  <TableCell align="right">{destination.sent}</TableCell>
                  <TableCell align="right">{destination.queued}</TableCell>
                  <TableCell align="right" sx={{ color: destination.failed ? '#d9534f' : undefined }}>{destination.failed + destination.dropped}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="caption" noWrap component="div">{destination.lastError ? `${dayjs(destination.lastErrorTime).format('DD/MM HH:mm')} · ${destination.lastError}` : '—'}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" onClick={() => setEditing(destination)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => remove(destination)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && <DestinationDialog destination={editing} presets={presets} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <EnrollDialog open={enrolling} destinations={destinations.filter((destination) => destination.enabled)} devices={devices} onClose={() => setEnrolling(false)} onSaved={() => { setEnrolling(false); load(); }} />
    </Container>
  );
};

export default RegulatorPage;
