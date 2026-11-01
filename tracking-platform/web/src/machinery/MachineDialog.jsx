import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';
import { MACHINE_TYPES, typeLabel } from './machineryUtils';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

// Settings of a machine: type, dashboard hour meter (to align the engine hours), work input, schedule and rental
const MachineDialog = ({ device, machine, onClose, onSaved }) => {
  const t = useTranslation();
  const [form, setForm] = useState({
    machineMode: true, machineType: 'excavator', hourMeter: '', workAttribute: '', from: '07:00', to: '18:00', days: [1, 2, 3, 4, 5, 6], hourRate: '', billing: 'engine',
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!machine) return;
    const [from, to] = (machine.workSchedule || '07:00-18:00').split('-');
    const days = (machine.workDays || '1-6').split(',').flatMap((item) => {
      const [a, b] = item.split('-').map(Number);
      return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i);
    });
    setForm({
      machineMode: true, machineType: machine.machineType || 'other', hourMeter: machine.hourMeter ?? '', workAttribute: machine.workAttribute || '', from, to, days, hourRate: machine.hourRate ?? '', billing: machine.billing || 'engine',
    });
  }, [machine]);

  const set = (key, value) => setForm({ ...form, [key]: value });
  const save = async () => {
    setError(null);
    const response = await fetch(`/api/machinery/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        machineMode: form.machineMode,
        machineType: form.machineType,
        workAttribute: form.workAttribute,
        workSchedule: form.from && form.to ? `${form.from}-${form.to}` : '',
        workDays: [...form.days].sort().join(','),
        hourRate: form.hourRate === '' ? null : Number(form.hourRate),
        billing: form.billing,
        ...(form.hourMeter !== '' && Number(form.hourMeter) !== machine?.hourMeter ? { hourMeter: Number(form.hourMeter) } : {}),
      }),
    });
    if (response.ok) onSaved();
    else setError((await response.text()).split('\n')[0]);
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{`${t('machinerySettings')} · ${device.name}`}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <FormControlLabel control={<Switch checked={form.machineMode} onChange={(event) => set('machineMode', event.target.checked)} />} label={t('machineryMode')} />
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mt: 1 }}>
          <TextField select size="small" label={t('sharedType')} value={form.machineType} onChange={(event) => set('machineType', event.target.value)}>
            {MACHINE_TYPES.map((type) => <MenuItem key={type} value={type}>{typeLabel(t, type)}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={t('machineryHourMeterNow')} value={form.hourMeter} onChange={(event) => set('hourMeter', event.target.value)} helperText={t('machineryHourMeterHelp')} slotProps={{ input: { endAdornment: <InputAdornment position="end">h</InputAdornment> } }} />
          <TextField size="small" label={t('machineryWorkAttribute')} placeholder="in2, pto, io3" value={form.workAttribute} onChange={(event) => set('workAttribute', event.target.value)} helperText={t('machineryWorkAttributeHelp')} sx={{ gridColumn: '1 / -1' }} />
          <TextField size="small" type="time" label={t('machineryShiftFrom')} value={form.from} onChange={(event) => set('from', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="time" label={t('machineryShiftTo')} value={form.to} onChange={(event) => set('to', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5, mb: 0.5 }}>{t('machineryWorkDays')}</Typography>
        <Stack direction="row" spacing={0.5}>
          {DAYS.map((day) => (
            <Chip key={day} label={t(`machineryDay${day}`)} color={form.days.includes(day) ? 'primary' : 'default'} onClick={() => set('days', form.days.includes(day) ? form.days.filter((item) => item !== day) : [...form.days, day])} />
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mt: 2 }}>
          <TextField size="small" type="number" label={t('machineryHourRate')} value={form.hourRate} onChange={(event) => set('hourRate', event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start">S/</InputAdornment>, endAdornment: <InputAdornment position="end">/ h</InputAdornment> } }} />
          <TextField select size="small" label={t('machineryBilling')} value={form.billing} onChange={(event) => set('billing', event.target.value)}>
            <MenuItem value="engine">{t('machineryBillingEngine')}</MenuItem>
            <MenuItem value="work">{t('machineryBillingWork')}</MenuItem>
          </TextField>
        </Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>{t('machinerySettingsHelp')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MachineDialog;
