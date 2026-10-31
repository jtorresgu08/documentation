import { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardContent, Container, Grid, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { PERIODS, downloadCsv, periodRange } from '../reports/reportPeriods';
import { STOP_COLORS, tripLabel } from './dispatchUtils';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Dispatch compliance: deliveries, failures, on time rate, late stops and service time, by unit and driver, failure
// reasons and every trip, with CSV and print
const DispatchReportPage = () => {
  const t = useTranslation();
  const [period, setPeriod] = useState('week');
  const [custom, setCustom] = useState({ from: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [report, setReport] = useState(null);

  const run = async () => {
    setReport(null);
    const [from, to] = periodRange(period, custom);
    const response = await fetchOrThrow(`/api/dispatch/report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    setReport(await response.json());
  };

  useEffect(() => {
    if (period !== 'custom') run();
  }, [period]);

  const summary = report?.summary;
  const exportCsv = () => downloadCsv('despachos', [t('dispatchTripName'), t('sharedDevice'), t('dispatchDriver'), t('dispatchPlannedStart'), t('dispatchStatus'), t('dispatchStops'), t('dispatchStopDelivered'), t('dispatchStopFailed'), t('dispatchLate')],
    report.trips.map((trip) => [trip.name, trip.deviceName, trip.driverName, dayjs(trip.plannedStart).format('YYYY-MM-DD HH:mm'), tripLabel(t, trip.status), trip.progress.total, trip.progress.delivered, trip.progress.failed, trip.progress.late]));

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
          <Typography variant="h5" fontWeight={700}>{t('dispatchReport')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('dispatchReportSubtitle')}</Typography>
        </Box>
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
        <Tooltip title={t('opsExportCsv')}><span><Button variant="outlined" onClick={exportCsv} disabled={!report?.trips.length}><DownloadIcon /></Button></span></Tooltip>
        <Tooltip title={t('opsPrint')}><Button variant="outlined" onClick={() => window.print()}><PrintIcon /></Button></Tooltip>
      </Stack>
      {!report && <LinearProgress />}
      {summary && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>{kpi(t('dispatchDeliveryRate'), summary.deliveryRate != null ? `${summary.deliveryRate}%` : null, `${summary.delivered} / ${summary.stops} ${t('dispatchStopsLower')}`, STOP_COLORS.delivered)}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{kpi(t('dispatchOnTimeRate'), summary.onTimeRate != null ? `${summary.onTimeRate}%` : null, `${summary.onTime} ${t('dispatchOnTime')}`, '#2563c9')}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{kpi(t('dispatchFailedAndLate'), `${summary.failed} · ${summary.late}`, t('dispatchFailedAndLateHelp'), STOP_COLORS.failed)}</Grid>
          <Grid size={{ xs: 6, md: 3 }}>{kpi(t('dispatchServiceTime'), summary.avgServiceMinutes != null ? `${summary.avgServiceMinutes} min` : null, `${summary.trips} ${t('dispatchTripsLower')} · ${summary.completedTrips} ${t('dispatchCompletedLower')}`, '#232a38')}</Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700}>{t('dispatchByUnit')}</Typography>
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={report.byUnit.map((item) => ({ ...item, pending: item.stops - item.delivered }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <ChartTooltip />
                      <Legend />
                      <Bar dataKey="delivered" stackId="a" name={t('dispatchStopDelivered')} fill={STOP_COLORS.delivered} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="pending" stackId="a" name={t('dispatchNotDeliveredShort')} fill="#cfd6e2" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('dispatchReasons')}</Typography>
                {!Object.keys(report.reasons).length && <Typography variant="body2" color="text.secondary">{t('dispatchNoFailures')}</Typography>}
                {Object.entries(report.reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                  <Stack key={reason} direction="row" justifyContent="space-between" sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2">{reason}</Typography>
                    <Typography variant="body2" fontWeight={700}>{count}</Typography>
                  </Stack>
                ))}
                <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2 }} gutterBottom>{t('dispatchByDriver')}</Typography>
                {report.byDriver.map((item) => (
                  <Stack key={item.name} direction="row" justifyContent="space-between" sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2">{item.name}</Typography>
                    <Typography variant="body2" fontWeight={600}>{`${item.delivered}/${item.stops} · ${item.trips} ${t('dispatchTripsLower')}`}</Typography>
                  </Stack>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid size={12}>
            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('dispatchTripName')}</TableCell>
                      <TableCell>{t('sharedDevice')}</TableCell>
                      <TableCell>{t('dispatchDriver')}</TableCell>
                      <TableCell>{t('dispatchPlannedStart')}</TableCell>
                      <TableCell>{t('dispatchStatus')}</TableCell>
                      <TableCell align="right">{t('dispatchStopDelivered')}</TableCell>
                      <TableCell align="right">{t('dispatchStopFailed')}</TableCell>
                      <TableCell align="right">{t('dispatchLate')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.trips.map((trip) => (
                      <TableRow key={trip.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{trip.name}</TableCell>
                        <TableCell>{trip.deviceName}</TableCell>
                        <TableCell>{trip.driverName}</TableCell>
                        <TableCell>{dayjs(trip.plannedStart).format('DD/MM HH:mm')}</TableCell>
                        <TableCell>{tripLabel(t, trip.status)}</TableCell>
                        <TableCell align="right" sx={{ color: STOP_COLORS.delivered, fontWeight: 700 }}>{`${trip.progress.delivered}/${trip.progress.total}`}</TableCell>
                        <TableCell align="right" sx={{ color: trip.progress.failed ? STOP_COLORS.failed : undefined }}>{trip.progress.failed}</TableCell>
                        <TableCell align="right" sx={{ color: trip.progress.late ? STOP_COLORS.failed : undefined }}>{trip.progress.late}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}
    </Container>
  );
};

export default DispatchReportPage;
