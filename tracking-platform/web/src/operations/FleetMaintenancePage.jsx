import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, IconButton, InputAdornment, LinearProgress, MenuItem, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BuildIcon from '@mui/icons-material/Build';
import ErrorIcon from '@mui/icons-material/Error';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaymentsIcon from '@mui/icons-material/Payments';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useRestriction } from '../common/util/permissions';
import { capitalize } from './alertUtils';

const STATE_COLORS = { overdue: '#c62828', soon: '#e65100', ok: '#2e7d32' };

const isTime = (type) => type.endsWith('Time');

// value of a plan in its unit: km, engine hours, date or raw attribute
export const formatPlanValue = (type, value) => {
  if (value == null) return '—';
  if (isTime(type)) return dayjs(value).format('DD/MM/YYYY');
  if (type === 'hours') return `${Math.round(value / 3600000).toLocaleString('es-PE')} h`;
  if (type === 'totalDistance' || type === 'odometer') return `${Math.round(value / 1000).toLocaleString('es-PE')} km`;
  return Math.round(value).toLocaleString('es-PE');
};

const formatRemaining = (type, value, t) => {
  if (isTime(type)) {
    const days = Math.round(value / 86400000);
    return days >= 0 ? `${days} ${t('expenseDays')}` : `${-days} ${t('expenseDays')} ${t('maintenanceLate')}`;
  }
  const text = formatPlanValue(type, Math.abs(value), t);
  return value >= 0 ? text : `${text} ${t('maintenanceLate')}`;
};

