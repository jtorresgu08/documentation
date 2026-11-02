import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SignalCellularOffIcon from '@mui/icons-material/SignalCellularOff';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { downloadCsv } from '../reports/reportPeriods';

export const SIM_STATUSES = ['active', 'inventory', 'suspended', 'cancelled'];
const STATUS_COLORS = {
  active: '#2e9d5b', inventory: '#2563c9', suspended: '#e0a100', cancelled: '#8a94a6',
};
const CARRIERS = ['Claro', 'Movistar', 'Entel', 'Bitel', 'Tigo', 'Telcel', 'Personal', 'Vivo', 'Otro'];

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const money = (value) => `S/ ${(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SimDialog = ({
  sim, devices, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [item, setItem] = useState(sim);
  useEffect(() => setItem(sim), [sim]);
  const save = useCatch(async () => {
    const response = await fetchOrThrow(item.id ? `/api/sims/${item.id}` : '/api/sims', {
      method: item.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    onSaved(await response.json());
  });
  if (!item) return null;
  const field = (key, label, props = {}) => (
    <TextField size="small" label={label} value={item[key] ?? ''} onChange={(event) => setItem({ ...item, [key]: event.target.value })} {...props} />
  );
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{item.id ? t('simEdit') : t('simAdd')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {field('iccid', 'ICCID', { required: true, helperText: t('simIccidHelp') })}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('phone', t('simPhone'), { sx: { flex: 1 } })}
            <Autocomplete
              freeSolo
              size="small"
              sx={{ flex: 1 }}
              options={CARRIERS}
              value={item.carrier || ''}
              onInputChange={(_, value) => setItem({ ...item, carrier: value })}
              renderInput={(params) => <TextField {...params} label={t('simCarrier')} />}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('apn', 'APN', { sx: { flex: 1 } })}
            {field('planName', t('simPlan'), { sx: { flex: 1 } })}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('dataLimitMb', t('simLimitMb'), { type: 'number', sx: { flex: 1 } })}
            {field('monthlyCost', t('simMonthlyCost'), { type: 'number', sx: { flex: 1 } })}
          </Stack>
          <Autocomplete
            size="small"
            options={devices}
            getOptionLabel={(option) => `${option.name} · ${option.uniqueId}`}
            value={devices.find((device) => device.id === item.deviceId) || null}
            onChange={(_, device) => setItem({ ...item, deviceId: device ? device.id : 0, status: device && item.status === 'inventory' ? 'active' : item.status })}
            renderInput={(params) => <TextField {...params} label={t('simDevice')} helperText={t('simDeviceHelp')} />}
          />
          <TextField select size="small" label={t('simStatusLabel')} value={item.status || (item.deviceId ? 'active' : 'inventory')} onChange={(event) => setItem({ ...item, status: event.target.value })}>
            {SIM_STATUSES.map((status) => <MenuItem key={status} value={status}>{t(`simStatus${capitalize(status)}`)}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!item.iccid}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const ImportDialog = ({ open, onClose, onDone }) => {
  const t = useTranslation();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const run = useCatch(async () => {
    const response = await fetchOrThrow('/api/sims/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
    });
    setResult(await response.json());
    onDone();
  });
  const readFile = (event) => {
    const file = event.target.files[0];
    if (file) file.text().then(setCsv);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('simImport')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('simImportHelp')}</Typography>
        <Box component="pre" sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, fontSize: 12, overflowX: 'auto' }}>
          {'iccid;telefono;operador;apn;plan;mb;costo;imei\n8951101234567890123;+51987654321;Claro;claro.pe;M2M 50 MB;50;6.50;864893030000001'}
        </Box>
        <Button component="label" variant="outlined" size="small" sx={{ my: 1 }}>
          {t('simChooseFile')}
          <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={readFile} />
        </Button>
        <TextField multiline minRows={6} fullWidth value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={t('simPasteCsv')} sx={{ fontFamily: 'monospace' }} />
        {result && (
          <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
            {`${t('simImportCreated')}: ${result.created} · ${t('simImportUpdated')}: ${result.updated}`}
            {result.errors.map((error) => <div key={error}>{error}</div>)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
        <Button variant="contained" onClick={run} disabled={!csv.trim()}>{t('simImportRun')}</Button>
      </DialogActions>
    </Dialog>
  );
};

// SIM inventory: carrier lines, data plan and cost, the device each SIM is in, usage and SIMs gone silent
const SimsPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [sims, setSims] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const [list, totals] = await Promise.all([fetch('/api/sims'), fetch('/api/sims/summary')]);
    if (list.ok) setSims(await list.json());
    if (totals.ok) setSummary(await totals.json());
  };
  useEffect(() => {
    load();
  }, []);

  const remove = useCatch(async (sim) => {
    if (window.confirm(t('sharedRemoveConfirm'))) {
      await fetchOrThrow(`/api/sims/${sim.id}`, { method: 'DELETE' });
      load();
    }
  });

  const visible = useMemo(() => (sims || []).filter((sim) => {
    if (filter === 'silent' && !sim.silent) return false;
    if (filter === 'overLimit' && !sim.overLimit) return false;
    if (SIM_STATUSES.includes(filter) && sim.status !== filter) return false;
    const text = `${sim.iccid} ${sim.phone || ''} ${sim.carrier || ''} ${sim.deviceName || ''} ${sim.planName || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  }), [sims, filter, search]);

  const kpi = (label, value, detail, color, key) => (
    <Card
      variant="outlined"
      onClick={key ? () => setFilter(filter === key ? 'all' : key) : undefined}
      sx={{
        flex: 1, minWidth: 140, p: 1.5, borderRadius: 3, cursor: key ? 'pointer' : 'default', borderColor: filter === key ? color : undefined,
      }}
    >
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Card>
  );

  const exportCsv = () => downloadCsv('sims', ['ICCID', t('simPhone'), t('simCarrier'), 'APN', t('simPlan'), t('simLimitMb'), t('simUsageMb'), t('simMonthlyCost'), t('simStatusLabel'), t('simDevice')],
    visible.map((sim) => [sim.iccid, sim.phone, sim.carrier, sim.apn, sim.planName, sim.dataLimitMb, sim.usageMb, sim.monthlyCost, t(`simStatus${capitalize(sim.status || 'inventory')}`), sim.deviceName]));

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('simTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('simSubtitle')}</Typography>
        </Box>
        <TextField
          size="small"
          placeholder={t('sharedSearch')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <Chip label="CSV" variant="outlined" onClick={() => visible.length && exportCsv()} />
        {!readonly && <Button variant="outlined" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setImporting(true)}>{t('simImport')}</Button>}
        {!readonly && <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditing({ status: 'inventory', deviceId: 0 })}>{t('simAdd')}</Button>}
      </Stack>
      {!sims && <LinearProgress />}
      {summary && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {kpi(t('simActive'), summary.active, `${summary.total} ${t('simTotal')}`, STATUS_COLORS.active, 'active')}
          {kpi(t('simStatusInventory'), summary.inventory, t('simInventoryHelp'), STATUS_COLORS.inventory, 'inventory')}
          {kpi(t('simSilent'), summary.silent, t('simSilentHelp'), '#d9534f', 'silent')}
          {kpi(t('simOverLimit'), summary.overLimit, t('simOverLimitHelp'), '#e0a100', 'overLimit')}
          {kpi(t('simAvailability'), summary.availability != null ? `${summary.availability}%` : '—', t('simAvailabilityHelp'), '#163c7d')}
          {kpi(t('simMonthlyCost'), money(summary.monthlyCost), `${summary.devicesWithoutSim} ${t('simDevicesWithoutSim')}`)}
        </Stack>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        {['all', ...SIM_STATUSES, 'silent', 'overLimit'].map((key) => (
          <Chip
            key={key}
            size="small"
            label={key === 'all' ? t('simAll') : key === 'silent' ? t('simSilent') : key === 'overLimit' ? t('simOverLimit') : t(`simStatus${capitalize(key)}`)}
            color={filter === key ? 'primary' : 'default'}
            onClick={() => setFilter(key)}
          />
        ))}
      </Stack>
      {sims && (
        <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ICCID</TableCell>
                <TableCell>{t('simPhone')}</TableCell>
                <TableCell>{t('simCarrier')}</TableCell>
                <TableCell>{t('simPlan')}</TableCell>
                <TableCell sx={{ minWidth: 150 }}>{t('simUsage')}</TableCell>
                <TableCell>{t('simDevice')}</TableCell>
                <TableCell>{t('simLastReport')}</TableCell>
                <TableCell>{t('simStatusLabel')}</TableCell>
                <TableCell align="right">{t('simMonthlyCost')}</TableCell>
                {!readonly && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((sim) => (
                <TableRow key={sim.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{sim.iccid}</TableCell>
                  <TableCell>{sim.phone || '—'}</TableCell>
                  <TableCell>{sim.carrier || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{sim.planName || '—'}</Typography>
                    {sim.apn && <Typography variant="caption" color="text.secondary">{sim.apn}</Typography>}
                  </TableCell>
                  <TableCell>
                    {sim.dataLimitMb > 0 ? (
                      <Tooltip title={sim.usageDate ? `${t('simUsageDate')}: ${dayjs(sim.usageDate).format('DD/MM/YYYY HH:mm')}` : ''}>
                        <Box>
                          <Typography variant="caption" sx={{ color: sim.overLimit ? '#d9534f' : undefined, fontWeight: sim.overLimit ? 700 : 400 }}>
                            {`${sim.usageMb} / ${sim.dataLimitMb} MB`}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, sim.usagePercent || 0)}
                            color={sim.overLimit ? 'error' : sim.usagePercent > 80 ? 'warning' : 'primary'}
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>
                      </Tooltip>
                    ) : `${sim.usageMb || 0} MB`}
                  </TableCell>
                  <TableCell>{sim.deviceName || <Typography variant="caption" color="text.secondary">{t('simNoDevice')}</Typography>}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {sim.silent && <Tooltip title={t('simSilentHelp')}><SignalCellularOffIcon fontSize="small" sx={{ color: '#d9534f' }} /></Tooltip>}
                      <Typography variant="body2" noWrap sx={{ color: sim.silent ? '#d9534f' : undefined }}>
                        {sim.lastUpdate ? dayjs(sim.lastUpdate).fromNow() : '—'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={t(`simStatus${capitalize(sim.status || 'inventory')}`)} sx={{ bgcolor: `${STATUS_COLORS[sim.status] || '#8a94a6'}22`, color: STATUS_COLORS[sim.status], fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right">{sim.monthlyCost ? money(sim.monthlyCost) : '—'}</TableCell>
                  {!readonly && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" onClick={() => setEditing(sim)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => remove(sim)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!visible.length && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('simEmpty')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{t('simUsageNote')}</Typography>
      {editing && <SimDialog sim={editing} devices={devices} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={load} />
    </Container>
  );
};

export default SimsPage;
