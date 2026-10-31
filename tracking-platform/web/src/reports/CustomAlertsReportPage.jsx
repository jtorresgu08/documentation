import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Grid, IconButton, LinearProgress, MenuItem, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ReplayIcon from '@mui/icons-material/Replay';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  SEVERITIES, SEVERITY_COLORS, STATUS_COLORS, capitalize,
} from '../operations/alertUtils';
import { PERIODS, downloadCsv, periodRange } from './reportPeriods';

const Kpi = ({ label, value, color, caption }) => (
  <Card variant="outlined" sx={{ p: 1.5, borderRadius: 3, height: '100%' }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography variant="h5" fontWeight={800} sx={{ color }}>{value}</Typography>
    {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
  </Card>
);

// Custom alerts report: the alerts raised by the user's rules in the period, filtered by rule, unit and priority,
// with totals, alerts per day and per hour, top rules and units, handling status and CSV / print export
const CustomAlertsReportPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const [rules, setRules] = useState([]);
  const [ruleIds, setRuleIds] = useState([]);
  const [units, setUnits] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [period, setPeriod] = useState('week');
  const [custom, setCustom] = useState({ from: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrThrow('/api/alert-rules').then((response) => response.json()).then(setRules).catch(() => {});
  }, []);

  const run = async () => {
    const [from, to] = periodRange(period, custom);
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    ruleIds.forEach((id) => query.append('ruleId', id));
    units.forEach((unit) => query.append('deviceId', unit.id));
    severities.forEach((severity) => query.append('severity', severity));
    setLoading(true);
    setError(null);
    try {
      setReport(await (await fetchOrThrow(`/api/alert-rules/report?${query}`)).json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, [period, ruleIds.join(), units.length, severities.join()]);

  const summary = report?.summary;
  const items = report?.items || [];
  const byDay = useMemo(() => Object.entries(summary?.byDay || {}).map(([day, count]) => ({ day, count })), [summary]);
  const byHour = useMemo(() => (summary?.byHour || []).map((count, hour) => ({ hour, count })), [summary]);
  const top = (map) => Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const critical = summary?.bySeverity?.critical || 0;

  const exportCsv = () => downloadCsv('alertas-personalizadas', [t('positionFixTime'), t('ruleTitleColumn'), t('reportDevice'), t('rulePriority'), t('ruleMessage'), t('opsValue'), t('alertStatusTitle')],
    items.map((item) => [dayjs(item.eventTime).format('YYYY-MM-DD HH:mm:ss'), item.ruleName, item.deviceName, t(`alertSeverity${capitalize(item.severity || 'medium')}`), item.message, item.value, t(`alertStatus${capitalize(item.status)}`)]));

  const TopList = ({ title, entries, color }) => (
    <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3, height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>{title}</Typography>
      {!entries.length && <Typography variant="body2" color="text.secondary">{t('opsNoData')}</Typography>}
      {entries.map(([name, count]) => (
        <Box key={name} sx={{ mb: 0.75 }}>
          <Stack direction="row" justifyContent="space-between"><Typography variant="body2" noWrap>{name}</Typography><Typography variant="body2" fontWeight={700}>{count}</Typography></Stack>
          <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(color, 0.12) }}><Box sx={{ height: '100%', width: `${(count / entries[0][1]) * 100}%`, bgcolor: color, borderRadius: 3 }} /></Box>
        </Box>
      ))}
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('customAlertsReportTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('customAlertsReportSubtitle')}</Typography>
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
        <Tooltip title={t('opsExportCsv')}><span><Button variant="outlined" onClick={exportCsv} disabled={!items.length}><DownloadIcon /></Button></span></Tooltip>
        <Tooltip title={t('opsPrint')}><Button variant="outlined" onClick={() => window.print()}><PrintIcon /></Button></Tooltip>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Autocomplete multiple size="small" sx={{ flex: 1 }} limitTags={3} options={rules} getOptionLabel={(option) => option.name} value={rules.filter((rule) => ruleIds.includes(rule.id))} onChange={(_, next) => setRuleIds(next.map((rule) => rule.id))} renderInput={(params) => <TextField {...params} label={t('ruleTitle')} placeholder={ruleIds.length ? '' : t('opsAllRules')} />} />
        <Autocomplete multiple size="small" sx={{ flex: 1 }} limitTags={3} options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))} getOptionLabel={(option) => option.name} value={units} onChange={(_, next) => setUnits(next)} renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={units.length ? '' : t('drivingAllUnits')} />} />
        <Stack direction="row" spacing={0.5} alignItems="center">
          {SEVERITIES.map((severity) => {
            const active = !severities.length || severities.includes(severity);
            return <Chip key={severity} label={t(`alertSeverity${capitalize(severity)}`)} onClick={() => setSeverities(severities.includes(severity) ? severities.filter((item) => item !== severity) : [...severities, severity])} sx={{ fontWeight: 700, bgcolor: alpha(SEVERITY_COLORS[severity], active ? 0.16 : 0.04), color: active ? SEVERITY_COLORS[severity] : 'text.disabled' }} />;
          })}
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {summary && (
        <>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('opsTotalAlerts')} value={summary.total} color={theme.palette.primary.main} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('alertSeverityCritical')} value={critical} color={SEVERITY_COLORS.critical} caption={summary.total ? `${Math.round((critical / summary.total) * 100)} %` : null} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('opsUnitsAffected')} value={summary.units} /></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('opsHandled')} value={`${summary.total ? Math.round((summary.handled / summary.total) * 100) : 0} %`} color={theme.palette.success.main} caption={`${summary.handled} ${t('opsClosed')}`} /></Grid>
          </Grid>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('opsAlertsByDay')}</Typography>
                <Box sx={{ height: 180 }}>
                  <ResponsiveContainer>
                    <BarChart data={byDay} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                      <XAxis dataKey="day" tickFormatter={(day) => dayjs(day).format('DD/MM')} tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <ChartTooltip labelFormatter={(day) => dayjs(day).format('DD/MM/YYYY')} />
                      <Bar dataKey="count" name={t('opsTotalAlerts')} fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('alertByHour')}</Typography>
                <Box sx={{ height: 180 }}>
                  <ResponsiveContainer>
                    <BarChart data={byHour} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                      <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}h`} tick={{ fontSize: 10 }} interval={2} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <ChartTooltip labelFormatter={(hour) => `${hour}:00–${hour}:59`} />
                      <Bar dataKey="count" name={t('opsTotalAlerts')} fill={SEVERITY_COLORS.high} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
          </Grid>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid size={{ xs: 12, md: 4 }}><TopList title={t('opsTopRules')} entries={top(summary.byRule)} color={theme.palette.primary.main} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TopList title={t('alertTopUnits')} entries={top(summary.byDevice)} color={SEVERITY_COLORS.high} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('alertBySeverity')}</Typography>
                {SEVERITIES.map((severity) => (
                  <Stack key={severity} direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SEVERITY_COLORS[severity] }} />
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>{t(`alertSeverity${capitalize(severity)}`)}</Typography>
                    <Typography variant="body2" fontWeight={700}>{summary.bySeverity?.[severity] || 0}</Typography>
                  </Stack>
                ))}
              </Card>
            </Grid>
          </Grid>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('positionFixTime')}</TableCell>
                    <TableCell>{t('ruleTitleColumn')}</TableCell>
                    <TableCell>{t('reportDevice')}</TableCell>
                    <TableCell>{t('ruleMessage')}</TableCell>
                    <TableCell>{t('alertStatusTitle')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.slice(0, 500).map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(item.eventTime).format('DD/MM HH:mm')}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.medium, flexShrink: 0 }} />
                          <span>{item.ruleName}</span>
                        </Stack>
                      </TableCell>
                      <TableCell>{item.deviceName}</TableCell>
                      <TableCell>{item.message}</TableCell>
                      <TableCell><Chip size="small" label={t(`alertStatus${capitalize(item.status)}`)} sx={{ height: 20, fontSize: 11, color: STATUS_COLORS[item.status], bgcolor: alpha(STATUS_COLORS[item.status] || '#607d8b', 0.12) }} /></TableCell>
                      <TableCell align="right">
                        <Tooltip title={t('panelReplay')}>
                          <IconButton size="small" onClick={() => navigate(`/replay?deviceId=${item.deviceId}&from=${encodeURIComponent(dayjs(item.eventTime).subtract(15, 'minute').toISOString())}&to=${encodeURIComponent(dayjs(item.eventTime).add(15, 'minute').toISOString())}`)}><ReplayIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!items.length && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">{t('ruleNoHistory')}</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </>
      )}
    </Container>
  );
};

export default CustomAlertsReportPage;