// Fleet maintenance: status of every plan per unit (overdue, due soon, ok) with progress and estimated date from the
// real use, the log of services done and a calendar of what comes next; registering a service restarts the plan
const FleetMaintenancePage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => state.devices.items);
  const currency = useSelector((state) => state.session.server.attributes.currencySymbol || 'S/');

  const [tab, setTab] = useState('status');
  const [units, setUnits] = useState([]);
  const [stateFilter, setStateFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(null);
  const [records, setRecords] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const money = (value) => `${currency} ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = async () => {
    if (!Object.keys(devices).length) return;
    try {
      const query = new URLSearchParams();
      (units.length ? units : Object.values(devices)).forEach((device) => query.append('deviceId', device.id));
      const [statusResponse, recordsResponse] = await Promise.all([
        fetchOrThrow(`/api/maintenance-plans/status?${query}`),
        fetchOrThrow(`/api/maintenance-plans/records?${query}`),
      ]);
      setStatus(await statusResponse.json());
      setRecords(await recordsResponse.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [units, Object.keys(devices).length]);

  const items = useMemo(() => (status?.items || []).filter((item) => (!stateFilter || item.state === stateFilter)
    && (!search || `${item.deviceName} ${item.name}`.toLowerCase().includes(search.toLowerCase()))), [status, stateFilter, search]);

  const yearCost = (records || []).filter((record) => dayjs(record.serviceTime).isAfter(dayjs().subtract(12, 'month')))
    .reduce((sum, record) => sum + record.cost, 0);

  const upcoming = useMemo(() => {
    const limit = dayjs().add(90, 'day').valueOf();
    const weeks = new Map();
    (status?.items || []).filter((item) => item.estimatedDate && item.estimatedDate <= limit)
      .sort((a, b) => a.estimatedDate - b.estimatedDate)
      .forEach((item) => {
        const week = item.state === 'overdue' ? 'overdue' : dayjs(item.estimatedDate).startOf('week').format('YYYY-MM-DD');
        weeks.set(week, [...(weeks.get(week) || []), item]);
      });
    return [...weeks.entries()];
  }, [status]);

  const planName = (record) => (status?.items || []).find((item) => item.maintenanceId === record.maintenanceId)?.name;

  const remove = async (record) => {
    await fetchOrThrow(`/api/maintenance-plans/records/${record.id}`, { method: 'DELETE' });
    load();
  };

  const Kpi = ({ icon, color, label, value, onClick, active }) => (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{ p: 1.75, height: '100%', cursor: onClick ? 'pointer' : 'default', borderColor: active ? color : undefined, bgcolor: active ? alpha(color, 0.05) : undefined }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.12), color }}>{icon}</Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h6" fontWeight={700}>{value}</Typography>
        </Box>
      </Stack>
    </Card>
  );

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('fleetMaintenanceTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('fleetMaintenanceSubtitle')}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Autocomplete
            multiple
            size="small"
            limitTags={1}
            sx={{ minWidth: 220 }}
            options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
            getOptionLabel={(option) => option.name}
            value={units}
            onChange={(_, value) => setUnits(value)}
            renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={units.length ? '' : t('drivingAllUnits')} />}
          />
          <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => navigate('/settings/maintenances')}>{t('maintenancePlans')}</Button>
          {!readonly && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>{t('maintenanceRegister')}</Button>}
        </Stack>
      </Stack>
      {!status && !error && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {status && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}><Kpi icon={<ErrorIcon />} color={STATE_COLORS.overdue} label={t('maintenanceStateOverdue')} value={status.counts.overdue} active={stateFilter === 'overdue'} onClick={() => setStateFilter(stateFilter === 'overdue' ? null : 'overdue')} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Kpi icon={<ScheduleIcon />} color={STATE_COLORS.soon} label={t('maintenanceStateSoon')} value={status.counts.soon} active={stateFilter === 'soon'} onClick={() => setStateFilter(stateFilter === 'soon' ? null : 'soon')} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Kpi icon={<CheckCircleIcon />} color={STATE_COLORS.ok} label={t('maintenanceStateOk')} value={status.counts.ok} active={stateFilter === 'ok'} onClick={() => setStateFilter(stateFilter === 'ok' ? null : 'ok')} /></Grid>
          <Grid size={{ xs: 6, md: 3 }}><Kpi icon={<PaymentsIcon />} color={theme.palette.primary.main} label={t('maintenanceYearCost')} value={money(yearCost)} /></Grid>
        </Grid>
      )}
      {status && !status.items.length && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => navigate('/settings/maintenances')}>{t('maintenancePlans')}</Button>}>{t('maintenanceNoPlans')}</Alert>
      )}

      <Card variant="outlined">
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} sx={{ px: 1.5 }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ flexGrow: 1 }}>
            <Tab value="status" label={t('maintenanceTabStatus')} />
            <Tab value="calendar" label={t('maintenanceTabCalendar')} />
            <Tab value="records" label={`${t('maintenanceTabRecords')} (${records?.length || 0})`} />
          </Tabs>
          {tab === 'status' && <TextField size="small" placeholder={t('sharedSearch')} value={search} onChange={(event) => setSearch(event.target.value)} sx={{ my: 1 }} />}
        </Stack>

        {tab === 'status' && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('reportDevice')}</TableCell>
                  <TableCell>{t('maintenancePlan')}</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>{t('maintenanceProgress')}</TableCell>
                  <TableCell align="right">{t('maintenanceCurrent')}</TableCell>
                  <TableCell align="right">{t('maintenanceNext')}</TableCell>
                  <TableCell align="right">{t('maintenanceRemaining')}</TableCell>
                  <TableCell align="right">{t('maintenanceEstimated')}</TableCell>
                  <TableCell>{t('maintenanceLastService')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.deviceId}-${item.maintenanceId}`} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{item.deviceName}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{`${t('maintenanceEvery')} ${formatPlanValue(item.type, isTime(item.type) ? null : item.period, t) === '—' ? `${Math.round(item.period / 86400000)} ${t('expenseDays')}` : formatPlanValue(item.type, item.period, t)}`}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{ flexGrow: 1, height: 8, borderRadius: 4, bgcolor: alpha(STATE_COLORS[item.state], 0.15), overflow: 'hidden' }}>
                          <Box sx={{ width: `${Math.min(100, item.progress * 100)}%`, height: '100%', bgcolor: STATE_COLORS[item.state], borderRadius: 4 }} />
                        </Box>
                        <Chip size="small" label={t(`maintenanceState${capitalize(item.state)}`)} sx={{ height: 22, fontSize: 11, bgcolor: alpha(STATE_COLORS[item.state], 0.12), color: STATE_COLORS[item.state] }} />
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{formatPlanValue(item.type, item.current, t)}</TableCell>
                    <TableCell align="right">{formatPlanValue(item.type, item.next, t)}</TableCell>
                    <TableCell align="right" sx={{ color: STATE_COLORS[item.state], fontWeight: 700, whiteSpace: 'nowrap' }}>{formatRemaining(item.type, item.remaining, t)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {item.estimatedDate ? dayjs(item.estimatedDate).format('DD/MM/YYYY') : '—'}
                      {item.dailyUse && <Typography variant="caption" color="text.secondary" component="div">{`${formatPlanValue(item.type, item.dailyUse, t)}/${t('maintenanceDay')}`}</Typography>}
                    </TableCell>
                    <TableCell>
                      {item.lastServiceTime ? (
                        <>
                          <Typography variant="body2">{dayjs(item.lastServiceTime).format('DD/MM/YYYY')}</Typography>
                          <Typography variant="caption" color="text.secondary">{[item.lastWorkshop, item.lastServiceCost ? money(item.lastServiceCost) : null].filter(Boolean).join(' · ')}</Typography>
                        </>
                      ) : <Typography variant="caption" color="text.secondary">{t('maintenanceNoService')}</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {!readonly && (
                        <Tooltip title={t('maintenanceRegister')}>
                          <IconButton size="small" color="primary" onClick={() => setDialog({ deviceId: item.deviceId, maintenanceId: item.maintenanceId })} aria-label={t('maintenanceRegister')}><BuildIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 'calendar' && (
          <Box sx={{ p: 2 }}>
            {!upcoming.length && <Typography variant="body2" color="text.secondary">{t('maintenanceNothingSoon')}</Typography>}
            <Grid container spacing={1.5}>
              {upcoming.map(([week, list]) => (
                <Grid key={week} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Card variant="outlined" sx={{ p: 1.5, height: '100%', borderColor: week === 'overdue' ? STATE_COLORS.overdue : undefined }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: week === 'overdue' ? STATE_COLORS.overdue : 'text.primary' }}>
                      {week === 'overdue' ? t('maintenanceStateOverdue') : `${t('maintenanceWeekOf')} ${dayjs(week).format('DD MMM')}`}
                    </Typography>
                    {list.map((item) => (
                      <Stack key={`${item.deviceId}-${item.maintenanceId}`} direction="row" spacing={1} alignItems="center" sx={{ py: 0.75, borderTop: `1px solid ${theme.palette.divider}` }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATE_COLORS[item.state] }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>{`${item.deviceName} · ${item.name}`}</Typography>
                          <Typography variant="caption" color="text.secondary">{dayjs(item.estimatedDate).format('ddd DD/MM')}</Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {tab === 'records' && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('expenseDate')}</TableCell>
                  <TableCell>{t('reportDevice')}</TableCell>
                  <TableCell>{t('maintenancePlan')}</TableCell>
                  <TableCell align="right">{t('expenseOdometer')}</TableCell>
                  <TableCell>{t('expenseVendor')}</TableCell>
                  <TableCell>{t('maintenanceNotes')}</TableCell>
                  <TableCell align="right">{t('expenseAmount')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {(records || []).map((record) => (
                  <TableRow key={record.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(record.serviceTime).format('DD/MM/YYYY')}</TableCell>
                    <TableCell>{devices[record.deviceId]?.name}</TableCell>
                    <TableCell>{planName(record) || '—'}</TableCell>
                    <TableCell align="right">{record.odometer ? `${Math.round(record.odometer / 1000).toLocaleString('es-PE')} km` : '—'}</TableCell>
                    <TableCell>{record.workshop || '—'}</TableCell>
                    <TableCell>{record.notes || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {money(record.cost)}
                      {record.expenseId > 0 && <Typography variant="caption" color="text.secondary" component="div">{t('maintenanceInExpenses')}</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {!readonly && <IconButton size="small" onClick={() => remove(record)} aria-label={t('sharedRemove')}><DeleteIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
                {records && !records.length && <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary">{t('maintenanceNoRecords')}</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      <ServiceDialog
        open={Boolean(dialog)}
        initial={dialog}
        items={status?.items || []}
        currency={currency}
        onClose={() => setDialog(null)}
        onSaved={() => { setDialog(null); load(); }}
      />
    </Container>
  );
};

const ServiceDialog = ({ open, initial, items, currency, onClose, onSaved }) => {
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      const deviceId = initial?.deviceId;
      const total = positions[deviceId]?.attributes?.totalDistance;
      setForm({
        deviceId,
        maintenanceId: initial?.maintenanceId || 0,
        serviceTime: dayjs().format('YYYY-MM-DDTHH:mm'),
        odometer: total ? Math.round(total / 1000) : '',
        cost: '',
        workshop: '',
        notes: '',
        createExpense: true,
      });
      setError(null);
    }
  }, [open, initial]);

  if (!form) return null;
  const update = (changes) => setForm({ ...form, ...changes });
  const plans = items.filter((item) => item.deviceId === form.deviceId);

  const save = async () => {
    try {
      await fetchOrThrow('/api/maintenance-plans/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: form.deviceId,
          maintenanceId: Number(form.maintenanceId) || 0,
          serviceTime: dayjs(form.serviceTime).toISOString(),
          odometer: form.odometer ? Number(form.odometer) * 1000 : 0,
          cost: Number(form.cost) || 0,
          workshop: form.workshop,
          notes: form.notes,
          attributes: { createExpense: form.createExpense },
        }),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('maintenanceRegister')}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2}>
          <Grid size={12}>
            <Autocomplete
              options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
              getOptionLabel={(option) => option.name}
              value={devices[form.deviceId] || null}
              onChange={(_, value) => {
                const total = positions[value?.id]?.attributes?.totalDistance;
                update({ deviceId: value?.id, maintenanceId: 0, odometer: total ? Math.round(total / 1000) : '' });
              }}
              renderInput={(params) => <TextField {...params} label={t('reportDevice')} />}
            />
          </Grid>
          <Grid size={12}>
            <TextField select fullWidth label={t('maintenancePlan')} value={form.maintenanceId} onChange={(event) => update({ maintenanceId: event.target.value })} helperText={t('maintenanceRestartsHint')}>
              <MenuItem value={0}>{t('maintenanceUnplanned')}</MenuItem>
              {plans.map((item) => <MenuItem key={item.maintenanceId} value={item.maintenanceId}>{item.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="datetime-local" label={t('expenseDate')} value={form.serviceTime} onChange={(event) => update({ serviceTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="number" label={t('expenseOdometer')} value={form.odometer} onChange={(event) => update({ odometer: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="number" label={t('expenseAmount')} value={form.cost} onChange={(event) => update({ cost: event.target.value })} slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label={t('expenseVendor')} value={form.workshop} onChange={(event) => update({ workshop: event.target.value })} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth multiline minRows={2} label={t('maintenanceNotes')} value={form.notes} onChange={(event) => update({ notes: event.target.value })} />
          </Grid>
          <Grid size={12}>
            <FormControlLabel control={<Checkbox checked={form.createExpense} onChange={(event) => update({ createExpense: event.target.checked })} />} label={t('maintenanceAddExpense')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!form.deviceId || !form.serviceTime}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FleetMaintenancePage;
