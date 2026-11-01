import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, LinearProgress, Stack, Switch, TextField, Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';

// Settings of one asset (expected interval, low battery, voltage range when it reports volts) and its battery over
// the last 30 days; can send the interval to the tracker
const AssetDialog = ({ device, asset, onClose, onSaved }) => {
  const t = useTranslation();
  const [form, setForm] = useState({
    assetMode: true, reportHours: 24, batteryLow: 20, batteryFullVolts: '', batteryEmptyVolts: '',
  });
  const [battery, setBattery] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (asset) {
      setForm({
        assetMode: true, reportHours: asset.reportHours, batteryLow: asset.batteryLow, batteryFullVolts: asset.batteryFullVolts ?? '', batteryEmptyVolts: asset.batteryEmptyVolts ?? '',
      });
      fetch(`/api/assets/${device.id}/battery?days=30`).then((response) => response.json()).then(setBattery);
    }
  }, [asset]);

  const number = (value) => (value === '' || value === null ? null : Number(value));
  const save = async () => {
    const response = await fetch(`/api/assets/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetMode: form.assetMode, reportHours: number(form.reportHours), batteryLow: number(form.batteryLow), batteryFullVolts: number(form.batteryFullVolts), batteryEmptyVolts: number(form.batteryEmptyVolts),
      }),
    });
    if (response.ok) onSaved();
    else setMessage({ severity: 'error', text: (await response.text()).split('\n')[0] });
  };
  const sendInterval = async () => {
    const response = await fetch(`/api/assets/${device.id}/interval`, { method: 'POST' });
    const result = response.ok ? await response.json() : null;
    setMessage(result ? { severity: 'success', text: t(result.status === 'queued' ? 'assetsIntervalQueued' : 'assetsIntervalSent') } : { severity: 'error', text: t('assetsIntervalFailed') });
  };
  const field = (key, label, unit) => (
    <TextField size="small" type="number" label={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }} />
  );

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{`${t('assetsSettings')} · ${device.name}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
          <FormControlLabel control={<Switch checked={form.assetMode} onChange={(event) => setForm({ ...form, assetMode: event.target.checked })} />} label={t('assetsMode')} />
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' } }}>
            {field('reportHours', t('assetsReportEvery'), 'h')}
            {field('batteryLow', t('assetsBatteryLow'), '%')}
            {field('batteryFullVolts', t('assetsFullVolts'), 'V')}
            {field('batteryEmptyVolts', t('assetsEmptyVolts'), 'V')}
          </Box>
          <Typography variant="caption" color="text.secondary">{t('assetsSettingsHelp')}</Typography>
          {asset && (
            <>
              <Typography variant="subtitle2" fontWeight={700}>{t('assetsBatteryHistory')}</Typography>
              {!battery && <LinearProgress />}
              {battery && (
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer>
                    <AreaChart data={battery.points.map((point) => ({ ...point, label: dayjs(point.time).format('DD/MM') }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={11} minTickGap={30} />
                      <YAxis domain={[0, 100]} unit="%" fontSize={11} />
                      <ChartTooltip />
                      <ReferenceLine y={Number(form.batteryLow)} stroke="#d9534f" strokeDasharray="4 4" />
                      <Area dataKey="battery" stroke="#2f9e5b" fill="#2f9e5b33" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
              {battery?.dropPerDay != null && (
                <Typography variant="body2">{t('assetsTrend').replace('{0}', battery.dropPerDay).replace('{1}', battery.reports).replace('{2}', battery.averageIntervalHours ?? '—')}</Typography>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {asset && <Button startIcon={<SendIcon />} onClick={sendInterval} sx={{ mr: 'auto' }}>{t('assetsSendInterval')}</Button>}
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssetDialog;
