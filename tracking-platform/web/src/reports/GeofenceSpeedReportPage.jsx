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
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  PERIODS, downloadCsv, formatDuration, periodRange,
} from './reportPeriods';

export const SPEED_LEVELS = ['mild', 'danger', 'critical'];
export const LEVEL_COLORS = {
  tolerance: '#9e9e9e', mild: '#f9a825', danger: '#e65100', critical: '#c62828',
};
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Geofence speeding report: episodes above the geofences' own limits graded by the excess (within tolerance, mild,
// dangerous, critical), totals by level and geofence, a ranking of units by seriousness and the detail of every
// episode with its peak and messages at each level, with CSV and print
const GeofenceSpeedReportPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const geofences = useSelector((state) => state.geofences.items);
  const limited = useMemo(() => Object.values(geofences).filter((geofence) => geofence.attributes?.speedLimitKmh), [geofences]);
  const [period, setPeriod] = useState('week');
  const [custom, setCustom] = useState({ from: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [geofenceIds, setGeofenceIds] = useState([]);
  const [units, setUnits] = useState([]);
  const [levels, setLevels] = useState([]);
  const [showTolerance, setShowTolerance] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    const ids = units.length ? units.map((unit) => unit.id) : Object.keys(devices);
    if (!ids.length) return;
    const [from, to] = periodRange(period, custom);
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    ids.forEach((id) => query.append('deviceId', id));
    geofenceIds.forEach((id) => query.append('geofenceId', id));
    levels.forEach((level) => query.append('level', level));
    setLoading(true);
    setError(null);
    try {
      setReport(await (await fetchOrThrow(`/api/geofence-speed/report?${query}`)).json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, [period, geofenceIds.join(), units.length, levels.join(), Object.keys(devices).length]);

  const summary = report?.summary;
  const episodes = (report?.episodes || []).filter((episode) => showTolerance || episode.level !== 'tolerance');
  const byGeofence = Object.entries(summary?.byGeofence || {}).map(([name, entry]) => ({ name: `${name} (${entry.speedLimit})`, ...entry }));
  const infractions = SPEED_LEVELS.reduce((sum, level) => sum + (summary?.episodesByLevel?.[level] || 0), 0);

  const exportCsv = () => downloadCsv('excesos-geocercas', [t('reportStartTime'), t('reportEndTime'), t('reportDevice'), t('sharedGeofence'), t('geofenceSpeedLimit'), t('reportMaximumSpeed'), t('geofenceExcess'), t('reportDuration'), t('geofenceLevel'), ...SPEED_LEVELS.map((level) => `${t('geofencePoints')} ${t(`geofenceLevel${capitalize(level)}`)}`)],
    episodes.map((episode) => [dayjs(episode.start).format('YYYY-MM-DD HH:mm:ss'), dayjs(episode.end).format('YYYY-MM-DD HH:mm:ss'), episode.deviceName, episode.geofenceName, episode.speedLimit, episode.maxSpeed, episode.maxExcess, Math.round(episode.duration / 1000), t(`geofenceLevel${capitalize(episode.level)}`), ...SPEED_LEVELS.map((level) => episode.points[level] || 0)]));

  const LevelChip = ({ level }) => (
    <Chip size="small" label={t(`geofenceLevel${capitalize(level)}`)} sx={{ height: 22, fontWeight: 700, color: LEVEL_COLORS[level], bgcolor: alpha(LEVEL_COLORS[level], 0.14) }} />
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('geofenceSpeedReportTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('geofenceSpeedReportSubtitle')}</Typography>
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
        <Tooltip title={t('opsExportCsv')}><span><Button variant="outlined" onClick={exportCsv} disabled={!episodes.length}><DownloadIcon /></Button></span></Tooltip>
        <Tooltip title={t('opsPrint')}><Button variant="outlined" onClick={() => window.print()}><PrintIcon /></Button></Tooltip>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <Autocomplete multiple size="small" sx={{ flex: 1 }} limitTags={3} options={limited} getOptionLabel={(option) => `${option.name} (${option.attributes.speedLimitKmh} km/h)`} value={limited.filter((geofence) => geofenceIds.includes(geofence.id))} onChange={(_, next) => setGeofenceIds(next.map((geofence) => geofence.id))} renderInput={(params) => <TextField {...params} label={t('sharedGeofences')} placeholder={geofenceIds.length ? '' : t('geofenceAllWithLimit')} />} />
        <Autocomplete multiple size="small" sx={{ flex: 1 }} limitTags={3} options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))} getOptionLabel={(option) => option.name} value={units} onChange={(_, next) => setUnits(next)} renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={units.length ? '' : t('drivingAllUnits')} />} />
        <Stack direction="row" spacing={0.5} alignItems="center">
          {SPEED_LEVELS.map((level) => {
            const active = !levels.length || levels.includes(level);
            return <Chip key={level} label={t(`geofenceLevel${capitalize(level)}`)} onClick={() => setLevels(levels.includes(level) ? levels.filter((item) => item !== level) : [...levels, level])} sx={{ fontWeight: 700, bgcolor: alpha(LEVEL_COLORS[level], active ? 0.18 : 0.04), color: active ? LEVEL_COLORS[level] : 'text.disabled' }} />;
          })}
          <Chip label={t('geofenceLevelTolerance')} variant={showTolerance ? 'filled' : 'outlined'} onClick={() => setShowTolerance(!showTolerance)} />
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {summary && !summary.geofencesWithLimit && <Alert severity="info" sx={{ mb: 2 }}>{t('geofenceNoLimits')}</Alert>}
      {summary && (
        <>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Card variant="outlined" sx={{ p: 1.5, borderRadius: 3, height: '100%' }}>
                <Typography variant="caption" color="text.secondary">{t('geofenceInfractions')}</Typography>
                <Typography variant="h5" fontWeight={800}>{infractions}</Typography>
                <Typography variant="caption" color="text.secondary">{`${summary.episodesByLevel.tolerance} ${t('geofenceWithinTolerance')}`}</Typography>
              </Card>
            </Grid>
            {SPEED_LEVELS.map((level) => (
              <Grid key={level} size={{ xs: 6, md: 3 }}>
                <Card variant="outlined" sx={{ p: 1.5, borderRadius: 3, height: '100%', borderLeft: `5px solid ${LEVEL_COLORS[level]}` }}>
                  <Typography variant="caption" color="text.secondary">{t(`geofenceLevel${capitalize(level)}`)}</Typography>
                  <Typography variant="h5" fontWeight={800} sx={{ color: LEVEL_COLORS[level] }}>{summary.episodesByLevel[level]}</Typography>
                  <Typography variant="caption" color="text.secondary">{`${summary.pointsByLevel[level]} ${t('geofencePointsLower')}`}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('geofenceByGeofence')}</Typography>
                <Box sx={{ height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={byGeofence} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <ChartTooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {SPEED_LEVELS.map((level) => <Bar key={level} dataKey={level} stackId="a" name={t(`geofenceLevel${capitalize(level)}`)} fill={LEVEL_COLORS[level]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card variant="outlined" sx={{ p: 1.75, borderRadius: 3, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('geofenceRanking')}</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>{t('geofenceRankingHelp')}</Typography>
                {!report.units.length && <Typography variant="body2" color="text.secondary">{t('opsNoData')}</Typography>}
                {report.units.slice(0, 7).map((unit, index) => (
                  <Stack key={unit.deviceId} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ width: 18 }}>{index + 1}</Typography>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" noWrap>{unit.deviceName}</Typography>
                      <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: alpha(theme.palette.text.primary, 0.06) }}>
                        {SPEED_LEVELS.map((level) => <Box key={level} sx={{ flex: unit.levels[level] || 0, bgcolor: LEVEL_COLORS[level] }} />)}
                      </Box>
                    </Box>
                    <Tooltip title={`+${unit.maxExcess} km/h máx.`}><Typography variant="body2" fontWeight={800} sx={{ color: LEVEL_COLORS.critical, width: 36, textAlign: 'right' }}>{unit.score}</Typography></Tooltip>
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
                    <TableCell>{t('reportStartTime')}</TableCell>
                    <TableCell>{t('reportDevice')}</TableCell>
                    <TableCell>{t('sharedGeofence')}</TableCell>
                    <TableCell align="right">{t('reportMaximumSpeed')}</TableCell>
                    <TableCell align="right">{t('geofenceExcess')}</TableCell>
                    <TableCell align="right">{t('reportDuration')}</TableCell>
                    <TableCell>{t('geofencePoints')}</TableCell>
                    <TableCell>{t('geofenceLevel')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {episodes.slice(0, 500).map((episode) => (
                    <TableRow key={`${episode.deviceId}-${episode.start}`} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(episode.start).format('DD/MM HH:mm:ss')}</TableCell>
                      <TableCell>{episode.deviceName}</TableCell>
                      <TableCell>{`${episode.geofenceName} (${episode.speedLimit} km/h)`}</TableCell>
                      <TableCell align="right">{`${episode.maxSpeed} km/h`}</TableCell>
                      <TableCell align="right" sx={{ color: LEVEL_COLORS[episode.level], fontWeight: 800 }}>{`+${episode.maxExcess} km/h`}</TableCell>
                      <TableCell align="right">{episode.duration < 60000 ? `${Math.round(episode.duration / 1000)} s` : formatDuration(episode.duration)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {['tolerance', ...SPEED_LEVELS].filter((level) => episode.points[level]).map((level) => (
                            <Tooltip key={level} title={t(`geofenceLevel${capitalize(level)}`)}><Box sx={{ px: 0.75, borderRadius: 1, fontSize: 12, fontWeight: 700, color: '#fff', bgcolor: LEVEL_COLORS[level] }}>{episode.points[level]}</Box></Tooltip>
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell><LevelChip level={episode.level} /></TableCell>
                      <TableCell align="right">
                        <Tooltip title={t('panelReplay')}>
                          <IconButton size="small" onClick={() => navigate(`/replay?deviceId=${episode.deviceId}&from=${encodeURIComponent(dayjs(episode.start).subtract(5, 'minute').toISOString())}&to=${encodeURIComponent(dayjs(episode.end).add(5, 'minute').toISOString())}`)}><ReplayIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!episodes.length && <TableRow><TableCell colSpan={9}><Typography variant="body2" color="text.secondary">{t('geofenceNoEpisodes')}</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </>
      )}
    </Container>
  );
};

export default GeofenceSpeedReportPage;
