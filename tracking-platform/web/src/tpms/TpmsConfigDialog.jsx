import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { useTranslation } from '../common/components/LocalizationProvider';
import TireDiagram from './TireDiagram';

const PRESETS = {
  car: [2, 2], van: [2, 4], truck: [2, 4, 4], tractor: [2, 4, 4], bus: [2, 4], trailer: [4, 4, 4],
};

// Layout and limits of the tires of one vehicle: axles (2 or 4 tires), position attributes with {n}, unit the
// device reports and the one to show, pressure range and maximum temperature, own names per tire
const TpmsConfigDialog = ({ device, initial, onClose, onSaved }) => {
  const t = useTranslation();
  const [config, setConfig] = useState({
    axles: [2, 4], pressureAttribute: 'tire{n}Pressure', temperatureAttribute: 'tire{n}Temperature', sourceUnit: 'psi', unit: 'psi', minPressure: 90, maxPressure: 130, maxTemperature: 75, names: {},
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initial) setConfig({ ...initial, names: initial.names || {} });
  }, [initial]);

  const set = (key, value) => setConfig({ ...config, [key]: value });
  const setAxle = (index, wheels) => set('axles', config.axles.map((value, i) => (i === index ? wheels : value)));
  const total = config.axles.reduce((sum, value) => sum + value, 0);

  const save = async (enabled = true) => {
    setError(null);
    const response = await fetch(`/api/tpms/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enabled ? {
        ...config, minPressure: Number(config.minPressure), maxPressure: Number(config.maxPressure), maxTemperature: Number(config.maxTemperature),
      } : { enabled: false }),
    });
    if (response.ok) onSaved(await response.json());
    else setError((await response.text()).split('\n')[0]);
  };

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{`${t('tpmsConfigure')} · ${device.name}`}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 260px' } }}>
          <Stack spacing={1.5}>
            <TextField select size="small" label={t('tpmsPreset')} value="" onChange={(event) => set('axles', PRESETS[event.target.value])}>
              {Object.keys(PRESETS).map((key) => <MenuItem key={key} value={key}>{t(`tpmsPreset${key.charAt(0).toUpperCase()}${key.slice(1)}`)}</MenuItem>)}
            </TextField>
            {config.axles.map((wheels, index) => (
              <Stack key={`axle-${index}`} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ width: 70 }}>{`${t('tpmsAxle')} ${index + 1}`}</Typography>
                <TextField select size="small" value={wheels} onChange={(event) => setAxle(index, Number(event.target.value))} sx={{ width: 160 }}>
                  <MenuItem value={2}>{t('tpmsSingle')}</MenuItem>
                  <MenuItem value={4}>{t('tpmsDual')}</MenuItem>
                </TextField>
                {config.axles.length > 1 && <IconButton size="small" onClick={() => set('axles', config.axles.filter((_, i) => i !== index))}><RemoveIcon fontSize="small" /></IconButton>}
              </Stack>
            ))}
            {config.axles.length < 8 && <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => set('axles', [...config.axles, 4])}>{t('tpmsAddAxle')}</Button>}
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField size="small" label={t('tpmsPressureAttribute')} value={config.pressureAttribute} onChange={(event) => set('pressureAttribute', event.target.value)} helperText={t('tpmsAttributeHelp')} />
              <TextField size="small" label={t('tpmsTemperatureAttribute')} value={config.temperatureAttribute} onChange={(event) => set('temperatureAttribute', event.target.value)} />
              <TextField select size="small" label={t('tpmsSourceUnit')} value={config.sourceUnit} onChange={(event) => set('sourceUnit', event.target.value)}>
                {['psi', 'bar', 'kPa'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <TextField select size="small" label={t('tpmsUnit')} value={config.unit} onChange={(event) => set('unit', event.target.value)}>
                {['psi', 'bar', 'kPa'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <TextField size="small" type="number" label={`${t('tpmsMinPressure')} (${config.unit})`} value={config.minPressure} onChange={(event) => set('minPressure', event.target.value)} />
              <TextField size="small" type="number" label={`${t('tpmsMaxPressure')} (${config.unit})`} value={config.maxPressure} onChange={(event) => set('maxPressure', event.target.value)} />
              <TextField size="small" type="number" label={`${t('tpmsMaxTemperature')} (°C)`} value={config.maxTemperature} onChange={(event) => set('maxTemperature', event.target.value)} />
            </Box>
            <Typography variant="subtitle2" fontWeight={700}>{t('tpmsNames')}</Typography>
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <TextField key={n} size="small" label={`${t('tpmsTire')} ${n}`} value={config.names[n] || ''} onChange={(event) => set('names', { ...config.names, [n]: event.target.value })} />
              ))}
            </Box>
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">{t('tpmsLayoutPreview')}</Typography>
            <TireDiagram config={config} wheels={[]} size="small" unit={config.unit} t={t} />
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>{t('tpmsNumberingHelp')}</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        {initial && <Button color="error" onClick={() => save(false)} sx={{ mr: 'auto' }}>{t('tpmsDisable')}</Button>}
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={() => save(true)}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TpmsConfigDialog;
