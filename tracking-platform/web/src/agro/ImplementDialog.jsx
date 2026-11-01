import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';

export const IMPLEMENT_TYPES = ['planter', 'sprayer', 'harvester', 'plow', 'harrow', 'spreader', 'mower', 'other'];

// Implement: name, type, working width, how to know it works (an input of the tracker or a speed range) and units
const ImplementDialog = ({ implement, onClose, onSaved }) => {
  const t = useTranslation();
  const devices = useSelector((state) => Object.values(state.devices.items).sort((a, b) => a.name.localeCompare(b.name)));
  const [form, setForm] = useState({
    name: '', type: 'planter', width: '', workAttribute: '', minSpeed: 3, maxSpeed: 15, deviceIds: [],
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (implement) setForm({ ...implement, workAttribute: implement.workAttribute || '', minSpeed: implement.minSpeed || '', maxSpeed: implement.maxSpeed || '' });
  }, [implement]);

  const set = (key, value) => setForm({ ...form, [key]: value });
  const save = async () => {
    setError(null);
    const response = await fetch(implement ? `/api/agro/implements/${implement.id}` : '/api/agro/implements', {
      method: implement ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form, width: Number(form.width), minSpeed: Number(form.minSpeed) || 0, maxSpeed: Number(form.maxSpeed) || 0,
      }),
    });
    if (response.ok) onSaved();
    else setError((await response.text()).split('\n')[0]);
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{implement ? t('agroEditImplement') : t('agroNewImplement')}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField size="small" label={t('sharedName')} value={form.name} onChange={(event) => set('name', event.target.value)} sx={{ gridColumn: '1 / -1' }} />
          <TextField select size="small" label={t('sharedType')} value={form.type || 'other'} onChange={(event) => set('type', event.target.value)}>
            {IMPLEMENT_TYPES.map((type) => <MenuItem key={type} value={type}>{t(`agroType${type.charAt(0).toUpperCase()}${type.slice(1)}`)}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={t('agroWidth')} value={form.width} onChange={(event) => set('width', event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} />
          <TextField size="small" label={t('agroWorkAttribute')} placeholder="in1, io2, pto" value={form.workAttribute} onChange={(event) => set('workAttribute', event.target.value)} sx={{ gridColumn: '1 / -1' }} helperText={t('agroWorkAttributeHelp')} />
          <TextField size="small" type="number" label={t('agroMinSpeed')} value={form.minSpeed} disabled={Boolean(form.workAttribute)} onChange={(event) => set('minSpeed', event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }} />
          <TextField size="small" type="number" label={t('agroMaxSpeed')} value={form.maxSpeed} disabled={Boolean(form.workAttribute)} onChange={(event) => set('maxSpeed', event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }} />
          <Autocomplete
            multiple
            sx={{ gridColumn: '1 / -1' }}
            options={devices}
            getOptionLabel={(option) => option.name}
            value={devices.filter((device) => form.deviceIds.includes(device.id))}
            onChange={(_, next) => set('deviceIds', next.map((device) => device.id))}
            renderInput={(params) => <TextField {...params} size="small" label={t('agroUnits')} />}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>{t('agroImplementHelp')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImplementDialog;
