import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Grid, IconButton, InputAdornment, LinearProgress,
  ListItemIcon, ListItemText, Menu, MenuItem, Pagination, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import InsightsIcon from '@mui/icons-material/Insights';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PlaceIcon from '@mui/icons-material/Place';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import UndoIcon from '@mui/icons-material/Undo';
import MapIcon from '@mui/icons-material/Map';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import BarChartIcon from '@mui/icons-material/BarChart';
import TuneIcon from '@mui/icons-material/Tune';
import SpeedIcon from '@mui/icons-material/Speed';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useDeviceReadonly } from '../common/util/permissions';
import { devicesActions } from '../store';
import AddressValue from '../common/components/AddressValue';
import { INFO_PREFIX, fuelSensors } from '../common/util/sensors';
import FuelChart from './fuel/FuelChart';
import FuelEventsMap from './fuel/FuelEventsMap';

const REVIEWS_ATTRIBUTE = 'fuel.reviews';
const PAGE_SIZE = 5;

const PERIODS = {
  today: () => [dayjs().startOf('day'), dayjs()],
  yesterday: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().startOf('day')],
  last6h: () => [dayjs().subtract(6, 'hour'), dayjs()],
  last12h: () => [dayjs().subtract(12, 'hour'), dayjs()],
  last24h: () => [dayjs().subtract(1, 'day'), dayjs()],
  last7d: () => [dayjs().subtract(7, 'day'), dayjs()],
  thisMonth: () => [dayjs().startOf('month'), dayjs()],
};
const ZOOMS = [['last6h', '6 h'], ['last12h', '12 h'], ['last24h', '24 h'], ['last7d', '7 d']];

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const parseReviews = (device) => {
  try {
    return JSON.parse(device?.attributes?.[REVIEWS_ATTRIBUTE] || '{}');
  } catch {
    return {};
  }
};

const IconBox = ({ color, size = 52, children }) => (
  <Box sx={{
    width: size, height: size, borderRadius: size > 36 ? 2.5 : '50%', bgcolor: color, color: 'common.white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }}
  >
    {children}
  </Box>
);

const Kpi = ({
  icon, color, label, value, caption,
}) => (
  <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ p: 2 }}>
      <IconBox color={color} size={46}>{icon}</IconBox>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: { sm: 'nowrap' } }}>{label}</Typography>
        <Typography variant="h5" fontWeight={700} sx={{ color, lineHeight: 1.3 }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">{caption}</Typography>
      </Box>
    </Stack>
  </Card>
);

const SectionTitle = ({ icon, title, children }) => (
  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
    <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
    <Typography variant="h6" fontWeight={700}>{title}</Typography>
    {children}
  </Stack>
);

