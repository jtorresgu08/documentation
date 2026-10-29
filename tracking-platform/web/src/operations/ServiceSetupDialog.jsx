import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BuildIcon from '@mui/icons-material/Build';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { capitalize } from './alertUtils';

const DAY = 86400000;
const HOUR = 3600000;

// how each kind of service is stored in a Traccar maintenance: position attribute and factor of its unit
export const SERVICE_KINDS = {
  odometer: { type: 'totalDistance', factor: 1000, unit: 'km' },
  hours: { type: 'hours', factor: HOUR, unit: 'h' },
  date: { type: 'fixTime', factor: DAY, unit: 'days' },
};

export const kindOf = (type) => {
  if (type === 'hours') return 'hours';
  if (type.endsWith('Time')) return 'date';
  return 'odometer';
};

// ready-made services: interval and notice in the unit of the kind
const TEMPLATES = [
  { group: 'serviceGroupVehicles', name: 'serviceTplOil', kind: 'odometer', interval: 5000, notice: 500 },
  { group: 'serviceGroupVehicles', name: 'serviceTplTires', kind: 'odometer', interval: 10000, notice: 1000 },
  { group: 'serviceGroupVehicles', name: 'serviceTplAirFilter', kind: 'odometer', interval: 15000, notice: 1000 },
  { group: 'serviceGroupVehicles', name: 'serviceTplBrakes', kind: 'odometer', interval: 20000, notice: 1000 },
  { group: 'serviceGroupMachinery', name: 'serviceTplEngineOil', kind: 'hours', interval: 250, notice: 25 },
  { group: 'serviceGroupMachinery', name: 'serviceTplGrease', kind: 'hours', interval: 50, notice: 5, renew: true },
  { group: 'serviceGroupMachinery', name: 'serviceTplHydraulic', kind: 'hours', interval: 500, notice: 50 },
  { group: 'serviceGroupMachinery', name: 'serviceTplOverhaul', kind: 'hours', interval: 2000, notice: 100 },
  { group: 'serviceGroupDocuments', name: 'serviceTplSoat', kind: 'date', interval: 365, notice: 15 },
  { group: 'serviceGroupDocuments', name: 'serviceTplInspection', kind: 'date', interval: 365, notice: 30 },
  { group: 'serviceGroupDocuments', name: 'serviceTplInsurance', kind: 'date', interval: 365, notice: 30 },
  { group: 'serviceGroupDocuments', name: 'serviceTplExtinguisher', kind: 'date', interval: 365, notice: 15 },
];

const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;

const currentOf = (position, kind) => {
  if (kind === 'date') return Date.now();
  const value = position?.attributes?.[SERVICE_KINDS[kind].type];
  return value != null ? value : null;
};

const emptyForm = (deviceIds) => ({
  deviceIds,
  name: '',
  kind: 'odometer',
  interval: '',
  last: '',
  lastDate: dayjs().format('YYYY-MM-DD'),
  notice: '',
  renew: false,
  description: '',
  emails: '',
  alert: true,
  channels: ['web'],
});

