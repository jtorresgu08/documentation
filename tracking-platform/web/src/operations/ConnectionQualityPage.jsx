import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Card, Chip, Container, Drawer, Grid, IconButton, LinearProgress, MenuItem, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TableSortLabel, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import VerifiedIcon from '@mui/icons-material/Verified';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import {
  Bar, BarChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatPeriod } from '../main/DeviceRow';
import { capitalize } from './alertUtils';

const PERIODS = {
  last24h: () => dayjs().subtract(24, 'hour'),
  last3d: () => dayjs().subtract(3, 'day'),
  last7d: () => dayjs().subtract(7, 'day'),
};

const GRADE_COLORS = {
  excellent: '#2e7d32', good: '#1565c0', fair: '#e65100', poor: '#c62828',
};

const ScoreRing = ({ value, color, size = 40 }) => {
  const radius = size / 2 - 4;
  const length = 2 * Math.PI * radius;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(128,128,128,0.2)" strokeWidth="4" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * length} ${length}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Typography variant="caption" fontWeight={700} sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{value}</Typography>
    </Box>
  );
};

// Connection quality of the fleet: who reports well and who has gaps, invalid GPS, weak signal, power problems or
// reconnects, with a 0-100 score per unit, reports per hour, gap list and what to check
const ConnectionQualityPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);

  const [period, setPeriod] = useState('last24h');
  const [units, setUnits] = useState([]);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: 'score', asc: true });
  const [issueFilter, setIssueFilter] = useState(null);
  const [detail, setDetail] = useState(null);

  const range = () => ({ from: PERIODS[period]().toISOString(), to: dayjs().add(1, 'minute').toISOString() });

  useEffect(() => {
    if (!Object.keys(devices).length) {
      return;
    }
    const run = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams(range());
        (units.length ? units : Object.values(devices)).forEach((device) => query.append('deviceId', device.id));
        setItems(await (await fetchOrThrow(`/api/quality?${query}`)).json());
        setError(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [period, units, Object.keys(devices).length]);

  const openDetail = async (item) => {
    setDetail({ ...item, loading: true });
    const query = new URLSearchParams({ ...range(), deviceId: item.deviceId, details: true });
    const [data] = await (await fetchOrThrow(`/api/quality?${query}`)).json();
    setDetail(data);
  };

  const issueCounts = useMemo(() => {
    const counts = {};
    (items || []).forEach((item) => item.issues.forEach((issue) => { counts[issue] = (counts[issue] || 0) + 1; }));
    return counts;
  }, [items]);

  const rows = useMemo(() => {
    const list = (items || []).filter((item) => !issueFilter || item.issues.includes(issueFilter));
    const value = (item) => {
      const raw = item[sort.key];
      return raw == null ? (sort.asc ? Infinity : -Infinity) : raw;
    };
    return [...list].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      if (typeof x === 'string') return sort.asc ? x.localeCompare(y) : y.localeCompare(x);
      return sort.asc ? x - y : y - x;
    });
  }, [items, sort, issueFilter]);

  const average = items?.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : null;
  const grades = (items || []).reduce((counts, item) => ({ ...counts, [item.grade]: (counts[item.grade] || 0) + 1 }), {});
  const offline = (items || []).filter((item) => item.issues.includes('offline')).length;

  const exportCsv = () => {
    const header = ['Unidad', 'IMEI', 'Puntaje', 'Calificación', 'Cobertura %', 'GPS válido %', 'Intervalo s', 'Satélites', 'Señal %', 'Alimentación V', 'Reconexiones', 'Huecos', 'Último reporte', 'Problemas'];
    const lines = rows.map((item) => [
      item.name, item.uniqueId, item.score, t(`qualityGrade${capitalize(item.grade)}`), item.coverage ?? '', item.validity ?? '', item.interval ?? '',
      item.satellites ?? '', item.signal ?? '', item.power ?? '', item.reconnections, item.gapCount ?? 0,
      item.lastUpdate ? dayjs(item.lastUpdate).format('YYYY-MM-DD HH:mm') : '', item.issues.map((issue) => t(`qualityIssue${capitalize(issue)}`)).join(' / '),
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `calidad-conexion-${dayjs().format('YYYYMMDD')}.csv`;
    link.click();
  };

  const header = (key, label, align = 'left') => (
    <TableCell align={align} sortDirection={sort.key === key ? (sort.asc ? 'asc' : 'desc') : false}>
      <TableSortLabel active={sort.key === key} direction={sort.asc ? 'asc' : 'desc'} onClick={() => setSort({ key, asc: sort.key === key ? !sort.asc : true })}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  const bar = (value, color) => (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 90 }}>
      <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(100, value || 0)}%`, height: '100%', bgcolor: color }} />
      </Box>
      <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{value != null ? `${Math.round(value)}%` : '—'}</Typography>
    </Stack>
  );

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('qualityTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('qualitySubtitle')}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 150 }}>
            {Object.keys(PERIODS).map((key) => <MenuItem key={key} value={key}>{t(`qualityPeriod${capitalize(key)}`)}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            limitTags={1}
            sx={{ minWidth: 220 }}
            options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
            getOptionLabel={(option) => option.name}
            value={units}
            onChange={(_, value) => setUnits(value)}
            renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={units.length ? '' : t('drivingAllUnits')} />}
          />
          <Tooltip title={t('fuelExportCsv')}><span><IconButton onClick={exportCsv} disabled={!rows.length} aria-label={t('fuelExportCsv')}><DownloadIcon /></IconButton></span></Tooltip>
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {items && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <ScoreRing value={average ?? 0} color={average >= 85 ? GRADE_COLORS.excellent : average >= 70 ? GRADE_COLORS.good : average >= 50 ? GRADE_COLORS.fair : GRADE_COLORS.poor} size={52} />
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('qualityFleetScore')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{`${items.length} ${t('quickVehicles')}`}</Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
              <Typography variant="caption" color="text.secondary">{t('qualityGrades')}</Typography>
              <Stack direction="row" sx={{ height: 10, borderRadius: 5, overflow: 'hidden', my: 1, bgcolor: 'action.hover' }}>
                {Object.keys(GRADE_COLORS).map((grade) => <Box key={grade} sx={{ width: `${((grades[grade] || 0) / items.length) * 100}%`, bgcolor: GRADE_COLORS[grade] }} />)}
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {Object.keys(GRADE_COLORS).map((grade) => (
                  <Typography key={grade} variant="caption"><b style={{ color: GRADE_COLORS[grade] }}>{grades[grade] || 0}</b>{` ${t(`qualityGrade${capitalize(grade)}`)}`}</Typography>
                ))}
              </Stack>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha(GRADE_COLORS.poor, 0.12), color: GRADE_COLORS.poor }}><CloudOffIcon /></Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('qualityOffline')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{offline}</Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha(GRADE_COLORS.fair, 0.12), color: GRADE_COLORS.fair }}><WarningAmberIcon /></Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('qualityWithIssues')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{items.filter((item) => item.issues.length).length}</Typography>
                </Box>
              </Stack>
            </Card>
          </Grid>
        </Grid>
      )}

      {Object.keys(issueCounts).length > 0 && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={t('qualityAllUnits')} color={!issueFilter ? 'primary' : 'default'} onClick={() => setIssueFilter(null)} />
          {Object.entries(issueCounts).map(([issue, count]) => (
            <Chip key={issue} size="small" label={`${t(`qualityIssue${capitalize(issue)}`)} · ${count}`} color={issueFilter === issue ? 'warning' : 'default'} variant={issueFilter === issue ? 'filled' : 'outlined'} onClick={() => setIssueFilter(issueFilter === issue ? null : issue)} />
          ))}
        </Stack>
      )}

      {items && (
        <Card variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {header('name', t('reportDevice'))}
                {header('score', t('qualityScore'))}
                {header('coverage', t('qualityCoverage'))}
                {header('validity', t('qualityValidity'))}
                {header('interval', t('qualityInterval'), 'right')}
                {header('satellites', t('qualitySatellites'), 'right')}
                {header('signal', t('qualitySignal'))}
                {header('reconnections', t('qualityReconnections'), 'right')}
                {header('lastUpdate', t('qualityLastReport'), 'right')}
                <TableCell>{t('qualityIssues')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.deviceId} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(item)}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{[item.model, item.protocol].filter(Boolean).join(' · ')}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ScoreRing value={item.score} color={GRADE_COLORS[item.grade]} />
                      <Typography variant="caption" sx={{ color: GRADE_COLORS[item.grade], fontWeight: 700 }}>{t(`qualityGrade${capitalize(item.grade)}`)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{bar(item.coverage, theme.palette.primary.main)}</TableCell>
                  <TableCell>{bar(item.validity, theme.palette.success.main)}</TableCell>
                  <TableCell align="right">{item.interval ? `${item.interval} s` : '—'}</TableCell>
                  <TableCell align="right">{item.satellites ?? '—'}</TableCell>
                  <TableCell>{bar(item.signal, '#6a1b9a')}</TableCell>
                  <TableCell align="right">{item.reconnections}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{item.lastUpdate ? formatPeriod(Date.now() - item.lastUpdate) : '—'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {item.issues.length ? item.issues.map((issue) => (
                        <Chip key={issue} size="small" label={t(`qualityIssue${capitalize(issue)}`)} sx={{ height: 22, fontSize: 11, bgcolor: alpha(GRADE_COLORS.fair, 0.12), color: GRADE_COLORS.fair }} />
                      )) : <VerifiedIcon fontSize="small" color="success" />}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Drawer anchor="right" open={Boolean(detail)} onClose={() => setDetail(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 2.5 } }}>
        {detail && (
          <>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <ScoreRing value={detail.score} color={GRADE_COLORS[detail.grade]} size={56} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" fontWeight={700}>{detail.name}</Typography>
                <Typography variant="body2" color="text.secondary">{`${detail.uniqueId}${detail.phone ? ` · ${detail.phone}` : ''}`}</Typography>
              </Box>
              <IconButton onClick={() => setDetail(null)} aria-label={t('sharedHide')}><CloseIcon /></IconButton>
            </Stack>
            {detail.loading && <LinearProgress />}
            <Grid container spacing={1}>
              {[
                [t('qualityReports'), detail.reports],
                [t('qualityInterval'), detail.interval ? `${detail.interval} s` : '—'],
                [t('qualityCoverage'), detail.coverage != null ? `${detail.coverage} %` : '—'],
                [t('qualityValidity'), detail.validity != null ? `${detail.validity} %` : '—'],
                [t('qualitySatellites'), detail.satellites ?? '—'],
                ['HDOP', detail.hdop ?? '—'],
                [t('qualitySignal'), detail.signal != null ? `${detail.signal} %` : '—'],
                [t('qualityPower'), detail.power != null ? `${detail.power} V` : '—'],
                [t('qualityReconnections'), detail.reconnections],
                [t('qualityLostTime'), detail.lostTime ? formatPeriod(detail.lostTime) : '0'],
              ].map(([label, value]) => (
                <Grid key={label} size={6}>
                  <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography fontWeight={700}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            {detail.hourly && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('qualityReportsPerHour')}</Typography>
                <Box sx={{ height: 140 }}>
                  <ResponsiveContainer>
                    <BarChart data={detail.hourly.map((count, index) => ({ hour: dayjs(PERIODS[period]()).add(index, 'hour').format('DD HH:00'), count }))}>
                      <XAxis dataKey="hour" fontSize={9} interval="preserveStartEnd" stroke={theme.palette.text.secondary} />
                      <YAxis fontSize={10} width={30} stroke={theme.palette.text.secondary} />
                      <ChartTooltip />
                      <Bar dataKey="count" name={t('qualityReports')} fill={theme.palette.primary.main} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            )}
            {detail.issues?.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('qualityWhatToCheck')}</Typography>
                {detail.issues.map((issue) => (
                  <Alert key={issue} severity="warning" sx={{ mb: 1 }}>
                    <b>{t(`qualityIssue${capitalize(issue)}`)}</b>
                    {`: ${t(`qualityAdvice${capitalize(issue)}`)}`}
                  </Alert>
                ))}
              </Box>
            )}
            {detail.gaps?.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('qualityGaps')}</Typography>
                {detail.gaps.map((gap) => (
                  <Stack key={gap.start} direction="row" spacing={1} sx={{ py: 0.75, borderTop: `1px solid ${theme.palette.divider}` }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2">{`${dayjs(gap.start).format('DD/MM HH:mm')} → ${dayjs(gap.end).format('DD/MM HH:mm')}`}</Typography>
                      <Typography variant="caption" color="text.secondary">{gap.working ? t('qualityGapWorking') : t('qualityGapSilent')}</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={700}>{formatPeriod(gap.duration)}</Typography>
                    <Tooltip title={t('alertViewOnMap')}>
                      <IconButton size="small" component="a" href={`https://www.google.com/maps?q=${gap.latitude},${gap.longitude}`} target="_blank" rel="noreferrer" aria-label={t('alertViewOnMap')}>
                        <SignalCellularAltIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Box>
            )}
          </>
        )}
      </Drawer>
    </Container>
  );
};

export default ConnectionQualityPage;
