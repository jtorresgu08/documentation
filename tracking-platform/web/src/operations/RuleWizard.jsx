import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Grid, IconButton, MenuItem, Radio, RadioGroup, Stack, Step, StepButton, Stepper, Switch, Table,
  TableBody, TableCell, TableRow, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ScienceIcon from '@mui/icons-material/Science';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { parseSensors, SENSOR_TYPES } from '../common/util/sensors';
import { SEVERITIES, SEVERITY_COLORS, capitalize } from './alertUtils';
import {
  DAYS, EXTRA_KINDS, OPERATORS, RULE_EVENTS, RULE_TYPES, VARIABLES,
} from './alertRuleTypes';
import { RULE_ICONS } from './ruleIcons';

const STEPS = ['type', 'condition', 'units', 'schedule', 'actions', 'review'];

const num = (value) => (value === '' || value === undefined || value === null ? '' : Number(value));

// Value comparison fields: operator and value, or minimum and maximum for ranges
const Comparison = ({ value, onChange, t, unit }) => {
  const op = value.op || 'gt';
  const range = op === 'between' || op === 'outside';
  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField select fullWidth size="small" label={t('ruleOperator')} value={op} onChange={(event) => onChange({ ...value, op: event.target.value })}>
          {OPERATORS.map((item) => <MenuItem key={item} value={item}>{t(`ruleOp${capitalize(item)}`)}</MenuItem>)}
        </TextField>
      </Grid>
      {range ? (
        <>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField fullWidth size="small" type="number" label={`${t('ruleMin')}${unit ? ` (${unit})` : ''}`} value={value.min ?? ''} onChange={(event) => onChange({ ...value, min: num(event.target.value) })} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField fullWidth size="small" type="number" label={`${t('ruleMax')}${unit ? ` (${unit})` : ''}`} value={value.max ?? ''} onChange={(event) => onChange({ ...value, max: num(event.target.value) })} />
          </Grid>
        </>
      ) : (
        <Grid size={{ xs: 12, sm: 8 }}>
          <TextField fullWidth size="small" label={`${op === 'change' ? t('ruleChangeBy') : t('ruleValue')}${unit ? ` (${unit})` : ''}`} value={value.value ?? ''} onChange={(event) => onChange({ ...value, value: event.target.value === '' || Number.isNaN(Number(event.target.value)) ? event.target.value : Number(event.target.value) })} />
        </Grid>
      )}
    </>
  );
};

// Sensor chooser: by name (same name on every unit of the fleet) or any sensor of a type
const SensorPicker = ({
  value, onChange, names, t, digitalOnly,
}) => {
  const byType = Boolean(value.sensorType);
  return (
    <>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField select fullWidth size="small" label={t('ruleSensorBy')} value={byType ? 'type' : 'name'} onChange={(event) => onChange(event.target.value === 'type' ? { ...value, sensorName: undefined, sensorType: digitalOnly ? 'door' : 'temperature' } : { ...value, sensorType: undefined, sensorName: names[0] || '' })}>
          <MenuItem value="name">{t('ruleSensorByName')}</MenuItem>
          <MenuItem value="type">{t('ruleSensorByType')}</MenuItem>
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, sm: 8 }}>
        {byType ? (
          <TextField select fullWidth size="small" label={t('sensorType')} value={value.sensorType} onChange={(event) => onChange({ ...value, sensorType: event.target.value })}>
            {Object.keys(SENSOR_TYPES).filter((type) => !digitalOnly || SENSOR_TYPES[type].digital).map((type) => (
              <MenuItem key={type} value={type}>{t(`sensorType${capitalize(type)}`)}</MenuItem>
            ))}
          </TextField>
        ) : (
          <Autocomplete freeSolo size="small" options={names} value={value.sensorName || ''} onInputChange={(_, next) => onChange({ ...value, sensorName: next })} renderInput={(params) => <TextField {...params} label={t('ruleSensorName')} />} />
        )}
      </Grid>
    </>
  );
};

