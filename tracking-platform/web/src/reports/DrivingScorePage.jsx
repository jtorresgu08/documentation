import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Container, Drawer, Grid, IconButton, LinearProgress,
  Link, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import InsightsIcon from '@mui/icons-material/Insights';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RouteIcon from '@mui/icons-material/Route';
import SpeedIcon from '@mui/icons-material/Speed';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatPeriod } from '../main/DeviceRow';

const TYPES = ['braking', 'acceleration', 'cornering', 'speeding', 'adas', 'dms'];
const PERIODS = {
  today: () => [dayjs().startOf('day'), dayjs()],
  yesterday: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().startOf('day')],
  last7d: () => [dayjs().subtract(7, 'day'), dayjs()],
  thisMonth: () => [dayjs().startOf('month'), dayjs()],
  last30d: () => [dayjs().subtract(30, 'day'), dayjs()],
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Driving score: ranking per unit and per driver with harsh events, speeding and camera alarms per 100 km
const DrivingScorePage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);
  const groups = useSelector((state) => state.groups.items);

  const [period, setPeriod] = useState('last7d');
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('devices');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const ratingColor = (rating) => ({
    excellent: theme.palette.success.main, good: theme.palette.info.main, regular: theme.palette.warning.main, risky: theme.palette.error.main,
  }[rating]);

  const query = (extra = {}) => {
    const [from, to] = PERIODS[period]();
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...extra });
    if (!extra.deviceId) {
      selectedDevices.forEach((device) => params.append('deviceId', device.id));
      if (groupId) {
        params.append('groupId', groupId);
      }
      if (!selectedDevices.length && !groupId) {
        Object.keys(devices).forEach((id) => params.append('deviceId', id));
      }
    }
    return params;
  };

  const generate = useCatch(async () => {
    setLoading(true);
    try {
      setData(await (await fetchOrThrow(`/api/driving/score?${query()}`)).json());
    } finally {
      setLoading(false);
    }
  });

  const openDetail = useCatch(async (item) => {
    setDetail({ ...item, loading: true });
    const result = await (await fetchOrThrow(`/api/driving/score?${query({ deviceId: item.deviceId, details: true })}`)).json();
    setDetail({ ...item, ...result.devices[0], loading: false });
  });

  const rows = data ? data[tab] : [];
  const fleet = useMemo(() => {
    if (!data?.devices.length) {
      return null;
    }
    const active = data.devices.filter((item) => item.distance > 0);
    const distance = active.reduce((sum, item) => sum + item.distance, 0);
    const incidents = active.reduce((sum, item) => sum + Object.values(item.counts).reduce((a, b) => a + b, 0), 0);
    const average = active.length
      ? active.reduce((sum, item) => sum + item.score * item.distance, 0) / Math.max(distance, 1) : 100;
    return {
      average, distance, incidents, rate: distance ? (incidents / distance) * 100 : 0, best: active[0], worst: active[active.length - 1],
    };
  }, [data]);

  const ScoreBadge = ({ score, rating, size = 46 }) => (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" value={100} size={size} thickness={4} sx={{ color: alpha(ratingColor(rating), 0.15), position: 'absolute' }} />
      <CircularProgress variant="determinate" value={score} size={size} thickness={4} sx={{ color: ratingColor(rating) }} />
      <Box sx={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      >
        <Typography variant={size > 50 ? 'h6' : 'caption'} fontWeight={700}>{Math.round(score)}</Typography>
      </Box>
    </Box>
  );

  const Kpi = ({ icon, label, value, caption, color }) => (
    <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{
          width: 44, height: 44, borderRadius: 2, bgcolor: alpha(color, 0.12), color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h6" fontWeight={700} noWrap>{value}</Typography>
          {caption && <Typography variant="caption" color="text.secondary" noWrap component="div">{caption}</Typography>}
        </Box>
      </Stack>
    </Card>
  );

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }} sx={{ mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('drivingTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('drivingSubtitle')}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 160 }}>
            {Object.keys(PERIODS).map((value) => <MenuItem key={value} value={value}>{t(`fuelPeriod${capitalize(value)}`)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('settingsGroups')} value={groupId} onChange={(event) => setGroupId(event.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">{t('drivingAllGroups')}</MenuItem>
            {Object.values(groups).map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            limitTags={2}
            sx={{ minWidth: 260 }}
            options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
            getOptionLabel={(option) => option.name}
            value={selectedDevices}
            onChange={(_, value) => setSelectedDevices(value)}
            renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={selectedDevices.length ? '' : t('drivingAllUnits')} />}
          />
          <Button variant="contained" startIcon={<InsightsIcon />} onClick={generate} disabled={loading}>{t('fuelGenerate')}</Button>
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {!data && !loading && <Alert severity="info">{t('drivingHint')}</Alert>}

      {data && fleet && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <ScoreBadge score={fleet.average} rating={fleet.average >= 90 ? 'excellent' : fleet.average >= 75 ? 'good' : fleet.average >= 60 ? 'regular' : 'risky'} size={64} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">{t('drivingFleetScore')}</Typography>
                    <Typography variant="caption" color="text.secondary">{t('drivingWeighted')}</Typography>
                  </Box>
                </Stack>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Kpi icon={<RouteIcon />} color={theme.palette.primary.main} label={t('fuelDistance')} value={`${fleet.distance.toFixed(0)} km`} caption={`${data.devices.length} ${t('quickVehicles')}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Kpi icon={<WarningAmberIcon />} color={theme.palette.warning.main} label={t('drivingIncidents')} value={fleet.incidents} caption={`${fleet.rate.toFixed(1)} ${t('drivingPer100')}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Kpi
                icon={<EmojiEventsIcon />}
                color={theme.palette.success.main}
                label={t('drivingBest')}
                value={fleet.best?.name || '—'}
                caption={fleet.worst && fleet.worst !== fleet.best ? `${t('drivingWorst')}: ${fleet.worst.name}` : ''}
              />
            </Grid>
          </Grid>

          <Card variant="outlined" sx={{ borderRadius: 3, p: 2, mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('drivingRanking')}</Typography>
            <Box sx={{ height: Math.max(160, Math.min(rows.length, 15) * 28 + 40) }}>
              <ResponsiveContainer>
                <BarChart data={rows.slice(0, 15)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke={theme.palette.divider} />
                  <XAxis type="number" domain={[0, 100]} stroke={theme.palette.text.secondary} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={140} stroke={theme.palette.text.secondary} fontSize={12} />
                  <ChartTooltip formatter={(value) => [Math.round(value), t('drivingScore')]} />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    {rows.slice(0, 15).map((item) => <Cell key={item.deviceId || item.driverUniqueId} fill={ratingColor(item.rating)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Tab value="devices" label={`${t('deviceTitle')} (${data.devices.length})`} />
              <Tab value="drivers" label={`${t('sharedDrivers')} (${data.drivers.length})`} />
            </Tabs>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600 } }}>
                    <TableCell>#</TableCell>
                    <TableCell>{t('sharedName')}</TableCell>
                    <TableCell>{t('drivingScore')}</TableCell>
                    <TableCell align="right">{t('fuelDistance')}</TableCell>
                    <TableCell align="right">{t('drivingTime')}</TableCell>
                    {TYPES.map((type) => <TableCell key={type} align="right">{t(`driving${capitalize(type)}`)}</TableCell>)}
                    <TableCell align="right">{t('drivingMaxSpeed')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((item, index) => (
                    <TableRow
                      key={item.deviceId || item.driverUniqueId}
                      hover
                      onClick={() => tab === 'devices' && openDetail(item)}
                      sx={{ cursor: tab === 'devices' ? 'pointer' : 'default' }}
                    >
                      <TableCell>{index + 1}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <ScoreBadge score={item.score} rating={item.rating} size={38} />
                          <Chip size="small" label={t(`drivingRating${capitalize(item.rating)}`)} sx={{ bgcolor: alpha(ratingColor(item.rating), 0.12), color: ratingColor(item.rating), fontWeight: 600 }} />
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{`${item.distance.toFixed(1)} km`}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatPeriod(item.drivingTime)}</TableCell>
                      {TYPES.map((type) => (
                        <TableCell key={type} align="right" sx={{ color: item.counts[type] ? 'text.primary' : 'text.disabled', fontWeight: item.counts[type] ? 700 : 400 }}>
                          {item.counts[type]}
                        </TableCell>
                      ))}
                      <TableCell align="right">{`${item.maxSpeed} km/h`}</TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow><TableCell colSpan={12}><Typography variant="body2" color="text.secondary">{t(tab === 'drivers' ? 'drivingNoDrivers' : 'sharedNoData')}</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Card>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{t('drivingMethod')}</Typography>
        </>
      )}

      <Drawer anchor="right" open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail && (
          <Box sx={{ width: { xs: '100vw', sm: 440 }, p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
              <ScoreBadge score={detail.score} rating={detail.rating} size={56} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" fontWeight={700}>{detail.name}</Typography>
                <Typography variant="body2" color="text.secondary">{`${detail.distance.toFixed(1)} km · ${formatPeriod(detail.drivingTime)}`}</Typography>
              </Box>
              <IconButton onClick={() => setDetail(null)}><CloseIcon /></IconButton>
            </Stack>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {TYPES.map((type) => (
                <Grid key={type} size={4}>
                  <Card variant="outlined" sx={{ borderRadius: 2, p: 1, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>{detail.counts[type]}</Typography>
                    <Typography variant="caption" color="text.secondary">{t(`driving${capitalize(type)}`)}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>
            {detail.speedingTime > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <SpeedIcon fontSize="small" color="error" />
                <Typography variant="body2">{`${t('drivingSpeedingTime')}: ${formatPeriod(detail.speedingTime)}`}</Typography>
              </Stack>
            )}
            {detail.loading ? <LinearProgress /> : (
              <Table size="small">
                <TableBody>
                  {(detail.incidents || []).map((incident) => (
                    <TableRow key={`${incident.time}-${incident.type}`}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(incident.time).format('DD MMM HH:mm:ss')}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{t(`driving${capitalize(incident.type)}`)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {incident.detail === 'gps' ? t('drivingFromGps') : (t(`alarm${capitalize(incident.detail)}`) || incident.detail)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{`${incident.speed} km/h`}</TableCell>
                      <TableCell>
                        <Tooltip title={t('linkGoogleMaps')}>
                          <Link href={`https://www.google.com/maps?q=${incident.latitude},${incident.longitude}`} target="_blank" rel="noreferrer">📍</Link>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!detail.incidents?.length && (
                    <TableRow><TableCell><Typography variant="body2" color="text.secondary">{t('drivingNoIncidents')}</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </Drawer>
    </Container>
  );
};

export default DrivingScorePage;
