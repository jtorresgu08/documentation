import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Grid, LinearProgress, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import {
  Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  SENSOR_TYPES, formatSensorValue, parseSensors, sensorColor,
} from '../common/util/sensors';
import {
  PERIODS, downloadCsv, formatDuration, periodRange,
} from './reportPeriods';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const Stat = ({ label, value, color }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
    <Typography variant="body1" fontWeight={700} noWrap sx={{ color }}>{value}</Typography>
  </Box>
);

// Sensor report of a unit, Wialon style: for every sensor the minimum, average (weighted by time), maximum, first and
// last value, the period's amount for totals (mileage, engine hours, consumption), time on and activations for
// digital sensors, time in each color range, a chart over time and the table of readings, with CSV and print
const SensorReportPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const devices = useSelector((state) => state.devices.items);
  const withSensors = useMemo(() => Object.values(devices).filter((device) => parseSensors(device).length).sort((a, b) => a.name.localeCompare(b.name)), [devices]);
  const [deviceId, setDeviceId] = useState(Number(searchParams.get('deviceId')) || null);
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({ from: dayjs().subtract(1, 'day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [selected, setSelected] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!deviceId && withSensors.length) setDeviceId(withSensors[0].id);
  }, [withSensors]);

  const device = devices[deviceId];
  const sensors = useMemo(() => parseSensors(device), [device]);
  const byId = useMemo(() => Object.fromEntries(sensors.map((sensor) => [sensor.id, sensor])), [sensors]);

  const run = async () => {
    if (!deviceId) return;
    const [from, to] = periodRange(period, custom);
    const query = new URLSearchParams({ deviceId, from: from.toISOString(), to: to.toISOString() });
    selected.forEach((id) => query.append('sensorId', id));
    setLoading(true);
    setError(null);
    try {
      setReport(await (await fetchOrThrow(`/api/sensors/report?${query}`)).json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, [deviceId, period]);

  const statistics = report?.devices?.[0]?.sensors || [];
  const series = report?.series || [];
  const step = Math.max(1, Math.ceil(series.length / 300));
  const rows = series.filter((_, index) => index % step === 0);

  const exportCsv = () => downloadCsv(`sensores-${device?.name || ''}`, [t('positionFixTime'), t('positionSpeed'), ...statistics.map((item) => `${item.name}${item.unit ? ` (${item.unit})` : ''}`)],
    series.map((point) => [dayjs(point.time).format('YYYY-MM-DD HH:mm:ss'), point.speed, ...statistics.map((item) => point.values[item.id] ?? '')]));

  const value = (item, number) => (number === undefined || number === null ? '—' : formatSensorValue(byId[item.id] || item, number, t));

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('sensorReportTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('sensorReportSubtitle')}</Typography>
        </Box>
        <Autocomplete
          sx={{ minWidth: 220 }}
          size="small"
          options={withSensors}
          getOptionLabel={(option) => option.name}
          value={device || null}
          onChange={(_, next) => { setSelected([]); setDeviceId(next?.id || null); }}
          renderInput={(params) => <TextField {...params} label={t('reportDevice')} />}
        />
        <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 150 }}>
          {PERIODS.map((item) => <MenuItem key={item} value={item}>{t(`opsPeriod${capitalize(item)}`)}</MenuItem>)}
        </TextField>
        {period === 'custom' && (
          <>
            <TextField size="small" type="datetime-local" label={t('reportFrom')} value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="datetime-local" label={t('reportTo')} value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </>
        )}
        <Button variant="contained" onClick={run} disabled={!deviceId || loading}>{t('reportShow')}</Button>
        <Tooltip title={t('opsExportCsv')}><span><Button variant="outlined" onClick={exportCsv} disabled={!series.length}><DownloadIcon /></Button></span></Tooltip>
        <Tooltip title={t('opsPrint')}><Button variant="outlined" onClick={() => window.print()}><PrintIcon /></Button></Tooltip>
      </Stack>
      {sensors.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          {sensors.map((sensor) => {
            const active = !selected.length || selected.includes(sensor.id);
            return (
              <Chip
                key={sensor.id}
                label={sensor.name}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => setSelected(selected.includes(sensor.id) ? selected.filter((id) => id !== sensor.id) : [...selected, sensor.id])}
              />
            );
          })}
          {selected.length > 0 && <Chip label={t('opsAllSensors')} variant="outlined" onClick={() => setSelected([])} />}
        </Stack>
      )}
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!withSensors.length && <Alert severity="info">{t('opsNoSensors')}</Alert>}
      <Grid container spacing={1.5}>
        {statistics.map((item) => {
          const sensor = byId[item.id] || item;
          const meta = SENSOR_TYPES[item.type] || {};
          const chart = meta.text ? [] : rows.filter((point) => point.values[item.id] !== undefined).map((point) => ({ time: point.time, value: Number(point.values[item.id]) }));
          const color = sensorColor(sensor, item.last) || theme.palette.primary.main;
          return (
            <Grid key={item.id} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card variant="outlined" sx={{ p: 1.75, height: '100%', borderRadius: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{`${t(`sensorType${capitalize(item.type)}`)} · ${item.count} ${t('opsReadings')}`}</Typography>
                </Stack>
                {!item.count && <Typography variant="body2" color="text.secondary">{t('opsNoData')}</Typography>}
                {item.count > 0 && meta.text && <Stat label={t('opsLast')} value={item.last} />}
                {item.count > 0 && !meta.text && (
                  <Grid container spacing={1}>
                    {meta.digital ? (
                      <>
                        <Grid size={4}><Stat label={t('opsOnTime')} value={formatDuration(item.onTime)} color={color} /></Grid>
                        <Grid size={4}><Stat label={t('opsOnPercent')} value={`${item.onPercent ?? 0} %`} /></Grid>
                        <Grid size={4}><Stat label={t('opsActivations')} value={item.activations ?? 0} /></Grid>
                      </>
                    ) : (
                      <>
                        <Grid size={3}><Stat label={t('opsMin')} value={value(item, item.min)} /></Grid>
                        <Grid size={3}><Stat label={t('opsAverage')} value={value(item, item.average)} /></Grid>
                        <Grid size={3}><Stat label={t('opsMax')} value={value(item, item.max)} /></Grid>
                        <Grid size={3}><Stat label={item.total !== undefined ? t('opsPeriodTotal') : t('opsLast')} value={value(item, item.total ?? item.last)} color={color} /></Grid>
                      </>
                    )}
                  </Grid>
                )}
                {item.ranges?.length > 0 && (
                  <Box sx={{ mt: 1.25 }}>
                    <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: alpha(theme.palette.text.primary, 0.06) }}>
                      {item.ranges.map((range) => <Tooltip key={`${range.from}-${range.to}`} title={`${range.from}–${range.to}: ${formatDuration(range.time)}`}><Box sx={{ width: `${range.percent}%`, bgcolor: range.color }} /></Tooltip>)}
                    </Box>
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {item.ranges.map((range) => (
                        <Typography key={`${range.from}-${range.to}`} variant="caption">
                          <Box component="span" sx={{ color: range.color, fontWeight: 800 }}>●</Box>
                          {` ${range.text || `${range.from}–${range.to}`}: ${range.percent} % (${formatDuration(range.time)})`}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}
                {chart.length > 1 && (
                  <Box sx={{ height: 130, mt: 1 }}>
                    <ResponsiveContainer>
                      <AreaChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                        <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(time) => dayjs(time).format(period === 'today' || period === 'yesterday' ? 'HH:mm' : 'DD/MM')} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={meta.digital ? [0, 1] : ['auto', 'auto']} />
                        {(sensor.ranges || []).map((range) => <ReferenceArea key={`${range.from}-${range.to}`} y1={Number(range.from)} y2={Number(range.to)} fill={range.color} fillOpacity={0.06} ifOverflow="hidden" />)}
                        <ChartTooltip labelFormatter={(time) => dayjs(time).format('DD/MM HH:mm')} formatter={(number) => [formatSensorValue(sensor, number, t), item.name]} />
                        <Area type={meta.digital ? 'stepAfter' : 'monotone'} dataKey="value" stroke={color} fill={alpha(color, 0.15)} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Card>
            </Grid>
          );
        })}
      </Grid>
      {rows.length > 0 && (
        <Card variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ p: 1.5, pb: 0 }}>{`${t('opsReadingsTable')} (${series.length})`}</Typography>
          <Box sx={{ overflowX: 'auto', maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{t('positionFixTime')}</TableCell>
                  <TableCell align="right">{t('positionSpeed')}</TableCell>
                  {statistics.map((item) => <TableCell key={item.id} align="right">{item.name}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice().reverse().map((point) => (
                  <TableRow key={point.time} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(point.time).format('DD/MM HH:mm:ss')}</TableCell>
                    <TableCell align="right">{`${point.speed} km/h`}</TableCell>
                    {statistics.map((item) => {
                      const sensor = byId[item.id] || item;
                      const number = point.values[item.id];
                      return (
                        <TableCell key={item.id} align="right" sx={{ color: sensorColor(sensor, number) || 'inherit', fontWeight: sensorColor(sensor, number) ? 600 : 400 }}>
                          {number === undefined ? '' : formatSensorValue(sensor, number, t)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}
    </Container>
  );
};

export default SensorReportPage;