// Wizard of a custom alert: kind, condition (+ extra conditions), units, schedule and limits, actions and message,
// and a review with "test now" against the units' latest messages
const RuleWizard = ({ open, initial, onClose, onSaved }) => {
  const t = useTranslation();
  const theme = useTheme();
  const devices = useSelector((state) => state.devices.items);
  const groups = useSelector((state) => state.groups.items);
  const geofences = useSelector((state) => state.geofences.items);
  const positions = useSelector((state) => state.session.positions);
  const [rule, setRule] = useState(initial);
  const [step, setStep] = useState(0);
  const [notificators, setNotificators] = useState(['web']);
  const [test, setTest] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRule(initial);
      setStep(initial?.id ? 1 : 0);
      setTest(null);
      setError(null);
      fetchOrThrow('/api/notifications/notificators').then((response) => response.json())
        .then((items) => setNotificators(items.map((item) => item.type).filter((type) => type !== 'command'))).catch(() => {});
    }
  }, [open, initial]);

  const sensorNames = useMemo(() => [...new Set(Object.values(devices).flatMap((device) => parseSensors(device).map((sensor) => sensor.name)))].sort(), [devices]);
  const digitalNames = useMemo(() => [...new Set(Object.values(devices).flatMap((device) => parseSensors(device).filter((sensor) => SENSOR_TYPES[sensor.type]?.digital).map((sensor) => sensor.name)))].sort(), [devices]);
  const parameters = useMemo(() => [...new Set(Object.values(positions).flatMap((position) => Object.keys(position.attributes || {}).filter((key) => !key.startsWith('sensor.'))))].sort(), [positions]);

  if (!rule) return null;
  const config = rule.config;
  const condition = config.condition || {};
  const setConfig = (changes) => setRule({ ...rule, config: { ...config, ...changes } });
  const setCondition = (changes) => setConfig({ condition: { ...condition, ...changes } });
  const geofenceOptions = Object.values(geofences);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...rule, name: rule.name.trim() || t(`ruleType${capitalize(config.type)}`), config: JSON.stringify(config), attributes: rule.attributes || {} };
      await fetchOrThrow(rule.id ? `/api/alert-rules/${rule.id}` : '/api/alert-rules', {
        method: rule.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setError(null);
    try {
      const response = await fetchOrThrow('/api/alert-rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rule.name || 'test', config: JSON.stringify(config), attributes: {} }),
      });
      setTest(await response.json());
    } catch (e) {
      setError(e.message);
    }
  };

  const geofencePicker = (value, onChange, label) => (
    <Autocomplete
      multiple
      size="small"
      options={geofenceOptions}
      getOptionLabel={(option) => option.name}
      value={(value || []).map((id) => geofences[id]).filter(Boolean)}
      onChange={(_, next) => onChange(next.map((item) => item.id))}
      renderInput={(params) => <TextField {...params} label={label || t('sharedGeofences')} placeholder={value?.length ? '' : t('ruleAnyGeofence')} />}
    />
  );

  const conditionForm = () => {
    switch (config.type) {
      case 'speed':
        return (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleSpeedLimit')} value={condition.limit ?? ''} onChange={(event) => setCondition({ limit: num(event.target.value) })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel control={<Switch checked={Boolean(condition.useGeofence)} onChange={(event) => setCondition({ useGeofence: event.target.checked })} />} label={t('ruleUseGeofenceLimit')} />
            </Grid>
          </>
        );
      case 'sensor':
        return (
          <>
            <SensorPicker value={condition} onChange={(next) => setConfig({ condition: next })} names={sensorNames} t={t} />
            <Comparison value={condition} onChange={(next) => setConfig({ condition: next })} t={t} />
          </>
        );
      case 'parameter':
        return (
          <>
            <Grid size={12}>
              <Autocomplete freeSolo size="small" options={parameters} value={condition.param || ''} onInputChange={(_, next) => setCondition({ param: next })} renderInput={(params) => <TextField {...params} label={t('sensorParameter')} helperText={t('ruleParameterHelp')} />} />
            </Grid>
            <Comparison value={condition} onChange={(next) => setConfig({ condition: next })} t={t} />
          </>
        );
      case 'digital':
        return (
          <>
            <Grid size={12}>
              <RadioGroup row value={condition.param !== undefined && !condition.sensorName && !condition.sensorType ? 'param' : 'sensor'} onChange={(event) => setConfig({ condition: event.target.value === 'param' ? { param: 'ignition', state: condition.state || 'on' } : { sensorName: digitalNames[0] || '', state: condition.state || 'on' } })}>
                <FormControlLabel value="sensor" control={<Radio size="small" />} label={t('ruleDigitalSensor')} />
                <FormControlLabel value="param" control={<Radio size="small" />} label={t('ruleDigitalParameter')} />
              </RadioGroup>
            </Grid>
            {condition.param !== undefined && !condition.sensorName && !condition.sensorType ? (
              <Grid size={{ xs: 12, sm: 8 }}>
                <Autocomplete freeSolo size="small" options={parameters} value={condition.param || ''} onInputChange={(_, next) => setCondition({ param: next })} renderInput={(params) => <TextField {...params} label={t('sensorParameter')} />} />
              </Grid>
            ) : <SensorPicker value={condition} onChange={(next) => setConfig({ condition: next })} names={digitalNames} t={t} digitalOnly />}
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label={t('ruleWhen')} value={condition.state || 'on'} onChange={(event) => setCondition({ state: event.target.value })}>
                <MenuItem value="on">{t('ruleTurnsOn')}</MenuItem>
                <MenuItem value="off">{t('ruleTurnsOff')}</MenuItem>
              </TextField>
            </Grid>
          </>
        );
      case 'geofence':
        return (
          <>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label={t('ruleWhen')} value={condition.mode || 'enter'} onChange={(event) => setCondition({ mode: event.target.value })}>
                {['enter', 'exit', 'inside', 'outside'].map((mode) => <MenuItem key={mode} value={mode}>{t(`ruleGeofence${capitalize(mode)}`)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>{geofencePicker(condition.geofenceIds, (ids) => setCondition({ geofenceIds: ids }))}</Grid>
            {['inside', 'outside'].includes(condition.mode) && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth size="small" type="number" label={t('ruleForMinutes')} value={condition.minutes ?? ''} onChange={(event) => setCondition({ minutes: num(event.target.value) })} />
              </Grid>
            )}
          </>
        );
      case 'idle':
      case 'gps':
      case 'driver':
      case 'connection':
        return (
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="number" label={t('ruleForMinutes')} value={condition.minutes ?? ''} onChange={(event) => setCondition({ minutes: num(event.target.value) })} helperText={t(`ruleHelp${capitalize(config.type)}`)} />
          </Grid>
        );
      case 'stop':
        return (
          <>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleForMinutes')} value={condition.minutes ?? ''} onChange={(event) => setCondition({ minutes: num(event.target.value) })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label={t('ruleWhere')} value={condition.where || 'any'} onChange={(event) => setCondition({ where: event.target.value })}>
                {['any', 'inside', 'outside'].map((where) => <MenuItem key={where} value={where}>{t(`ruleWhere${capitalize(where)}`)}</MenuItem>)}
              </TextField>
            </Grid>
            {condition.where && condition.where !== 'any' && <Grid size={{ xs: 12, sm: 4 }}>{geofencePicker(condition.geofenceIds, (ids) => setCondition({ geofenceIds: ids }))}</Grid>}
          </>
        );
      case 'fuel':
        return (
          <>
            <Grid size={12}>
              <Autocomplete freeSolo size="small" options={sensorNames} value={condition.sensorName || ''} onInputChange={(_, next) => setCondition({ sensorName: next || undefined })} renderInput={(params) => <TextField {...params} label={t('ruleFuelSensor')} helperText={t('ruleFuelSensorHelp')} />} />
            </Grid>
            <Comparison value={{ op: 'lt', ...condition }} onChange={(next) => setConfig({ condition: next })} t={t} unit="L" />
          </>
        );
      case 'event':
        return (
          <Grid size={12}>
            <Typography variant="body2" color="text.secondary" gutterBottom>{t('ruleEventsHelp')}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {RULE_EVENTS.map((item) => {
                const selected = (condition.events || []).includes(item);
                const label = item.startsWith('alarm:') ? t(`alarm${capitalize(item.slice(6))}`) : t(`event${capitalize(item)}`);
                return (
                  <Chip key={item} label={label} color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => setCondition({ events: selected ? condition.events.filter((other) => other !== item) : [...(condition.events || []), item] })} />
                );
              })}
            </Stack>
          </Grid>
        );
      case 'proximity':
        return (
          <>
            <Grid size={12}>
              <Autocomplete multiple size="small" options={Object.values(devices)} getOptionLabel={(option) => option.name} value={(condition.deviceIds || []).map((id) => devices[id]).filter(Boolean)} onChange={(_, next) => setCondition({ deviceIds: next.map((item) => item.id) })} renderInput={(params) => <TextField {...params} label={t('ruleNearUnits')} />} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleLatitude')} value={condition.latitude ?? ''} onChange={(event) => setCondition({ latitude: event.target.value === '' ? undefined : Number(event.target.value) })} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleLongitude')} value={condition.longitude ?? ''} onChange={(event) => setCondition({ longitude: event.target.value === '' ? undefined : Number(event.target.value) })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleRadius')} value={condition.radius ?? 500} onChange={(event) => setCondition({ radius: num(event.target.value) })} />
            </Grid>
          </>
        );
      default:
        return null;
    }
  };

  const extra = config.extra || [];
  const setExtra = (index, changes) => setConfig({ extra: extra.map((item, i) => (i === index ? { ...item, ...changes } : item)) });

  const extraRow = (item, index) => (
    <Stack key={index} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <TextField select size="small" label={t('ruleExtraKind')} value={item.kind} onChange={(event) => setExtra(index, { kind: event.target.value })} sx={{ width: 150 }}>
        {EXTRA_KINDS.map((kind) => <MenuItem key={kind} value={kind}>{t(`ruleExtra${capitalize(kind)}`)}</MenuItem>)}
      </TextField>
      {(item.kind === 'ignition' || item.kind === 'motion') && (
        <TextField select size="small" value={item.state || 'on'} onChange={(event) => setExtra(index, { state: event.target.value })} sx={{ width: 140 }}>
          <MenuItem value="on">{t('sensorOn')}</MenuItem>
          <MenuItem value="off">{t('sensorOff')}</MenuItem>
        </TextField>
      )}
      {item.kind === 'sensor' && <Autocomplete freeSolo size="small" options={sensorNames} value={item.sensorName || ''} onInputChange={(_, next) => setExtra(index, { sensorName: next })} renderInput={(params) => <TextField {...params} label={t('ruleSensorName')} />} sx={{ width: 180 }} />}
      {item.kind === 'parameter' && <Autocomplete freeSolo size="small" options={parameters} value={item.param || ''} onInputChange={(_, next) => setExtra(index, { param: next })} renderInput={(params) => <TextField {...params} label={t('sensorParameter')} />} sx={{ width: 160 }} />}
      {['speed', 'sensor', 'parameter'].includes(item.kind) && (
        <>
          <TextField select size="small" value={item.op || 'gt'} onChange={(event) => setExtra(index, { op: event.target.value })} sx={{ width: 120 }}>
            {OPERATORS.filter((op) => !['between', 'outside', 'change'].includes(op)).map((op) => <MenuItem key={op} value={op}>{t(`ruleOp${capitalize(op)}`)}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" value={item.value ?? ''} onChange={(event) => setExtra(index, { value: num(event.target.value) })} sx={{ width: 100 }} />
        </>
      )}
      {item.kind === 'geofence' && (
        <>
          <TextField select size="small" value={item.mode || 'inside'} onChange={(event) => setExtra(index, { mode: event.target.value })} sx={{ width: 120 }}>
            <MenuItem value="inside">{t('ruleGeofenceInside')}</MenuItem>
            <MenuItem value="outside">{t('ruleGeofenceOutside')}</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1, minWidth: 160 }}>{geofencePicker(item.geofenceIds, (ids) => setExtra(index, { geofenceIds: ids }))}</Box>
        </>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <IconButton size="small" onClick={() => setConfig({ extra: extra.filter((_, i) => i !== index) })}><DeleteIcon fontSize="small" /></IconButton>
    </Stack>
  );

  const schedule = config.schedule;
  const command = config.command;
  const sample = {
    speed: ['96 km/h (límite 90)', '96'], sensor: ['9.5 (fuera de 2–8)', '9.5'], parameter: ['2048 (> 2000)', '2048'], digital: ['activado', '1'],
    geofence: ['salió de la geocerca', ''], idle: ['motor encendido detenido', ''], stop: ['detenido', ''], connection: ['sin datos hace 35 min', '35'],
    gps: ['sin señal GPS válida', ''], fuel: ['nivel 42 (< 50)', '42'], event: ['alarma sos', ''], driver: ['encendido sin conductor identificado', ''], proximity: ['a 320 m', '320'],
  }[config.type] || ['', ''];
  const preview = (config.message || '{rule}: {unit} · {detail}')
    .replace('{unit}', 'ABC-123').replace('{rule}', rule.name || t(`ruleType${capitalize(config.type)}`)).replace('{detail}', sample[0])
    .replace('{value}', sample[1]).replace('{speed}', '96').replace('{address}', 'Av. Javier Prado Este 1234, Lima').replace('{time}', '31/10/2026 14:25')
    .replace('{driver}', 'Carlos Huamán').replace('{geofence}', 'Almacén Callao').replace('{lat}', '-12.0897').replace('{lon}', '-77.0012');

  const content = () => {
    switch (STEPS[step]) {
      case 'type':
        return (
          <Grid container spacing={1.5}>
            {RULE_TYPES.map((type) => {
              const Icon = RULE_ICONS[type];
              const selected = config.type === type;
              return (
                <Grid key={type} size={{ xs: 6, sm: 4, md: 3 }}>
                  <Card variant="outlined" sx={{ borderColor: selected ? 'primary.main' : 'divider', bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'transparent', height: '100%' }}>
                    <CardActionArea sx={{ p: 1.5, height: '100%' }} onClick={() => { setRule({ ...rule, config: { ...config, type, condition: {} } }); setStep(1); }}>
                      <Icon color={selected ? 'primary' : 'action'} />
                      <Typography variant="body2" fontWeight={700} sx={{ mt: 0.5 }}>{t(`ruleType${capitalize(type)}`)}</Typography>
                      <Typography variant="caption" color="text.secondary">{t(`ruleTypeHelp${capitalize(type)}`)}</Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        );
      case 'condition':
        return (
          <>
            <Grid container spacing={2}>{conditionForm()}</Grid>
            {config.type !== 'connection' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2">{t('ruleExtraTitle')}</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>{t('ruleExtraHelp')}</Typography>
                {extra.map(extraRow)}
                <Button size="small" startIcon={<AddIcon />} onClick={() => setConfig({ extra: [...extra, { kind: 'speed', op: 'gt', value: 5 }] })}>{t('ruleAddExtra')}</Button>
              </Box>
            )}
          </>
        );
      case 'units':
        return (
          <>
            <RadioGroup value={config.all ? 'all' : 'some'} onChange={(event) => setConfig({ all: event.target.value === 'all' })}>
              <FormControlLabel value="all" control={<Radio />} label={`${t('ruleAllUnits')} (${Object.keys(devices).length})`} />
              <FormControlLabel value="some" control={<Radio />} label={t('ruleSomeUnits')} />
            </RadioGroup>
            {!config.all && (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Autocomplete multiple options={Object.values(groups)} getOptionLabel={(option) => option.name} value={(config.groupIds || []).map((id) => groups[id]).filter(Boolean)} onChange={(_, next) => setConfig({ groupIds: next.map((item) => item.id) })} renderInput={(params) => <TextField {...params} label={t('settingsGroups')} />} />
                <Autocomplete multiple options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))} getOptionLabel={(option) => option.name} value={(config.deviceIds || []).map((id) => devices[id]).filter(Boolean)} onChange={(_, next) => setConfig({ deviceIds: next.map((item) => item.id) })} renderInput={(params) => <TextField {...params} label={t('deviceTitle')} />} />
              </Stack>
            )}
          </>
        );
      case 'schedule':
        return (
          <Grid container spacing={2}>
            <Grid size={12}>
              <FormControlLabel control={<Switch checked={Boolean(schedule)} onChange={(event) => setConfig({ schedule: event.target.checked ? { days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00', invert: false } : null })} />} label={t('ruleUseSchedule')} />
            </Grid>
            {schedule && (
              <>
                <Grid size={12}>
                  <Stack direction="row" spacing={0.75}>
                    {DAYS.map((day) => {
                      const selected = schedule.days.includes(day);
                      return <Chip key={day} label={t(`ruleDay${day}`)} color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => setConfig({ schedule: { ...schedule, days: selected ? schedule.days.filter((other) => other !== day) : [...schedule.days, day].sort() } })} />;
                    })}
                  </Stack>
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField fullWidth size="small" type="time" label={t('ruleFrom')} value={schedule.from} onChange={(event) => setConfig({ schedule: { ...schedule, from: event.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField fullWidth size="small" type="time" label={t('ruleTo')} value={schedule.to} onChange={(event) => setConfig({ schedule: { ...schedule, to: event.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControlLabel control={<Switch checked={Boolean(schedule.invert)} onChange={(event) => setConfig({ schedule: { ...schedule, invert: event.target.checked } })} />} label={t('ruleOutsideSchedule')} />
                </Grid>
              </>
            )}
            {config.type !== 'event' && (
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth size="small" type="number" label={t('ruleMinDuration')} helperText={t('ruleMinDurationHelp')} value={config.minDuration ?? 0} onChange={(event) => setConfig({ minDuration: num(event.target.value) })} />
              </Grid>
            )}
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleCooldown')} helperText={t('ruleCooldownHelp')} value={config.cooldown ?? 0} onChange={(event) => setConfig({ cooldown: num(event.target.value) })} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label={t('ruleMaxPerDay')} helperText={t('ruleMaxPerDayHelp')} value={config.maxPerDay ?? 0} onChange={(event) => setConfig({ maxPerDay: num(event.target.value) })} />
            </Grid>
          </Grid>
        );
      case 'actions':
        return (
          <Grid container spacing={2}>
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom>{t('rulePriority')}</Typography>
              <Stack direction="row" spacing={0.75}>
                {SEVERITIES.map((severity) => (
                  <Chip key={severity} label={t(`alertSeverity${capitalize(severity)}`)} onClick={() => setConfig({ severity })} sx={{ fontWeight: 700, bgcolor: alpha(SEVERITY_COLORS[severity], config.severity === severity ? 0.2 : 0.05), color: SEVERITY_COLORS[severity], outline: config.severity === severity ? `2px solid ${SEVERITY_COLORS[severity]}` : 'none' }} />
                ))}
              </Stack>
            </Grid>
            <Grid size={12}>
              <Typography variant="subtitle2" gutterBottom>{t('ruleChannels')}</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {notificators.map((type) => {
                  const selected = (config.channels || []).includes(type);
                  return <Chip key={type} label={t(`notificator${capitalize(type)}`)} color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => setConfig({ channels: selected ? config.channels.filter((item) => item !== type) : [...(config.channels || []), type] })} />;
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary">{t('ruleChannelsHelp')}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label={t('serviceEmails')} placeholder="jefe@empresa.pe" value={config.emails || ''} onChange={(event) => setConfig({ emails: event.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth size="small" label={t('ruleWhatsappNumbers')} placeholder="+51 987 654 321" value={config.phones || ''} onChange={(event) => setConfig({ phones: event.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select fullWidth size="small" label={t('ruleCommand')} value={command?.type || ''} onChange={(event) => setConfig({ command: event.target.value ? { type: event.target.value, data: command?.data } : null })} helperText={command?.type === 'engineStop' ? t('ruleCommandSafeCut') : t('ruleCommandHelp')}>
                <MenuItem value="">{t('sharedNone')}</MenuItem>
                <MenuItem value="engineStop">{t('commandEngineStop')}</MenuItem>
                <MenuItem value="engineResume">{t('commandEngineResume')}</MenuItem>
                <MenuItem value="alarmArm">{t('commandAlarmArm')}</MenuItem>
                <MenuItem value="outputControl">{t('commandOutputControl')}</MenuItem>
                <MenuItem value="custom">{t('commandCustom')}</MenuItem>
              </TextField>
            </Grid>
            {command?.type === 'custom' && (
              <Grid size={{ xs: 12, sm: 7 }}>
                <TextField fullWidth size="small" label={t('commandData')} value={command.data || ''} onChange={(event) => setConfig({ command: { ...command, data: event.target.value } })} />
              </Grid>
            )}
            <Grid size={12}>
              <TextField fullWidth multiline minRows={2} label={t('ruleMessage')} placeholder="{rule}: {unit} · {detail}" value={config.message || ''} onChange={(event) => setConfig({ message: event.target.value })} />
              <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                {VARIABLES.map((variable) => <Chip key={variable} size="small" variant="outlined" label={`{${variable}}`} onClick={() => setConfig({ message: `${config.message || ''}{${variable}}` })} sx={{ fontFamily: 'monospace' }} />)}
              </Stack>
              <Alert severity="info" icon={false} sx={{ mt: 1 }}>{`${t('rulePreview')}: ${preview}`}</Alert>
            </Grid>
          </Grid>
        );
      default:
        return (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField fullWidth label={t('sharedName')} placeholder={t(`ruleType${capitalize(config.type)}`)} value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControlLabel control={<Switch checked={rule.enabled} onChange={(event) => setRule({ ...rule, enabled: event.target.checked })} />} label={t('ruleEnabled')} />
            </Grid>
            <Grid size={12}>
              <Button variant="outlined" startIcon={<ScienceIcon />} onClick={runTest} disabled={config.type === 'event'}>{t('ruleTestNow')}</Button>
              {config.type === 'event' && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{t('ruleTestEvents')}</Typography>}
            </Grid>
            {test && (
              <Grid size={12}>
                <Alert severity={test.matching ? 'warning' : 'success'} sx={{ mb: 1 }}>
                  {`${test.matching} ${t('ruleTestMatching')} · ${test.inSchedule ? t('ruleTestInSchedule') : t('ruleTestOutSchedule')}`}
                </Alert>
                <Table size="small">
                  <TableBody>
                    {test.units.slice(0, 12).map((unit) => (
                      <TableRow key={unit.deviceId}>
                        <TableCell sx={{ width: 24 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: unit.holds ? 'error.main' : 'success.main' }} /></TableCell>
                        <TableCell>{unit.name}</TableCell>
                        <TableCell>{unit.detail || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Grid>
            )}
          </Grid>
        );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{rule.id ? t('ruleEdit') : t('ruleNew')}</DialogTitle>
      <Box sx={{ px: 3, pb: 1 }}>
        <Stepper nonLinear activeStep={step} alternativeLabel>
          {STEPS.map((key, index) => (
            <Step key={key} completed={index < step}>
              <StepButton onClick={() => setStep(index)}>{t(`ruleStep${capitalize(key)}`)}</StepButton>
            </Step>
          ))}
        </Stepper>
      </Box>
      <DialogContent dividers sx={{ minHeight: 380 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {content()}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Box sx={{ flexGrow: 1 }} />
        {step > 0 && <Button onClick={() => setStep(step - 1)}>{t('ruleBack')}</Button>}
        {step < STEPS.length - 1
          ? <Button variant="contained" onClick={() => setStep(step + 1)}>{t('ruleNext')}</Button>
          : <Button variant="contained" onClick={save} disabled={saving}>{t('sharedSave')}</Button>}
      </DialogActions>
    </Dialog>
  );
};

export default RuleWizard;
