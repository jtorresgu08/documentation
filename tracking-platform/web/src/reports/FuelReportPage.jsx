import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box, Card, CardContent, Chip, FormControl, InputLabel, Link, MenuItem, Select, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Typography, useTheme,
} from '@mui/material';
import {
  Area, Brush, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import ReportFilter from './components/ReportFilter';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import useReportStyles from './common/useReportStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { fuelSensors } from '../common/util/sensors';

const litres = (value) => Number(value).toFixed(1);

const Summary = ({ label, value, unit, color }) => (
  <Card variant="outlined" sx={{ flex: '1 1 140px', borderRadius: 3 }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color }}>{`${value.toFixed(1)} ${unit}`}</Typography>
    </CardContent>
  </Card>
);

// Fuel level chart of a unit with the detected fills and drains (only while stopped, after the wait time)
const FuelReportPage = () => {
  const { classes } = useReportStyles();
  const theme = useTheme();
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);

  const [report, setReport] = useState(null);
  const [query, setQuery] = useState(null);
  const [sensorId, setSensorId] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (deviceId, from, to, sensor) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ deviceId, from, to });
      if (sensor) {
        params.append('sensorId', sensor);
      }
      const response = await fetchOrThrow(`/api/sensors/fuel?${params.toString()}`);
      const result = await response.json();
      setReport(result);
      setSensorId(result.sensor.id);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  // the server picks the first fuel sensor when none is chosen (the device list may not be loaded yet)
  const onShow = useCatch(async ({ deviceIds, from, to }) => {
    const deviceId = deviceIds[0];
    const sensors = fuelSensors(devices[deviceId]);
    const sensor = sensors.some((item) => item.id === sensorId) ? sensorId : sensors[0]?.id || '';
    setSensorId(sensor);
    setQuery({ deviceId, from, to });
    try {
      await load(deviceId, from, to, sensor);
    } catch (error) {
      if (!error.message.includes('No fuel sensor')) {
        throw error;
      }
      setReport({ empty: true });
    }
  });

  const changeSensor = useCatch(async (value) => {
    setSensorId(value);
    if (query) {
      await load(query.deviceId, query.from, query.to, value);
    }
  });

  const sensors = query ? fuelSensors(devices[query.deviceId]) : [];
  const unit = report?.sensor?.unit || 'L';
  const fill = theme.palette.success.main;
  const drain = theme.palette.error.main;

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'fuelTitle']}>
      <div className={classes.header}>
        <ReportFilter onShow={onShow} deviceType="single" loading={loading}>
          {sensors.length > 1 && (
            <div className={classes.filterItem}>
              <FormControl fullWidth>
                <InputLabel>{t('fuelSensor')}</InputLabel>
                <Select label={t('fuelSensor')} value={sensorId} onChange={(event) => changeSensor(event.target.value)}>
                  {sensors.map((sensor) => <MenuItem key={sensor.id} value={sensor.id}>{sensor.name}</MenuItem>)}
                </Select>
              </FormControl>
            </div>
          )}
        </ReportFilter>
      </div>
      {report?.empty && (
        <Typography color="text.secondary" sx={{ p: 2 }}>{t('fuelNoSensor')}</Typography>
      )}
      {report?.summary && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ mb: 2 }}>
            <Summary label={t('fuelStart')} value={report.summary.start} unit={unit} />
            <Summary label={t('fuelEnd')} value={report.summary.end} unit={unit} />
            <Summary label={`${t('fuelFilled')} (${report.summary.fills})`} value={report.summary.filled} unit={unit} color={fill} />
            <Summary label={`${t('fuelDrained')} (${report.summary.drains})`} value={report.summary.drained} unit={unit} color={drain} />
            <Summary label={t('fuelConsumed')} value={report.summary.consumed} unit={unit} />
          </Stack>

          {report.points.length > 0 ? (
            <Box sx={{ height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart data={report.points} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => dayjs(value).format('DD/MM HH:mm')}
                    stroke={theme.palette.text.secondary}
                  />
                  <YAxis yAxisId="fuel" stroke={theme.palette.text.secondary} unit={` ${unit}`} width={70} />
                  <YAxis yAxisId="speed" orientation="right" stroke={theme.palette.text.disabled} unit=" km/h" width={70} />
                  <Tooltip
                    labelFormatter={(value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss')}
                    formatter={(value, key) => [
                      key === 'speed' ? `${value} km/h` : `${value} ${unit}`,
                      t({ level: 'fuelLevel', value: 'fuelRaw', speed: 'positionSpeed' }[key]),
                    ]}
                    contentStyle={{ backgroundColor: theme.palette.background.paper }}
                  />
                  <Legend formatter={(key) => t({ level: 'fuelLevel', value: 'fuelRaw', speed: 'positionSpeed' }[key])} />
                  <Area yAxisId="speed" type="stepAfter" dataKey="speed" stroke="none" fill={theme.palette.action.selected} isAnimationActive={false} />
                  <Line yAxisId="fuel" type="monotone" dataKey="value" stroke={theme.palette.text.disabled} strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Line yAxisId="fuel" type="monotone" dataKey="level" stroke={theme.palette.primary.main} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  {report.changes.map((change) => (
                    <ReferenceArea
                      key={change.time}
                      yAxisId="fuel"
                      x1={change.time}
                      x2={Math.max(change.endTime, change.time + 60000)}
                      fill={change.type === 'fill' ? fill : drain}
                      fillOpacity={selected === change.time ? 0.45 : 0.2}
                      label={{
                        value: `${change.type === 'fill' ? '+' : '−'}${litres(change.amount)} ${unit}`,
                        position: 'insideTop',
                        fill: change.type === 'fill' ? fill : drain,
                        fontWeight: 700,
                      }}
                    />
                  ))}
                  <Brush dataKey="time" height={24} stroke={theme.palette.primary.main} tickFormatter={() => ''} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <Typography color="text.secondary">{t('sharedNoData')}</Typography>
          )}

          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 3, mb: 1 }}>{t('fuelEvents')}</Typography>
          <Card variant="outlined" sx={{ borderRadius: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('fuelEvent')}</TableCell>
                  <TableCell>{t('reportStartTime')}</TableCell>
                  <TableCell>{t('reportEndTime')}</TableCell>
                  <TableCell align="right">{t('fuelBefore')}</TableCell>
                  <TableCell align="right">{t('fuelAfter')}</TableCell>
                  <TableCell align="right">{t('fuelAmount')}</TableCell>
                  <TableCell>{t('fuelPlace')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.changes.map((change) => (
                  <TableRow key={change.time} hover selected={selected === change.time} onClick={() => setSelected(change.time)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <Chip
                        size="small"
                        label={t(change.type === 'fill' ? 'fuelFill' : 'fuelDrain')}
                        sx={{ bgcolor: change.type === 'fill' ? fill : drain, color: 'common.white' }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(change.time).format('YYYY-MM-DD HH:mm')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(change.endTime).format('YYYY-MM-DD HH:mm')}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{`${litres(change.before)} ${unit}`}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{`${litres(change.after)} ${unit}`}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: change.type === 'fill' ? fill : drain }}>
                      {`${change.type === 'fill' ? '+' : '−'}${litres(change.amount)} ${unit}`}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`https://www.google.com/maps?q=${change.latitude},${change.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {`${change.latitude.toFixed(5)}, ${change.longitude.toFixed(5)}`}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!report.changes.length && (
                  <TableRow>
                    <TableCell colSpan={7}><Typography variant="body2" color="text.secondary">{t('fuelNoEvents')}</Typography></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {t('fuelSettingsHint')
              .replace('{fill}', report.sensor.minFill)
              .replace('{drain}', report.sensor.minDrain)
              .replace('{wait}', report.sensor.waitTime)}
          </Typography>
        </Box>
      )}
    </PageLayout>
  );
};

export default FuelReportPage;