// Fuel report: KPIs, level chart with fills and drains, period summary with estimated efficiency, reviewable
// events with address and the event map; exportable to CSV (Excel) and printable to PDF
const FuelReportPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const deviceReadonly = useDeviceReadonly();

  const devices = useSelector((state) => state.devices.items);
  const deviceId = Number(searchParams.get('deviceId')) || null;
  const device = devices[deviceId];

  const [period, setPeriod] = useState(searchParams.get('from') ? 'custom' : 'last24h');
  const [customFrom, setCustomFrom] = useState(dayjs(searchParams.get('from') || dayjs().subtract(1, 'day')).format('YYYY-MM-DDTHH:mm'));
  const [customTo, setCustomTo] = useState(dayjs(searchParams.get('to') || dayjs()).format('YYYY-MM-DDTHH:mm'));
  const [sensorId, setSensorId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('litres');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState(null);

  const deviceOptions = useMemo(() => Object.values(devices)
    .sort((a, b) => (fuelSensors(b).length > 0) - (fuelSensors(a).length > 0) || a.name.localeCompare(b.name)), [devices]);
  const sensors = fuelSensors(device);
  const reviews = parseReviews(device);

  const generate = useCatch(async (value = period, sensor = sensorId) => {
    if (!deviceId) {
      return;
    }
    const [from, to] = value === 'custom' ? [dayjs(customFrom), dayjs(customTo)] : PERIODS[value]();
    setLoading(true);
    try {
      const query = new URLSearchParams({ deviceId, from: from.toISOString(), to: to.toISOString() });
      if (sensor) {
        query.append('sensorId', sensor);
      }
      const response = await fetchOrThrow(`/api/sensors/fuel?${query.toString()}`);
      const result = await response.json();
      setReport(result);
      setSensorId(result.sensor.id);
      setSelected(null);
      setPage(1);
    } catch (error) {
      if (!error.message.includes('No fuel sensor')) {
        throw error;
      }
      setReport({ empty: true });
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (deviceId) {
      generate();
    }
  }, [deviceId]);

  const capacity = Number(report?.sensor?.tankCapacity || device?.attributes?.[`${INFO_PREFIX}tankCapacity`] || 0);
  const percent = mode === 'percent' && capacity > 0;
  const scale = percent ? 100 / capacity : 1;
  const unit = percent ? '%' : (report?.sensor?.unit || 'L');
  const format = (value) => `${(value * scale).toFixed(1)} ${unit}`;

  const summary = useMemo(() => {
    if (!report?.summary) {
      return null;
    }
    const valid = report.changes.filter((change) => reviews[change.time] !== 'false');
    const fills = valid.filter((change) => change.type === 'fill');
    const drains = valid.filter((change) => change.type === 'drain');
    const filled = fills.reduce((sum, change) => sum + change.amount, 0);
    const drained = drains.reduce((sum, change) => sum + change.amount, 0);
    const consumed = Math.max(0, report.summary.start - report.summary.end + filled - drained);
    return {
      ...report.summary,
      filled,
      drained,
      consumed,
      fills: fills.length,
      drains: drains.length,
      efficiency: consumed > 0.5 && report.summary.distance > 0 ? report.summary.distance / consumed : null,
    };
  }, [report, device]);

  const events = useMemo(() => {
    if (!report?.summary || !report.points.length) {
      return [];
    }
    const levelEvent = (point, key) => ({
      key, kind: 'level', time: point.time, amount: point.level, latitude: point.latitude, longitude: point.longitude, status: 'normal',
    });
    const changes = report.changes.map((change) => {
      const review = reviews[change.time];
      return {
        key: change.time,
        kind: change.type,
        time: change.time,
        amount: change.amount,
        before: change.before,
        after: change.after,
        latitude: change.latitude,
        longitude: change.longitude,
        status: { valid: 'valid', false: 'false' }[review] || 'pending',
        title: `${change.type === 'fill' ? '+' : '−'}${change.amount.toFixed(1)} L`,
      };
    });
    return [levelEvent(report.points[0], 'start'), ...changes, levelEvent(report.points[report.points.length - 1], 'end')]
      .sort((a, b) => a.time - b.time);
  }, [report, device]);

  const kindLabel = (value) => t({ fill: 'fuelFill', drain: 'fuelDrain', level: 'fuelLevelReading' }[value]);
  const statusLabel = (status) => t(`fuelStatus${capitalize(status)}`);
  const keyword = search.trim().toLowerCase();
  const filtered = events
    .filter((event) => kind === 'all' || event.kind === kind)
    .filter((event) => !keyword || [kindLabel(event.kind), statusLabel(event.status), dayjs(event.time).format('DD MMM HH:mm'), `${event.latitude}, ${event.longitude}`]
      .some((text) => text.toLowerCase().includes(keyword)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const saveReview = useCatch(async (event, value) => {
    const next = { ...reviews };
    if (value) {
      next[event.time] = value;
    } else {
      delete next[event.time];
    }
    const response = await fetchOrThrow(`/api/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...device, attributes: { ...device.attributes, [REVIEWS_ATTRIBUTE]: JSON.stringify(next) } }),
    });
    dispatch(devicesActions.update([await response.json()]));
  });

  const exportCsv = () => {
    const rows = [
      [device.name, `${dayjs(summary.startTime).format('YYYY-MM-DD HH:mm')} – ${dayjs(summary.endTime).format('YYYY-MM-DD HH:mm')}`],
      [],
      [t('fuelEvent'), t('fuelDateTime'), `${t('fuelAmount')} (L)`, `${t('fuelBefore')} (L)`, `${t('fuelAfter')} (L)`, t('fuelStatus'), t('positionLatitude'), t('positionLongitude')],
      ...events.map((event) => [
        kindLabel(event.kind), dayjs(event.time).format('YYYY-MM-DD HH:mm:ss'), event.amount.toFixed(1),
        event.before?.toFixed(1) ?? '', event.after?.toFixed(1) ?? '', statusLabel(event.status), event.latitude, event.longitude,
      ]),
      [],
      [t('fuelStart'), summary.start.toFixed(1)], [t('fuelEnd'), summary.end.toFixed(1)], [t('fuelFilled'), summary.filled.toFixed(1)],
      [t('fuelDrained'), summary.drained.toFixed(1)], [t('fuelConsumedTotal'), summary.consumed.toFixed(1)],
      [`${t('fuelDistance')} (km)`, summary.distance.toFixed(1)], [`${t('fuelEfficiency')} (km/L)`, summary.efficiency?.toFixed(2) ?? ''],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `combustible-${device.name}-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
    link.click();
  };

  const statusChip = (status) => {
    const color = {
      valid: theme.palette.success.main, pending: theme.palette.warning.main, false: theme.palette.text.disabled, normal: theme.palette.info.main,
    }[status];
    return <Chip size="small" label={statusLabel(status)} sx={{ bgcolor: alpha(color, 0.14), color, fontWeight: 600 }} />;
  };

  const eventIcon = (event) => {
    const Icon = { fill: ArrowUpwardIcon, drain: ArrowDownwardIcon, level: LocalGasStationIcon }[event.kind];
    const color = { fill: theme.palette.success.main, drain: theme.palette.error.main, level: theme.palette.primary.main }[event.kind];
    return <IconBox color={color} size={28}><Icon sx={{ fontSize: 18 }} /></IconBox>;
  };

  const periodText = summary?.startTime
    ? `${dayjs(summary.startTime).format('DD MMM HH:mm')} – ${dayjs(summary.endTime).format('DD MMM HH:mm')}` : '—';
  const cardSx = { borderRadius: 3, p: { xs: 2, md: 2.5 }, height: '100%' };
  const legend = [
    [theme.palette.primary.main, t('fuelLevel')], [theme.palette.text.disabled, t('positionSpeed')],
    [theme.palette.success.main, t('fuelFill')], [theme.palette.error.main, t('fuelDrain')],
  ];

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600, '@media print': { '& .no-print': { display: 'none !important' } } }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
          <IconButton className="no-print" onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700}>{t('fuelReportTitle')}</Typography>
            <Typography variant="body2" color="text.secondary">{device ? `${device.name} · ${t('fuelReportSubtitle')}` : t('fuelReportSubtitle')}</Typography>
          </Box>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="no-print" flexWrap="wrap" useFlexGap>
          <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 160 }}>
            {[...Object.keys(PERIODS), 'custom'].map((value) => (
              <MenuItem key={value} value={value}>{t(`fuelPeriod${capitalize(value)}`)}</MenuItem>
            ))}
          </TextField>
          {period === 'custom' && (
            <>
              <TextField size="small" type="datetime-local" label={t('reportFrom')} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="datetime-local" label={t('reportTo')} value={customTo} onChange={(event) => setCustomTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </>
          )}
          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={deviceOptions}
            getOptionLabel={(option) => option.name}
            value={device || null}
            onChange={(_, value) => {
              setReport(null);
              setSensorId('');
              setSearchParams(value ? { deviceId: value.id } : {});
            }}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <LocalShippingIcon fontSize="small" sx={{ mr: 1, color: fuelSensors(option).length ? 'primary.main' : 'text.disabled' }} />
                {option.name}
              </li>
            )}
            renderInput={(params) => <TextField {...params} label={t('reportDevice')} />}
          />
          {sensors.length > 1 && (
            <TextField select size="small" label={t('fuelSensor')} value={sensorId} onChange={(event) => generate(period, event.target.value)} sx={{ minWidth: 160 }}>
              {sensors.map((sensor) => <MenuItem key={sensor.id} value={sensor.id}>{sensor.name}</MenuItem>)}
            </TextField>
          )}
          <Button variant="contained" startIcon={<InsightsIcon />} disabled={!deviceId || loading} onClick={() => generate()}>
            {t('fuelGenerate')}
          </Button>
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {!deviceId && <Alert severity="info">{t('fuelChooseDevice')}</Alert>}
      {report?.empty && (
        <Alert severity="warning" action={!deviceReadonly && <Button onClick={() => navigate(`/settings/device/${deviceId}`)}>{t('sharedEdit')}</Button>}>
          {t('fuelNoSensor')}
        </Alert>
      )}

      {summary && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, lg: 2.4 }}>
              <Kpi icon={<LocalGasStationIcon />} color={theme.palette.primary.main} label={t('fuelStart')} value={format(summary.start)} caption={summary.startTime ? dayjs(summary.startTime).format('DD MMM HH:mm') : ''} />
            </Grid>
            <Grid size={{ xs: 6, lg: 2.4 }}>
              <Kpi icon={<LocalGasStationIcon />} color={theme.palette.success.dark} label={t('fuelEnd')} value={format(summary.end)} caption={summary.endTime ? dayjs(summary.endTime).format('DD MMM HH:mm') : ''} />
            </Grid>
            <Grid size={{ xs: 6, lg: 2.4 }}>
              <Kpi icon={<ArrowUpwardIcon />} color={theme.palette.success.main} label={`${t('fuelFilled')} (${summary.fills})`} value={format(summary.filled)} caption={`${summary.fills} ${t(summary.fills === 1 ? 'fuelEventOne' : 'fuelEventMany')}`} />
            </Grid>
            <Grid size={{ xs: 6, lg: 2.4 }}>
              <Kpi icon={<ArrowDownwardIcon />} color={theme.palette.error.main} label={`${t('fuelDrained')} (${summary.drains})`} value={format(summary.drained)} caption={`${summary.drains} ${t(summary.drains === 1 ? 'fuelEventOne' : 'fuelEventMany')}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <Kpi icon={<LocalGasStationIcon />} color="#7c4dff" label={t('fuelConsumedTotal')} value={format(summary.consumed)} caption={t('fuelDuringPeriod')} />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 8.5 }}>
              <Card variant="outlined" sx={cardSx}>
                <SectionTitle icon={<LocalGasStationIcon />} title={t('fuelLevelTitle')}>
                  <Box sx={{ flexGrow: 1 }} />
                  <ToggleButtonGroup size="small" exclusive color="primary" value={percent ? 'percent' : 'litres'} onChange={(_, value) => value && setMode(value)} className="no-print">
                    <ToggleButton value="litres">{t('fuelLitres')}</ToggleButton>
                    <ToggleButton value="percent" disabled={!capacity} title={capacity ? '' : t('fuelPercentHelp')}>{t('fuelPercent')}</ToggleButton>
                  </ToggleButtonGroup>
                </SectionTitle>
                {report.points.length ? (
                  <FuelChart points={report.points} changes={report.changes} unit={unit} scale={scale} reviews={reviews} selected={selected} />
                ) : (
                  <Typography color="text.secondary" sx={{ py: 8, textAlign: 'center' }}>{t('sharedNoData')}</Typography>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} sx={{ mt: 1 }}>
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ flexGrow: 1 }}>
                    {legend.map(([color, label]) => (
                      <Stack key={label} direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    color="primary"
                    value={period}
                    className="no-print"
                    onChange={(_, value) => {
                      if (value) {
                        setPeriod(value);
                        generate(value);
                      }
                    }}
                  >
                    {ZOOMS.map(([value, label]) => <ToggleButton key={value} value={value} sx={{ px: 1.5 }}>{label}</ToggleButton>)}
                  </ToggleButtonGroup>
                </Stack>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 3.5 }}>
              <Card variant="outlined" sx={cardSx}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, mb: 1, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                  <InsightsIcon color="primary" />
                  <Box>
                    <Typography fontWeight={700}>{t('fuelSummaryTitle')}</Typography>
                    <Typography variant="caption" color="text.secondary">{`${t('reportPeriod')}: ${periodText}`}</Typography>
                  </Box>
                </Stack>
                <Table size="small">
                  <TableBody>
                    {[
                      [t('fuelStart'), format(summary.start)],
                      [t('fuelEnd'), format(summary.end)],
                      [t('fuelFilled'), format(summary.filled), theme.palette.success.main],
                      [t('fuelDrained'), format(summary.drained), theme.palette.error.main],
                      [t('fuelConsumedTotal'), format(summary.consumed)],
                      [t('fuelDistance'), `${summary.distance.toFixed(1)} km`],
                      [t('fuelPer100'), summary.distance > 1 && summary.consumed > 0 ? `${((summary.consumed / summary.distance) * 100).toFixed(1)} L/100 km` : '—'],
                    ].map(([label, value, color]) => (
                      <TableRow key={label}>
                        <TableCell sx={{ px: 1 }}>{label}</TableCell>
                        <TableCell align="right" sx={{ px: 1, fontWeight: 700, color }}>{value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: alpha(theme.palette.success.main, 0.1) }}>
                  <IconBox color={theme.palette.success.main} size={44}><SpeedIcon /></IconBox>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" color="success.dark" fontWeight={600}>{t('fuelEfficiency')}</Typography>
                    <Typography variant="h5" fontWeight={700} color="success.dark">
                      {summary.efficiency ? `${summary.efficiency.toFixed(2)} km/L` : '—'}
                    </Typography>
                  </Box>
                  <LocalShippingIcon color="success" />
                </Stack>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 8.5 }}>
              <Card variant="outlined" sx={cardSx}>
                <SectionTitle icon={<LocalGasStationIcon />} title={t('fuelLatestEvents')}>
                  <Chip size="small" label={events.length} color="primary" variant="outlined" />
                  <Box sx={{ flexGrow: 1 }} />
                  <Stack direction="row" spacing={1} className="no-print" flexWrap="wrap" useFlexGap>
                    <TextField
                      size="small"
                      placeholder={t('fuelSearchEvents')}
                      value={search}
                      onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
                    />
                    <TextField select size="small" value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }} sx={{ minWidth: 150 }}>
                      <MenuItem value="all">{t('fuelAllTypes')}</MenuItem>
                      {['fill', 'drain', 'level'].map((value) => <MenuItem key={value} value={value}>{kindLabel(value)}</MenuItem>)}
                    </TextField>
                    <Tooltip title={t('fuelExportCsv')}><IconButton onClick={exportCsv}><DownloadIcon /></IconButton></Tooltip>
                    <Tooltip title={t('fuelPrint')}><IconButton onClick={() => window.print()}><PrintIcon /></IconButton></Tooltip>
                    <Tooltip title={t('fuelRefresh')}><IconButton onClick={() => generate()}><RefreshIcon /></IconButton></Tooltip>
                  </Stack>
                </SectionTitle>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600 } }}>
                        <TableCell>{t('fuelEvent')}</TableCell>
                        <TableCell>{t('fuelDateTime')}</TableCell>
                        <TableCell align="right">{t('fuelAmount')}</TableCell>
                        <TableCell>{t('fuelPlace')}</TableCell>
                        <TableCell>{t('fuelStatus')}</TableCell>
                        <TableCell align="right" className="no-print">{t('sharedActions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visible.map((event) => (
                        <TableRow key={event.key} hover selected={selected === event.key} onClick={() => setSelected(event.key)} sx={{ cursor: 'pointer' }}>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              {eventIcon(event)}
                              <Typography variant="body2" sx={{ color: event.kind === 'drain' ? 'error.main' : 'text.primary', whiteSpace: 'nowrap' }}>{kindLabel(event.kind)}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(event.time).format('DD MMM HH:mm')}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              color: { fill: 'success.main', drain: 'error.main', level: 'text.primary' }[event.kind],
                              textDecoration: event.status === 'false' ? 'line-through' : 'none',
                            }}
                          >
                            {format(event.amount)}
                          </TableCell>
                          <TableCell sx={{ minWidth: 180 }}>
                            <Typography variant="body2" component="div"><AddressValue latitude={event.latitude} longitude={event.longitude} /></Typography>
                            <Typography variant="caption" color="text.secondary">{`${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`}</Typography>
                          </TableCell>
                          <TableCell>{statusChip(event.status)}</TableCell>
                          <TableCell align="right" className="no-print" sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip title={t('fuelShowOnMap')}>
                              <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); setSelected(event.key); }}><PlaceIcon fontSize="small" /></IconButton>
                            </Tooltip>
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, event }); }}><MoreHorizIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!visible.length && (
                        <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">{t('fuelNoEvents')}</Typography></TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Box>
                <Stack direction="row" alignItems="center" sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {t('fuelShowing')
                      .replace('{from}', filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0)
                      .replace('{to}', Math.min(page * PAGE_SIZE, filtered.length))
                      .replace('{total}', filtered.length)}
                  </Typography>
                  <Pagination size="small" count={pages} page={page} onChange={(_, value) => setPage(value)} color="primary" className="no-print" />
                </Stack>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 3.5 }}>
              <Card variant="outlined" sx={{ ...cardSx, display: 'flex', flexDirection: 'column' }}>
                <SectionTitle icon={<PlaceIcon />} title={t('fuelEventsMap')}>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" variant="outlined" startIcon={<MapIcon />} className="no-print" onClick={() => { dispatch(devicesActions.selectId(deviceId)); navigate('/'); }}>
                    {t('fuelOpenMap')}
                  </Button>
                </SectionTitle>
                <Box sx={{ flexGrow: 1, minHeight: 320, borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                  <FuelEventsMap deviceId={deviceId} points={report.points} events={events} selected={selected} />
                </Box>
              </Card>
            </Grid>
          </Grid>

          <Card variant="outlined" sx={{ borderRadius: 3, p: 2 }} className="no-print">
            <Grid container spacing={2}>
              {[
                [<VerifiedUserIcon key="i" />, 'fuelFeatureAnomalies', 'fuelFeatureAnomaliesText', () => setKind('drain')],
                [<BarChartIcon key="i" />, 'fuelFeatureExport', 'fuelFeatureExportText', exportCsv],
                [<PlaceIcon key="i" />, 'fuelFeatureMap', 'fuelFeatureMapText', () => setSelected(events.find((event) => event.kind !== 'level')?.key ?? null)],
                [<NotificationsActiveIcon key="i" />, 'fuelFeatureAlerts', 'fuelFeatureAlertsText', () => navigate('/settings/notifications')],
              ].map(([icon, title, text, action]) => (
                <Grid key={title} size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Stack direction="row" spacing={1.5} onClick={action} sx={{ cursor: 'pointer', p: 1, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                    <IconBox color={alpha(theme.palette.primary.main, 0.12)} size={40}><Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box></IconBox>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{t(title)}</Typography>
                      <Typography variant="caption" color="text.secondary">{t(text)}</Typography>
                    </Box>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Card>
          {!deviceReadonly && (
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }} className="no-print">
              <Button size="small" startIcon={<TuneIcon />} onClick={() => navigate(`/settings/device/${deviceId}`)}>{t('fuelAdjustSensor')}</Button>
            </Stack>
          )}
        </>
      )}

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menu && menu.event.kind !== 'level' && !deviceReadonly && [
          <MenuItem key="valid" onClick={() => { saveReview(menu.event, 'valid'); setMenu(null); }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>{t('fuelMarkValid')}</ListItemText>
          </MenuItem>,
          <MenuItem key="false" onClick={() => { saveReview(menu.event, 'false'); setMenu(null); }}>
            <ListItemIcon><DoNotDisturbIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('fuelMarkFalse')}</ListItemText>
          </MenuItem>,
          <MenuItem key="clear" disabled={menu.event.status === 'pending'} onClick={() => { saveReview(menu.event, null); setMenu(null); }}>
            <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('fuelMarkPending')}</ListItemText>
          </MenuItem>,
        ]}
        {menu && (
          <MenuItem component="a" href={`https://www.google.com/maps?q=${menu.event.latitude},${menu.event.longitude}`} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>
            <ListItemIcon><MapIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('fuelGoogleMaps')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Container>
  );
};

export default FuelReportPage;
