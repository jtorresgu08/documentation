import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, IconButton, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from '../../common/components/LocalizationProvider';
import {
  FUEL_DEFAULTS, SENSOR_TYPES, convertRaw, formatSensorValue,
} from '../../common/util/sensors';

const typeLabelKey = (type) => `sensorType${type.charAt(0).toUpperCase()}${type.slice(1)}`;

const numberOrEmpty = (value) => (value === '' ? '' : Number(value));

// Editor of one sensor: parameter, conversion (multiplier or calibration table) and, for fuel, fill / drain detection
const SensorDialog = ({
  open, sensor: initial, deviceId, onClose, onSave,
}) => {
  const t = useTranslation();
  const position = useSelector((state) => state.session.positions[deviceId]);

  const [sensor, setSensor] = useState(initial);
  const [mode, setMode] = useState('formula');
  const [paste, setPaste] = useState('');

  useEffect(() => {
    setSensor(initial);
    setMode(initial?.calibration?.length ? 'table' : 'formula');
    setPaste('');
  }, [initial]);

  if (!sensor) {
    return null;
  }

  const update = (changes) => setSensor({ ...sensor, ...changes });
  const parameters = Object.entries(position?.attributes || {})
    .filter(([key, value]) => !key.startsWith('sensor.') && ['number', 'boolean'].includes(typeof value))
    .map(([key, value]) => ({ key, value }));
  const raw = position?.attributes?.[sensor.source];
  const preview = convertRaw(mode === 'table' ? sensor : { ...sensor, calibration: [] }, raw);
  const calibration = sensor.calibration || [];

  const setPoint = (index, column, value) => update({
    calibration: calibration.map((point, i) => (i === index
      ? point.map((item, c) => (c === column ? value : item)) : point)),
  });

  const importPaste = () => {
    const points = paste.split(/\r?\n/)
      .map((line) => line.trim().split(/[\s;,\t]+/).map(Number))
      .filter((point) => point.length >= 2 && !point.slice(0, 2).some(Number.isNaN))
      .map((point) => point.slice(0, 2));
    if (points.length) {
      update({ calibration: points.sort((a, b) => a[0] - b[0]) });
      setPaste('');
    }
  };

  const save = () => {
    const defaults = { multiplier: 1, offset: 0, ...FUEL_DEFAULTS };
    const numbers = Object.fromEntries(Object.keys(defaults)
      .filter((key) => key in sensor && typeof defaults[key] === 'number')
      .map((key) => [key, sensor[key] === '' ? defaults[key] : Number(sensor[key])]));
    const cleaned = {
      ...sensor,
      ...numbers,
      name: sensor.name.trim(),
      calibration: mode === 'table'
        ? calibration.filter((point) => point.every((item) => item !== '' && !Number.isNaN(Number(item))))
          .map(([x, y]) => [Number(x), Number(y)]).sort((a, b) => a[0] - b[0])
        : [],
    };
    onSave(cleaned);
  };

  const valid = sensor.name.trim() && sensor.source
    && (mode === 'formula' || calibration.filter((point) => point.every((item) => item !== '')).length >= 2);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('sensorEdit')}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label={t('sharedName')} value={sensor.name} onChange={(event) => update({ name: event.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              label={t('sensorType')}
              value={sensor.type}
              onChange={(event) => update({
                type: event.target.value,
                unit: SENSOR_TYPES[event.target.value].unit,
                ...(event.target.value === 'fuel' ? { ...FUEL_DEFAULTS, ...sensor, type: 'fuel', unit: 'L' } : {}),
              })}
            >
              {Object.keys(SENSOR_TYPES).map((type) => (
                <MenuItem key={type} value={type}>{t(typeLabelKey(type))}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Autocomplete
              freeSolo
              options={parameters}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.key)}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.key} sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flexGrow: 1 }}>{option.key}</Box>
                  <Typography variant="body2" color="text.secondary">{String(option.value)}</Typography>
                </Box>
              )}
              value={sensor.source}
              onChange={(_, value) => update({ source: typeof value === 'string' ? value : value?.key || '' })}
              onInputChange={(_, value) => update({ source: value })}
              renderInput={(params) => (
                <TextField {...params} label={t('sensorSource')} helperText={t('sensorSourceHelp')} />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            {sensor.type === 'binary' ? (
              <FormControlLabel
                control={<Switch checked={Boolean(sensor.invert)} onChange={(event) => update({ invert: event.target.checked })} />}
                label={t('sensorInvert')}
              />
            ) : (
              <TextField fullWidth label={t('sensorUnit')} value={sensor.unit || ''} onChange={(event) => update({ unit: event.target.value })} />
            )}
          </Grid>
          {sensor.type === 'binary' && (
            <>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth label={t('sensorOnLabel')} placeholder={t('sensorOn')} value={sensor.onLabel || ''} onChange={(event) => update({ onLabel: event.target.value })} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth label={t('sensorOffLabel')} placeholder={t('sensorOff')} value={sensor.offLabel || ''} onChange={(event) => update({ offLabel: event.target.value })} />
              </Grid>
            </>
          )}
        </Grid>

        {sensor.type !== 'binary' && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{t('sensorConversion')}</Typography>
              <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, value) => value && setMode(value)}>
                <ToggleButton value="formula">{t('sensorFormula')}</ToggleButton>
                <ToggleButton value="table">{t('sensorCalibration')}</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {mode === 'formula' ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField fullWidth type="number" label={t('sensorMultiplier')} value={sensor.multiplier ?? 1} onChange={(event) => update({ multiplier: numberOrEmpty(event.target.value) })} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField fullWidth type="number" label={t('sensorOffset')} value={sensor.offset ?? 0} onChange={(event) => update({ offset: numberOrEmpty(event.target.value) })} />
                </Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>{t('sensorCalibrationHelp')}</Typography>
                  {calibration.map((point, index) => (
                    <Stack key={index} direction="row" spacing={1} sx={{ mb: 1 }}>
                      <TextField size="small" type="number" label={t('sensorRaw')} value={point[0]} onChange={(event) => setPoint(index, 0, event.target.value)} />
                      <TextField size="small" type="number" label={sensor.unit || t('sensorValue')} value={point[1]} onChange={(event) => setPoint(index, 1, event.target.value)} />
                      <IconButton size="small" onClick={() => update({ calibration: calibration.filter((_, i) => i !== index) })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => update({ calibration: [...calibration, ['', '']] })}>
                    {t('sensorAddPoint')}
                  </Button>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={5}
                    label={t('sensorPasteTable')}
                    placeholder={'0;0\n1024;100\n2048;210\n4095;400'}
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                  />
                  <Button size="small" sx={{ mt: 1 }} onClick={importPaste} disabled={!paste.trim()}>{t('sensorImport')}</Button>
                </Grid>
              </Grid>
            )}
          </>
        )}

        {sensor.type === 'fuel' && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" gutterBottom>{t('sensorFuelDetection')}</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField fullWidth type="number" label={t('sensorTankCapacity')} value={sensor.tankCapacity ?? 0} onChange={(event) => update({ tankCapacity: numberOrEmpty(event.target.value) })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField fullWidth type="number" label={t('sensorMinFill')} value={sensor.minFill ?? 10} onChange={(event) => update({ minFill: numberOrEmpty(event.target.value) })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField fullWidth type="number" label={t('sensorMinDrain')} value={sensor.minDrain ?? 10} onChange={(event) => update({ minDrain: numberOrEmpty(event.target.value) })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField fullWidth type="number" label={t('sensorWaitTime')} helperText={t('sensorWaitTimeHelp')} value={sensor.waitTime ?? 120} onChange={(event) => update({ waitTime: numberOrEmpty(event.target.value) })} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField
                  select
                  fullWidth
                  label={t('sensorFilter')}
                  helperText={t('sensorFilterHelp')}
                  value={sensor.filter ?? 5}
                  onChange={(event) => update({ filter: Number(event.target.value) })}
                >
                  {[1, 3, 5, 7, 9, 11, 15].map((value) => (
                    <MenuItem key={value} value={value}>{value === 1 ? t('sensorFilterNone') : value}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: 4 }}>
                <TextField fullWidth type="number" label={t('sensorSpeedThreshold')} value={sensor.speedThreshold ?? 5} onChange={(event) => update({ speedThreshold: numberOrEmpty(event.target.value) })} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Switch checked={sensor.stoppedOnly !== false} onChange={(event) => update({ stoppedOnly: event.target.checked })} />}
                  label={t('sensorStoppedOnly')}
                />
              </Grid>
            </Grid>
          </>
        )}

        {sensor.source && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {raw === undefined
              ? t('sensorNoData')
              : `${t('sensorCurrent')}: ${sensor.source} = ${String(raw)} → ${formatSensorValue(sensor, preview, t)}`}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!valid}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SensorDialog;