// "Añadir servicio": a maintenance plan by odometer, engine hours or date (oil change, yellow machinery, SOAT…) set up
// for one or several units, with the notice before it is due, whether it renews itself when it expires, extra e-mail
// recipients and, if missing, the maintenance notification that delivers the reminders
const ServiceSetupDialog = ({ open, deviceIds, maintenanceId, onClose, onSaved }) => {
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState(null);
  const [notificators, setNotificators] = useState(['web']);
  const [alertExists, setAlertExists] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(null);
      return;
    }
    setError(null);
    setPlan(null);
    const initial = emptyForm(deviceIds || []);
    setForm(initial);
    fetchOrThrow('/api/notifications/notificators').then((response) => response.json())
      .then((items) => setNotificators(items.map((item) => item.type).filter((type) => type !== 'command'))).catch(() => {});
    fetchOrThrow('/api/notifications').then((response) => response.json())
      .then((items) => setAlertExists(items.some((item) => item.type === 'maintenance'))).catch(() => {});
    if (maintenanceId) {
      fetchOrThrow(`/api/maintenance/${maintenanceId}`).then((response) => response.json()).then((item) => {
        const kind = kindOf(item.type);
        const { factor } = SERVICE_KINDS[kind];
        const notice = item.attributes.notice;
        setPlan(item);
        setForm({
          ...initial,
          name: item.name,
          kind,
          interval: round(item.period / factor, 1),
          last: kind === 'date' ? '' : round(item.start / factor, 1),
          lastDate: kind === 'date' ? dayjs(item.start).format('YYYY-MM-DD') : initial.lastDate,
          notice: notice == null ? round((item.period * 0.1) / factor, 1) : round((notice <= 1 ? item.period * notice : notice) / factor, 1),
          renew: Boolean(item.attributes.renew),
          description: item.attributes.description || '',
          emails: item.attributes.emails || '',
          alert: false,
        });
      }).catch((e) => setError(e.message));
    }
  }, [open, maintenanceId]);

  const units = form ? form.deviceIds.map((id) => devices[id]).filter(Boolean) : [];
  const single = units.length === 1 ? units[0] : null;
  const position = single ? positions[single.id] : null;

  useEffect(() => {
    if (form && !plan && single && form.kind !== 'date' && form.last === '') {
      const current = currentOf(position, form.kind);
      if (current != null) setForm({ ...form, last: round(current / SERVICE_KINDS[form.kind].factor) });
    }
  }, [form?.kind, single?.id]);

  const preview = useMemo(() => {
    if (!form || !form.interval) return null;
    const { factor } = SERVICE_KINDS[form.kind];
    const interval = Number(form.interval);
    if (form.kind === 'date') {
      const next = dayjs(form.lastDate).add(interval, 'day');
      return {
        next: next.format('DD/MM/YYYY'),
        remaining: `${next.diff(dayjs().startOf('day'), 'day')} ${t('expenseDays')}`,
        from: form.notice ? next.subtract(Number(form.notice), 'day').format('DD/MM/YYYY') : null,
      };
    }
    if (form.last === '' && !single) return null;
    const last = form.last === '' ? null : Number(form.last);
    const reading = single ? currentOf(position, form.kind) : null;
    const next = last + interval;
    const unit = SERVICE_KINDS[form.kind].unit;
    return {
      next: `${next.toLocaleString('es-PE')} ${unit}`,
      remaining: reading != null ? `${round(next - reading / factor).toLocaleString('es-PE')} ${unit}` : null,
      from: form.notice ? `${(next - Number(form.notice)).toLocaleString('es-PE')} ${unit}` : null,
    };
  }, [form, single, position]);

  if (!form) return null;
  const update = (changes) => setForm({ ...form, ...changes });
  const unitLabel = form.kind === 'date' ? t('expenseDays') : SERVICE_KINDS[form.kind].unit;
  const noticeInvalid = form.notice !== '' && Number(form.notice) >= Number(form.interval);
  const valid = form.deviceIds.length && form.name.trim() && Number(form.interval) > 0 && !noticeInvalid
    && (form.kind === 'date' ? form.lastDate : form.last !== '' || !single);

  const applyTemplate = (template) => update({
    name: t(template.name),
    kind: template.kind,
    interval: template.interval,
    notice: template.notice,
    renew: Boolean(template.renew),
    last: template.kind === form.kind ? form.last : '',
  });

  const changeKind = (kind) => {
    const current = single && kind !== 'date' ? currentOf(position, kind) : null;
    update({ kind, last: current != null ? round(current / SERVICE_KINDS[kind].factor) : '' });
  };

  const ensureAlert = async () => {
    const response = await fetchOrThrow('/api/notifications');
    const existing = (await response.json()).find((item) => item.type === 'maintenance' && item.always);
    if (existing) {
      const enabled = existing.notificators.split(/[, ]+/).filter(Boolean);
      const missing = form.channels.filter((channel) => !enabled.includes(channel));
      if (missing.length) {
        await fetchOrThrow(`/api/notifications/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...existing, notificators: [...enabled, ...missing].join(',') }),
        });
      }
    } else {
      await fetchOrThrow('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'maintenance', always: true, notificators: form.channels.join(','), attributes: {} }),
      });
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { type, factor } = SERVICE_KINDS[form.kind];
      const attributes = {
        ...(plan?.attributes || {}),
        renew: form.renew,
        notice: form.notice === '' ? 0.1 : Number(form.notice) * factor,
        description: form.description.trim(),
        emails: form.emails.trim(),
      };
      const startOf = (deviceId) => {
        if (form.kind === 'date') return dayjs(form.lastDate).startOf('day').valueOf();
        if (form.last !== '' && (units.length === 1 || plan)) return Number(form.last) * factor;
        // several units without a value: the service counts as done now, at each unit's own reading
        return form.last !== '' ? Number(form.last) * factor : currentOf(positions[deviceId], form.kind) || 0;
      };
      if (plan) {
        await fetchOrThrow(`/api/maintenance/${plan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...plan, name: form.name.trim(), type, start: startOf(form.deviceIds[0]), period: Number(form.interval) * factor, attributes,
          }),
        });
      } else {
        await Promise.all(form.deviceIds.map(async (deviceId) => {
          const response = await fetchOrThrow('/api/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name.trim(), type, start: startOf(deviceId), period: Number(form.interval) * factor, attributes,
            }),
          });
          const created = await response.json();
          await fetchOrThrow('/api/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, maintenanceId: created.id }),
          });
        }));
      }
      if (form.alert && form.channels.length) {
        await ensureAlert();
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await fetchOrThrow(`/api/maintenance/${plan.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const groups = [...new Set(TEMPLATES.map((template) => template.group))];
  const reading = (kind) => {
    const value = single ? currentOf(position, kind) : null;
    return value != null ? round(value / SERVICE_KINDS[kind].factor).toLocaleString('es-PE') : '—';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BuildIcon color="primary" fontSize="small" />
        {plan ? t('serviceEdit') : t('serviceAdd')}
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!plan && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">{t('serviceTemplates')}</Typography>
            {groups.map((group) => (
              <Stack key={group} direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }}>
                <Typography variant="caption" sx={{ width: 120, fontWeight: 600 }}>{t(group)}</Typography>
                {TEMPLATES.filter((template) => template.group === group).map((template) => (
                  <Chip key={template.name} size="small" variant="outlined" label={t(template.name)} onClick={() => applyTemplate(template)} />
                ))}
              </Stack>
            ))}
          </Box>
        )}
        <Grid container spacing={2}>
          <Grid size={12}>
            <Autocomplete
              multiple={!plan}
              disabled={Boolean(plan)}
              limitTags={3}
              options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
              getOptionLabel={(option) => option.name}
              value={plan ? units[0] || null : units}
              onChange={(_, value) => update({ deviceIds: (Array.isArray(value) ? value : [value]).filter(Boolean).map((device) => device.id), last: '' })}
              renderInput={(params) => <TextField {...params} label={t('reportDevice')} helperText={units.length > 1 ? t('serviceManyUnitsHint') : null} />}
            />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label={t('sharedName')} value={form.name} onChange={(event) => update({ name: event.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select fullWidth label={t('serviceExpiresBy')} value={form.kind} onChange={(event) => changeKind(event.target.value)}>
              <MenuItem value="odometer">{t('serviceKindOdometer')}</MenuItem>
              <MenuItem value="hours">{t('serviceKindHours')}</MenuItem>
              <MenuItem value="date">{t('serviceKindDate')}</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={t('serviceInterval')}
              value={form.interval}
              onChange={(event) => update({ interval: event.target.value })}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{unitLabel}</InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            {form.kind === 'date' ? (
              <TextField fullWidth type="date" label={t('serviceLastDate')} value={form.lastDate} onChange={(event) => update({ lastDate: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            ) : (
              <TextField
                fullWidth
                type="number"
                label={t('serviceLast')}
                value={form.last}
                placeholder={units.length > 1 ? t('serviceCurrentEach') : ''}
                onChange={(event) => update({ last: event.target.value })}
                slotProps={{ inputLabel: { shrink: true }, input: { endAdornment: <InputAdornment position="end">{unitLabel}</InputAdornment> } }}
              />
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            {form.kind === 'date' ? (
              <TextField
                fullWidth
                type="date"
                label={t('serviceNextDate')}
                value={form.interval ? dayjs(form.lastDate).add(Number(form.interval), 'day').format('YYYY-MM-DD') : ''}
                onChange={(event) => form.interval && update({ lastDate: dayjs(event.target.value).subtract(Number(form.interval), 'day').format('YYYY-MM-DD') })}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={t('serviceNextDateHint')}
              />
            ) : (
              <TextField
                fullWidth
                type="number"
                label={t('serviceNotice')}
                value={form.notice}
                error={noticeInvalid}
                onChange={(event) => update({ notice: event.target.value })}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{unitLabel}</InputAdornment> } }}
              />
            )}
          </Grid>
          {form.kind === 'date' && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label={t('serviceNotice')}
                value={form.notice}
                error={noticeInvalid}
                onChange={(event) => update({ notice: event.target.value })}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{unitLabel}</InputAdornment> } }}
              />
            </Grid>
          )}
          <Grid size={12}>
            <Typography variant="caption" color={noticeInvalid ? 'error' : 'text.secondary'}>{t('serviceNoticeHint')}</Typography>
          </Grid>
          <Grid size={12}>
            <FormControlLabel control={<Checkbox checked={form.renew} onChange={(event) => update({ renew: event.target.checked })} />} label={t('serviceRenew')} />
            <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 4, mt: -0.5 }}>
              {form.renew ? t('serviceRenewOn') : t('serviceRenewOff')}
            </Typography>
          </Grid>
          {single && (
            <>
              <Grid size={6}>
                <TextField fullWidth disabled label={t('serviceCurrentOdometer')} value={reading('odometer')} slotProps={{ input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth disabled label={t('serviceCurrentHours')} value={reading('hours')} slotProps={{ input: { endAdornment: <InputAdornment position="end">h</InputAdornment> } }} />
              </Grid>
            </>
          )}
          {preview && (
            <Grid size={12}>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06) }}>
                <Typography variant="body2">
                  {`${t('serviceNextDue')}: `}
                  <b>{preview.next}</b>
                  {preview.remaining && ` · ${t('maintenanceRemaining')} ${preview.remaining}`}
                </Typography>
                {preview.from && <Typography variant="caption" color="text.secondary">{`${t('serviceAlertFrom')} ${preview.from}`}</Typography>}
              </Box>
            </Grid>
          )}
          <Grid size={12}>
            <TextField fullWidth multiline minRows={2} label={t('sharedDescription')} value={form.description} onChange={(event) => update({ description: event.target.value })} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label={t('serviceEmails')} placeholder="taller@empresa.pe, flota@empresa.pe" value={form.emails} onChange={(event) => update({ emails: event.target.value })} helperText={t('serviceEmailsHint')} />
          </Grid>
          <Grid size={12}>
            <Box sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <FormControlLabel
                control={<Checkbox checked={form.alert} onChange={(event) => update({ alert: event.target.checked })} />}
                label={(
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <NotificationsActiveIcon fontSize="small" color="primary" />
                    <span>{t('serviceAutoAlert')}</span>
                  </Stack>
                )}
              />
              <Typography variant="caption" color="text.secondary" component="div" sx={{ ml: 4, mt: -0.5 }}>
                {alertExists ? t('serviceAlertExists') : t('serviceAlertCreate')}
              </Typography>
              {form.alert && (
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ ml: 4, mt: 1 }}>
                  {notificators.map((type) => {
                    const selected = form.channels.includes(type);
                    return (
                      <Chip
                        key={type}
                        size="small"
                        color={selected ? 'primary' : 'default'}
                        variant={selected ? 'filled' : 'outlined'}
                        label={t(`notificator${capitalize(type)}`)}
                        onClick={() => update({ channels: selected ? form.channels.filter((item) => item !== type) : [...form.channels, type] })}
                      />
                    );
                  })}
                </Stack>
              )}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        {plan && <Button color="error" onClick={remove} sx={{ mr: 'auto' }}>{t('sharedRemove')}</Button>}
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || saving}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServiceSetupDialog;
