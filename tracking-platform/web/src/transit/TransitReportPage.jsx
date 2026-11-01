import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Container, Grid, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { PERIODS, downloadCsv, periodRange } from '../reports/reportPeriods';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const percent = (value) => (value === null || value === undefined ? '—' : `${value}%`);

// Public transport compliance for a line: laps, stop visits, punctuality, real against planned interval and regularity,
// by unit and by stop, with CSV and print
const TransitReportPage = () => {
  const t = useTranslation();
  const [params] = useSearchParams();
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState(Number(params.get('routeId')) || '');
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({ from: dayjs().startOf('day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchOrThrow('/api/transit/routes').then((response) => response.json()).then((items) => {
      setRoutes(items);
      setRouteId((current) => current || items[0]?.id || '');
    });
  }, []);

  const run = async () => {
    if (!routeId) return;
    setReport(null);
    const [from, to] = periodRange(period, custom);
    const response = await fetchOrThrow(`/api/transit/report?routeId=${routeId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    setReport(await response.json());
  };

  useEffect(() => {
    if (period !== 'custom') run();
  }, [period, routeId]);

  const summary = report?.summary;
  const exportCsv = () => {
    downloadCsv('transporte-unidades', [t('sharedDevice'), t('transitLaps'), t('transitVisits'), t('transitAverageDelay'), t('transitOnTime')],
      report.units.map((unit) => [unit.name, unit.laps, unit.visits, unit.averageDelayMinutes, unit.onTimeRate]));
    downloadCsv('transporte-paraderos', ['#', t('transitStop'), t('transitVisits'), t('transitAverageDelay'), t('transitOnTime'), t('transitAverageInterval')],
      report.stops.map((stop) => [stop.index + 1, stop.name, stop.visits, stop.averageDelayMinutes, stop.onTimeRate, stop.averageIntervalMinutes ?? '']));
  };

  const kpi = (label, value, detail, color) => (
    <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h4" fontWeight={700} sx={{ color }}>{value ?? '—'}</Typography>
        {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
      </CardContent>
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('transitReport')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('transitReportSubtitle')}</Typography>
        </Box>
        <TextField select size="small" label={t('transitLine')} value={routeId} onChange={(event) => setRouteId(event.target.value)} sx={{ minWidth: 200 }}>
          {routes.map((item) => <MenuItem key={item.id} value={item.id}>{`${item.code ? `${item.code} · ` : ''}${item.name}`}</MenuItem>)}
        </TextField>
        <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 150 }}>
          {PERIODS.map((item) => <MenuItem key={item} value={item}>{t(`opsPeriod${capitalize(item)}`)}</MenuItem>)}
        </TextField>
        {period === 'custom' && (
          <>
            <TextField size="small" type="datetime-local" label={t('reportFrom')} value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="datetime-local" label={t('reportTo')} value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="contained" onClick={run}>{t('reportShow')}</Button>
          </>
        )}
        <Tooltip title={t('opsExportCsv')}><span><Button variant="outlined" onClick={exportCsv} disabled={!report?.units.length}><DownloadIcon /></Button></span></Tooltip>
        <Tooltip title={t('opsPrint')}><Button variant="outlined" onClick={() => window.print()}><PrintIcon /></Button></Tooltip>
      </Stack>
      {routeId && !report && <LinearProgress />}
      {summary && (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 2.4 }}>{kpi(t('transitLaps'), summary.laps, `${summary.visits} ${t('transitVisitsLower')}`)}</Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>{kpi(t('transitOnTime'), percent(summary.onTimeRate), t('transitOnTimeHelp'), '#2f9e5b')}</Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>{kpi(t('transitRealInterval'), summary.averageIntervalMinutes != null ? `${summary.averageIntervalMinutes} min` : null, t('transitBetweenBuses'))}</Grid>
            <Grid size={{ xs: 6, md: 2.4 }}>{kpi(t('transitPlannedInterval'), summary.plannedIntervalMinutes != null ? `${summary.plannedIntervalMinutes} min` : null, t('transitFromSchedule'))}</Grid>
            <Grid size={{ xs: 12, md: 2.4 }}>{kpi(t('transitRegularity'), percent(summary.regularity), t('transitRegularityHelp'), summary.regularity != null && summary.regularity < 70 ? '#e79a2b' : '#2563c9')}</Grid>
          </Grid>
          <Card variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>{t('transitIntervalByStop')}</Typography>
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={report.stops.map((stop) => ({ name: stop.name, interval: stop.averageIntervalMinutes, delay: stop.averageDelayMinutes }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} interval={0} />
                  <YAxis fontSize={11} unit=" min" />
                  <ChartTooltip />
                  <Bar dataKey="interval" name={t('transitAverageInterval')} fill="#2563c9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delay" name={t('transitAverageDelay')} fill="#e79a2b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('sharedDevice')}</TableCell>
                      <TableCell align="right">{t('transitLaps')}</TableCell>
                      <TableCell align="right">{t('transitVisits')}</TableCell>
                      <TableCell align="right">{t('transitAverageDelay')}</TableCell>
                      <TableCell align="right">{t('transitOnTime')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.units.map((unit) => (
                      <TableRow key={unit.deviceId}>
                        <TableCell sx={{ fontWeight: 600 }}>{unit.name}</TableCell>
                        <TableCell align="right">{unit.laps}</TableCell>
                        <TableCell align="right">{unit.visits}</TableCell>
                        <TableCell align="right">{`${unit.averageDelayMinutes} min`}</TableCell>
                        <TableCell align="right">{percent(unit.onTimeRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('transitStop')}</TableCell>
                      <TableCell align="right">{t('transitVisits')}</TableCell>
                      <TableCell align="right">{t('transitAverageInterval')}</TableCell>
                      <TableCell align="right">{t('transitAverageDelay')}</TableCell>
                      <TableCell align="right">{t('transitOnTime')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.stops.map((stop) => (
                      <TableRow key={stop.index}>
                        <TableCell sx={{ fontWeight: 600 }}>{`${stop.index + 1}. ${stop.name}`}</TableCell>
                        <TableCell align="right">{stop.visits}</TableCell>
                        <TableCell align="right">{stop.averageIntervalMinutes != null ? `${stop.averageIntervalMinutes} min` : '—'}</TableCell>
                        <TableCell align="right">{`${stop.averageDelayMinutes} min`}</TableCell>
                        <TableCell align="right">{percent(stop.onTimeRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      )}
    </Container>
  );
};

export default TransitReportPage;
