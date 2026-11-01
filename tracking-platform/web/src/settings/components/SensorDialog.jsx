import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel,
  Grid, IconButton, ListSubheader, MenuItem, Stack, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import FunctionsIcon from '@mui/icons-material/Functions';
import {
  Area, AreaChart, ResponsiveContainer, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../../common/components/LocalizationProvider';
import fetchOrThrow from '../../common/util/fetchOrThrow';
import {
  FUEL_DEFAULTS, SENSOR_GROUPS, SENSOR_TYPES, VALIDATIONS, formatSensorValue, sensorColor,
} from '../../common/util/sensors';
import {
  FUEL_UNITS, convertFuelSensor, fuelUnitLabel, isFuelSensor, normalizeFuelUnit,
} from '../../common/util/fuelUnits';

export const typeLabelKey = (type) => `sensorType${type.charAt(0).toUpperCase()}${type.slice(1)}`;
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const numberOrEmpty = (value) => (value === '' ? '' : Number(value));

const FUNCTIONS = ['abs()', 'round(x, 2)', 'min(a, b)', 'max(a, b)', 'if(c, a, b)', 'bit(x, n)'];

// Editor of one sensor, Wialon style: type by group, parameter or formula (with other sensors and bits), calibration
// table or multiplier, bounds, validation by another sensor, accumulation, smoothing, colors and texts, fuel
// detection, and a live preview computed by the server from the unit's last messages
const SensorDialog = ({
  fuelUnit,
  open, sensor: initial, sensors = [], deviceId, onClose, onSave,
}) => {
  const t = useTranslation();
  const theme = useTheme();

  const [sensor, setSensor] = useState(initial);
  const [source, setSource] = useState('parameter');
  const [conversion, setConversion] = useState('formula');
  const [tab, setTab] = useState('general');
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setSensor(initial);
    setSource(initial?.formula ? 'formula' : 'parameter');
    setConversion(initial?.calibration?.length ? 'table' : 'formula');
    setTab('general');
    setPaste('');
    setPreview(null);
  }, [initial]);

  const others = useMemo(() => sensors.filter((item) => item.id !== sensor?.id), [sensors, sensor?.id]);

  const cleaned = useMemo(() => {
    if (!sensor) return null;
    const defaults = { multiplier: 1, offset: 0, ...FUEL_DEFAULTS };
    const numbers = Object.fromEntries(Object.keys(defaults)
      .filter((key) => key in sensor && typeof defaults[key] === 'number')
      .map((key) => [key, sensor[key] === '' ? defaults[key] : Number(sensor[key])]));
    const optional = Object.fromEntries(['lowerBound', 'upperBound', 'threshold', 'rate', 'idleRate', 'smoothing']
      .map((key) => [key, sensor[key] === '' || sensor[key] === undefined || sensor[key] === null ? undefined : Number(sensor[key])]));
    const result = {
      ...sensor,
      ...numbers,
      ...optional,
      name: (sensor.name || '').trim(),
      formula: source === 'formula' ? (sensor.formula || '').trim() : undefined,
      source: source === 'formula' ? '' : sensor.source,
      calibration: conversion === 'table'
        ? (sensor.calibration || []).filter((point) => point.every((item) => item !== '' && !Number.isNaN(Number(item))))
          .map(([x, y]) => [Number(x), Number(y)]).sort((a, b) => a[0] - b[0])
        : [],
      ranges: (sensor.ranges || []).filter((range) => range.from !== '' && range.to !== ''),
    };
    Object.keys(result).forEach((key) => result[key] === undefined && delete result[key]);
    return result;
  }, [sensor, source, conversion]);

  // live preview: the whole set, with this sensor as edited, computed by the server
  useEffect(() => {
    if (!open || !cleaned || !deviceId) return undefined;
    const timer = setTimeout(async () => {
      const list = sensors.some((item) => item.id === cleaned.id)
        ? sensors.map((item) => (item.id === cleaned.id ? cleaned : item)) : [...sensors, cleaned];
      try {
        const response = await fetchOrThrow('/api/sensors/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, sensors: JSON.stringify(list) }),
        });
        setPreview(await response.json());
      } catch {
        setPreview(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [open, cleaned, deviceId]);

  if (!sensor) {
    return null;
  }

  const meta = SENSOR_TYPES[sensor.type] || {};
  const update = (changes) => setSensor({ ...sensor, ...changes });
  const parameters = Object.entries(preview?.parameters || {})
    .filter(([, value]) => ['number', 'boolean', 'string'].includes(typeof value))
    .map(([key, value]) => ({ key, value }));
  const calibration = sensor.calibration || [];
  const ranges = sensor.ranges || [];
  const value = preview?.values?.[sensor.id];
  const error = preview?.errors?.[sensor.id];
  const history = (preview?.history || []).map((point) => ({ time: point.time, value: Number(point.values?.[sensor.id]) }))
    .filter((point) => !Number.isNaN(point.value));

  const setPoint = (index, column, input) => update({
    calibration: calibration.map((point, i) => (i === index ? point.map((item, c) => (c === column ? input : item)) : point)),
  });
  const setRange = (index, changes) => update({ ranges: ranges.map((range, i) => (i === index ? { ...range, ...changes } : range)) });

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

  const insert = (text) => update({ formula: `${sensor.formula || ''}${sensor.formula ? ' ' : ''}${text}` });

  const valid = cleaned.name && !error
    && (meta.calculated || (source === 'formula' ? cleaned.formula : cleaned.source))
    && (conversion === 'formula' || cleaned.calibration.length >= 2);

  const changeType = (type) => {
    const next = SENSOR_TYPES[type];
    update({
      type,
      unit: next.unit ?? '',
      accumulate: next.accumulate,
      ...(type === 'fuel' ? {
        ...FUEL_DEFAULTS, ...sensor, type: 'fuel', unit: fuelUnit || 'L', accumulate: undefined,
      } : {}),
    });
  };

  const color = sensorColor(cleaned, value);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('sensorEdit')}</DialogTitle>
      <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ px: 3 }}>
        <Tab value="general" label={t('sensorTabGeneral')} />
        <Tab value="advanced" label={t('sensorTabAdvanced')} />
        <Tab value="display" label={t('sensorTabDisplay')} />
        {sensor.type === 'fuel' && <Tab value="fuel" label={t('sensorFuelDetection')} />}
      </Tabs>
      <DialogContent dividers>
        {tab === 'general' && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label={t('sharedName')} value={sensor.name} onChange={(event) => update({ name: event.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label={t('sensorType')} value={sensor.type} onChange={(event) => changeType(event.target.value)}>
                {SENSOR_GROUPS.flatMap((group) => [
                  <ListSubheader key={group}>{t(`sensorGroup${capitalize(group)}`)}</ListSubheader>,
                  ...Object.keys(SENSOR_TYPES).filter((type) => SENSOR_TYPES[type].group === group)
                    .map((type) => <MenuItem key={type} value={type}>{t(typeLabelKey(type))}</MenuItem>),
                ])}
              </TextField>
            </Grid>
            {!meta.calculated && (
              <Grid size={12}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{t('sensorSource')}</Typography>
                  <ToggleButtonGroup size="small" exclusive value={source} onChange={(_, next) => next && setSource(next)}>
                    <ToggleButton value="parameter">{t('sensorParameter')}</ToggleButton>
                    <ToggleButton value="formula"><FunctionsIcon fontSize="small" sx={{ mr: 0.5 }} />{t('sensorExpression')}</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
              </Grid>
            )}
            {!meta.calculated && source === 'parameter' && (
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
                  value={sensor.source || ''}
                  onChange={(_, next) => update({ source: typeof next === 'string' ? next : next?.key || '' })}
                  onInputChange={(_, next) => update({ source: next })}
                  renderInput={(params) => <TextField {...params} label={t('sensorParameter')} helperText={t('sensorSourceHelp')} />}
                />
              </Grid>
            )}
            {!meta.calculated && source === 'formula' && (
              <Grid size={12}>
                <TextField
                  fullWidth
                  label={t('sensorExpression')}
                  placeholder="io201 * 0.4 + #tank2"
                  value={sensor.formula || ''}
                  error={Boolean(error)}
                  helperText={error || t('sensorExpressionHelp')}
                  onChange={(event) => update({ formula: event.target.value })}
                  slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
                />
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  {parameters.slice(0, 14).map((item) => (
                    <Chip key={item.key} size="small" variant="outlined" label={`${item.key} = ${String(item.value).slice(0, 10)}`} onClick={() => insert(item.key)} />
                  ))}
                  {others.map((item) => <Chip key={item.id} size="small" color="primary" variant="outlined" label={`#${item.id} ${item.name}`} onClick={() => insert(`#${item.id}`)} />)}
                  {FUNCTIONS.map((item) => <Chip key={item} size="small" label={item} onClick={() => insert(item)} sx={{ fontFamily: 'monospace' }} />)}
                </Stack>
              </Grid>
            )}
            {!meta.text && !meta.digital && (
              <Grid size={{ xs: 12, sm: source === 'parameter' && !meta.calculated ? 4 : 6 }}>
                {isFuelSensor(sensor) ? (
                  <TextField fullWidth select label={t('sensorUnit')} value={normalizeFuelUnit(sensor.unit)} onChange={(event) => update(convertFuelSensor(sensor, event.target.value))} helperText={t('fuelUnitSensorHint')}>
                    {FUEL_UNITS.map((unit) => <MenuItem key={unit} value={unit}>{fuelUnitLabel(unit, t)}</MenuItem>)}
                  </TextField>
                ) : (
                  <TextField fullWidth label={t('sensorUnit')} value={sensor.unit || ''} onChange={(event) => update({ unit: event.target.value })} />
                )}
              </Grid>
            )}
            {meta.digital && (
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControlLabel control={<Switch checked={Boolean(sensor.invert)} onChange={(event) => update({ invert: event.target.checked })} />} label={t('sensorInvert')} />
              </Grid>
            )}
            {meta.threshold && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth type="number" label={t('sensorThreshold')} helperText={t('sensorThresholdHelp')} value={sensor.threshold ?? ''} onChange={(event) => update({ threshold: numberOrEmpty(event.target.value) })} />
              </Grid>
            )}
            {meta.calculated && (
              <>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField fullWidth type="number" label={t('sensorRate')} value={sensor.rate ?? ''} onChange={(event) => update({ rate: numberOrEmpty(event.target.value) })} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField fullWidth type="number" label={t('sensorIdleRate')} value={sensor.idleRate ?? ''} onChange={(event) => update({ idleRate: numberOrEmpty(event.target.value) })} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField fullWidth type="number" label={t('sensorSpeedThreshold')} value={sensor.speedThreshold ?? 5} onChange={(event) => update({ speedThreshold: numberOrEmpty(event.target.value) })} />
                </Grid>
              </>
            )}

            {!meta.digital && !meta.text && !meta.calculated && (
              <>
                <Grid size={12}><Divider /></Grid>
                <Grid size={12}>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{t('sensorConversion')}</Typography>
                    <ToggleButtonGroup size="small" exclusive value={conversion} onChange={(_, next) => next && setConversion(next)}>
                      <ToggleButton value="formula">{t('sensorFormula')}</ToggleButton>
                      <ToggleButton value="table">{t('sensorCalibration')}</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                </Grid>
                {conversion === 'formula' ? (
                  <>
                    <Grid size={6}>
                      <TextField fullWidth type="number" label={t('sensorMultiplier')} value={sensor.multiplier ?? 1} onChange={(event) => update({ multiplier: numberOrEmpty(event.target.value) })} />
                    </Grid>
                    <Grid size={6}>
                      <TextField fullWidth type="number" label={t('sensorOffset')} value={sensor.offset ?? 0} onChange={(event) => update({ offset: numberOrEmpty(event.target.value) })} />
                    </Grid>
                  </>
                ) : (
                  <>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>{t('sensorCalibrationHelp')}</Typography>
                      {calibration.map((point, index) => (
                        <Stack key={index} direction="row" spacing={1} sx={{ mb: 1 }}>
                          <TextField size="small" type="number" label={t('sensorRaw')} value={point[0]} onChange={(event) => setPoint(index, 0, event.target.value)} />
                          <TextField size="small" type="number" label={sensor.unit || t('sensorValue')} value={point[1]} onChange={(event) => setPoint(index, 1, event.target.value)} />
                          <IconButton size="small" onClick={() => update({ calibration: calibration.filter((_, i) => i !== index) })}><DeleteIcon fontSize="small" /></IconButton>
                        </Stack>
                      ))}
                      <Button size="small" startIcon={<AddIcon />} onClick={() => update({ calibration: [...calibration, ['', '']] })}>{t('sensorAddPoint')}</Button>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField fullWidth multiline minRows={5} label={t('sensorPasteTable')} placeholder={'0;0\n1024;100\n2048;210\n4095;400'} value={paste} onChange={(event) => setPaste(event.target.value)} />
                      <Button size="small" sx={{ mt: 1 }} onClick={importPaste} disabled={!paste.trim()}>{t('sensorImport')}</Button>
                    </Grid>
                  </>
                )}
              </>
            )}
          </Grid>
        )}

        {tab === 'advanced' && (
          <Grid container spacing={2}>
            {!meta.digital && !meta.text && (
              <>
                <Grid size={6}>
                  <TextField fullWidth type="number" label={t('sensorLowerBound')} value={sensor.lowerBound ?? ''} onChange={(event) => update({ lowerBound: numberOrEmpty(event.target.value) })} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth type="number" label={t('sensorUpperBound')} value={sensor.upperBound ?? ''} onChange={(event) => update({ upperBound: numberOrEmpty(event.target.value) })} helperText={t('sensorBoundsHelp')} />
                </Grid>
              </>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label={t('sensorValidator')} value={sensor.validatorId || ''} onChange={(event) => update({ validatorId: event.target.value || undefined })} helperText={t('sensorValidatorHelp')}>
                <MenuItem value="">{t('sharedNone')}</MenuItem>
                {others.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth disabled={!sensor.validatorId} label={t('sensorValidation')} value={sensor.validation || 'nonZero'} onChange={(event) => update({ validation: event.target.value })}>
                {VALIDATIONS.map((item) => <MenuItem key={item} value={item}>{t(`sensorValidation${capitalize(item)}`)}</MenuItem>)}
              </TextField>
            </Grid>
            {!meta.digital && !meta.text && !meta.calculated && (
              <>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField select fullWidth label={t('sensorAccumulate')} value={sensor.accumulate || ''} onChange={(event) => update({ accumulate: event.target.value || undefined })} helperText={t('sensorAccumulateHelp')}>
                    <MenuItem value="">{t('sensorAccumulateNone')}</MenuItem>
                    <MenuItem value="increment">{t('sensorAccumulateIncrement')}</MenuItem>
                    <MenuItem value="delta">{t('sensorAccumulateDelta')}</MenuItem>
                    <MenuItem value="time">{t('sensorAccumulateTime')}</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField select fullWidth label={t('sensorSmoothing')} value={sensor.smoothing || 0} onChange={(event) => update({ smoothing: Number(event.target.value) })} helperText={t('sensorSmoothingHelp')}>
                    {[0, 3, 5, 10, 20].map((item) => <MenuItem key={item} value={item}>{item ? `${item} ${t('sensorMessages')}` : t('sharedNone')}</MenuItem>)}
                  </TextField>
                </Grid>
              </>
            )}
            <Grid size={12}>
              <TextField fullWidth multiline minRows={2} label={t('sharedDescription')} value={sensor.description || ''} onChange={(event) => update({ description: event.target.value })} />
            </Grid>
          </Grid>
        )}

        {tab === 'display' && (
          <Grid container spacing={2}>
            {meta.digital && (
              <>
                <Grid size={6}>
                  <TextField fullWidth label={t('sensorOnLabel')} placeholder={t('sensorOn')} value={sensor.onLabel || ''} onChange={(event) => update({ onLabel: event.target.value })} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth label={t('sensorOffLabel')} placeholder={t('sensorOff')} value={sensor.offLabel || ''} onChange={(event) => update({ offLabel: event.target.value })} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth type="color" label={t('sensorOnColor')} value={sensor.onColor || '#2e7d32'} onChange={(event) => update({ onColor: event.target.value })} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth type="color" label={t('sensorOffColor')} value={sensor.offColor || '#9e9e9e'} onChange={(event) => update({ offColor: event.target.value })} />
                </Grid>
              </>
            )}
            {!meta.digital && !meta.text && (
              <Grid size={12}>
                <Typography variant="subtitle2" gutterBottom>{t('sensorRanges')}</Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>{t('sensorRangesHelp')}</Typography>
                {ranges.map((range, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <TextField size="small" type="number" label={t('sensorFrom')} value={range.from} onChange={(event) => setRange(index, { from: event.target.value })} sx={{ width: 110 }} />
                    <TextField size="small" type="number" label={t('sensorTo')} value={range.to} onChange={(event) => setRange(index, { to: event.target.value })} sx={{ width: 110 }} />
                    <TextField size="small" type="color" label={t('sensorColor')} value={range.color || '#1565c0'} onChange={(event) => setRange(index, { color: event.target.value })} sx={{ width: 90 }} />
                    <TextField size="small" label={t('sensorRangeText')} value={range.text || ''} onChange={(event) => setRange(index, { text: event.target.value })} sx={{ flexGrow: 1 }} />
                    <IconButton size="small" onClick={() => update({ ranges: ranges.filter((_, i) => i !== index) })}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => update({ ranges: [...ranges, { from: '', to: '', color: '#1565c0', text: '' }] })}>{t('sensorAddRange')}</Button>
              </Grid>
            )}
            <Grid size={12}>
              <FormControlLabel control={<Switch checked={sensor.hidden !== true} onChange={(event) => update({ hidden: !event.target.checked })} />} label={t('sensorShowInCard')} />
            </Grid>
          </Grid>
        )}

        {tab === 'fuel' && (
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
              <TextField select fullWidth label={t('sensorFilter')} helperText={t('sensorFilterHelp')} value={sensor.filter ?? 5} onChange={(event) => update({ filter: Number(event.target.value) })}>
                {[1, 3, 5, 7, 9, 11, 15].map((item) => <MenuItem key={item} value={item}>{item === 1 ? t('sensorFilterNone') : item}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField fullWidth type="number" label={t('sensorSpeedThreshold')} value={sensor.speedThreshold ?? 5} onChange={(event) => update({ speedThreshold: numberOrEmpty(event.target.value) })} />
            </Grid>
            <Grid size={12}>
              <FormControlLabel control={<Switch checked={sensor.stoppedOnly !== false} onChange={(event) => update({ stoppedOnly: event.target.checked })} />} label={t('sensorStoppedOnly')} />
            </Grid>
          </Grid>
        )}

        <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="caption" color="text.secondary">{t('sensorLivePreview')}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: color || 'text.primary' }}>
                {preview ? formatSensorValue(cleaned, value, t) : '…'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {preview?.time ? `${t('sensorLastMessage')} ${dayjs(preview.time).format('DD/MM HH:mm')}` : t('sensorNoData')}
              </Typography>
            </Box>
            <Box sx={{ width: 260, height: 56 }}>
              {history.length > 1 && (
                <ResponsiveContainer>
                  <AreaChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Area type={meta.digital ? 'stepAfter' : 'monotone'} dataKey="value" stroke={theme.palette.primary.main} fill={alpha(theme.palette.primary.main, 0.15)} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Stack>
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={() => onSave(cleaned)} disabled={!valid}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SensorDialog;
