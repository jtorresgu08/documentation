import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Alert, Box, Chip, Grid, IconButton, LinearProgress, Menu, MenuItem, Paper, Select, Slider, Stack, Tab, Tabs, Tooltip,
  Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import TuneIcon from '@mui/icons-material/Tune';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import MapView from '../map/core/MapView';
import MapRoutePath from '../map/MapRoutePath';
import MapRoutePoints from '../map/MapRoutePoints';
import MapPositions from '../map/MapPositions';
import MapMarkers from '../map/MapMarkers';
import ReportFilter from '../reports/components/ReportFilter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import MapCamera from '../map/MapCamera';
import MapGeofence from '../map/MapGeofence';
import StatusCard from '../common/components/StatusCard';
import MapScale from '../map/MapScale';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatPeriod } from '../main/DeviceRow';
import { alertTitle } from '../operations/alertUtils';

const haversine = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

const SPEEDS = [1, 2, 4, 8, 16, 32];
const ROUTINE = ['deviceOnline', 'deviceOffline', 'deviceUnknown', 'deviceMoving', 'deviceStopped', 'ignitionOn', 'ignitionOff', 'queuedCommandSent', 'media', 'commandResult'];
const json = { headers: { Accept: 'application/json' } };

const closestIndex = (positions, time) => {
  let low = 0;
  let high = positions.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dayjs(positions[middle].fixTime).valueOf() < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
};

const download = (name, content, type) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
};

// History: route coloured by speed, trips and stops with their times, events on the map, a speed chart synced with
// the playback (1x to 32x), jump to any trip, stop or event, and export to KML, GPX or CSV
const ReplayPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [searchParams] = useSearchParams();
  const timerRef = useRef();

  const defaultDeviceId = useSelector((state) => state.devices.selectedId);
  const devices = useSelector((state) => state.devices.items);

  const [positions, setPositions] = useState([]);
  const [trips, setTrips] = useState([]);
  const [stops, setStops] = useState([]);
  const [events, setEvents] = useState([]);
  const [index, setIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(defaultDeviceId);
  const [showCard, setShowCard] = useState(false);
  const [range, setRange] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('segments');
  const [focus, setFocus] = useState(null);
  const [downloadMenu, setDownloadMenu] = useState(null);
  const [chart, setChart] = useState(true);

  const device = devices[selectedDeviceId];

  useEffect(() => {
    if (playing && positions.length > 0) {
      timerRef.current = setInterval(() => {
        setIndex((value) => Math.min(value + 1, positions.length - 1));
      }, Math.max(20, 400 / speed));
    }
    return () => clearInterval(timerRef.current);
  }, [playing, positions, speed]);

  useEffect(() => {
    if (index >= positions.length - 1) {
      setPlaying(false);
    }
  }, [index, positions]);

  const onPointClick = useCallback((_, value) => setIndex(value), []);
  const onMarkerClick = useCallback((positionId) => setShowCard(!!positionId), []);

  const load = async ({ deviceIds, from, to }) => {
    const deviceId = deviceIds.find(() => true);
    setLoading(true);
    setSelectedDeviceId(deviceId);
    setRange({ from, to });
    setPlaying(false);
    setFocus(null);
    const query = new URLSearchParams({ deviceId, from, to });
    try {
      const [positionsResponse, tripsResponse, stopsResponse, eventsResponse] = await Promise.all([
        fetchOrThrow(`/api/positions?${query}`),
        fetchOrThrow(`/api/reports/trips?${query}`, json),
        fetchOrThrow(`/api/reports/stops?${query}`, json),
        fetchOrThrow(`/api/reports/events?${query}&type=allEvents`, json),
      ]);
      const items = await positionsResponse.json();
      setIndex(0);
      setPositions(items);
      setTrips(await tripsResponse.json());
      setStops(await stopsResponse.json());
      setEvents((await eventsResponse.json()).filter((event) => !ROUTINE.includes(event.type)));
      if (items.length) {
        setExpanded(false);
      } else {
        throw Error(t('sharedNoData'));
      }
    } finally {
      setLoading(false);
    }
  };
  const onShow = useCatch(load);

  // opened from another page with ?deviceId=&from=&to= (alert center, unit card)
  useEffect(() => {
    const deviceId = Number(searchParams.get('deviceId'));
    if (deviceId) {
      setSelectedDeviceId(deviceId);
      const from = searchParams.get('from');
      const to = searchParams.get('to');
      if (from && to) {
        load({ deviceIds: [deviceId], from, to }).catch(() => {});
      }
    }
  }, []);

  const segments = useMemo(() => [
    ...trips.map((trip) => ({ ...trip, kind: 'trip', time: dayjs(trip.startTime).valueOf() })),
    ...stops.map((stop) => ({ ...stop, kind: 'stop', time: dayjs(stop.startTime).valueOf() })),
  ].sort((a, b) => a.time - b.time), [trips, stops]);

  const positionsById = useMemo(() => Object.fromEntries(positions.map((position, i) => [position.id, i])), [positions]);

  const pathDistance = useCallback((from, to) => positions.reduce((sum, position, i) => {
    const previous = positions[i - 1];
    const time = dayjs(position.fixTime).valueOf();
    if (!previous || time < from || time > to) return sum;
    const meters = haversine(previous, position);
    const seconds = (time - dayjs(previous.fixTime).valueOf()) / 1000;
    return seconds > 0 && meters / seconds > 83 ? sum : sum + meters;
  }, 0), [positions]);

  const tripDistance = useCallback((trip) => (trip.distance > 0 ? trip.distance
    : pathDistance(dayjs(trip.startTime).valueOf(), dayjs(trip.endTime).valueOf())), [pathDistance]);

  const summary = useMemo(() => {
    if (!positions.length) return null;
    const odometer = trips.reduce((sum, trip) => sum + tripDistance(trip), 0);
    return {
      distance: trips.length ? odometer : pathDistance(-Infinity, Infinity),
      driving: trips.reduce((sum, trip) => sum + trip.duration, 0),
      stopped: stops.reduce((sum, stop) => sum + stop.duration, 0),
      maxSpeed: Math.max(...positions.map((position) => position.speed)),
    };
  }, [positions, trips, stops, tripDistance, pathDistance]);

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(positions.length / 600));
    return positions.filter((_, i) => i % step === 0).map((position) => ({
      time: dayjs(position.fixTime).valueOf(),
      speed: Math.round(position.speed * 1.852),
    }));
  }, [positions]);

  const markers = useMemo(() => {
    if (!positions.length) return [];
    const first = positions[0];
    const last = positions[positions.length - 1];
    return [
      { latitude: first.latitude, longitude: first.longitude, image: 'start-success', title: dayjs(first.fixTime).format('HH:mm') },
      { latitude: last.latitude, longitude: last.longitude, image: 'finish-error', title: dayjs(last.fixTime).format('HH:mm') },
      ...stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude, image: 'default-warning', title: formatPeriod(stop.duration) })),
      ...events.map((event) => {
        const position = positions[positionsById[event.positionId]];
        return position && { latitude: position.latitude, longitude: position.longitude, image: 'default-error', title: alertTitle(event, t) };
      }).filter(Boolean),
    ];
  }, [positions, stops, events, positionsById]);

  const jump = (startTime, endTime) => {
    const start = closestIndex(positions, dayjs(startTime).valueOf());
    const end = endTime ? closestIndex(positions, dayjs(endTime).valueOf()) : start;
    setPlaying(false);
    setIndex(start);
    setFocus(positions.slice(Math.max(0, start - 1), Math.max(start + 2, end + 1)));
  };

  const current = positions[index];
  const activeSegment = current && segments.find((segment) => {
    const time = dayjs(current.fixTime).valueOf();
    return time >= dayjs(segment.startTime).valueOf() && time <= dayjs(segment.endTime).valueOf();
  });

  const exportGpx = () => {
    const points = positions.map((position) => `<trkpt lat="${position.latitude}" lon="${position.longitude}"><ele>${position.altitude || 0}</ele><time>${dayjs(position.fixTime).toISOString()}</time><speed>${(position.speed * 0.514444).toFixed(2)}</speed></trkpt>`).join('');
    download(`${device?.name || 'ruta'}-${dayjs(range.from).format('YYYYMMDD')}.gpx`,
      `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Safe Connection" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${device?.name || ''}</name><trkseg>${points}</trkseg></trk></gpx>`,
      'application/gpx+xml');
  };
  const exportCsv = () => {
    const lines = [['Fecha', 'Latitud', 'Longitud', 'Velocidad km/h', 'Rumbo', 'Encendido', 'Dirección'],
      ...positions.map((position) => [dayjs(position.fixTime).format('YYYY-MM-DD HH:mm:ss'), position.latitude, position.longitude,
        Math.round(position.speed * 1.852), Math.round(position.course), position.attributes.ignition ?? '', position.address || ''])];
    download(`${device?.name || 'ruta'}-${dayjs(range.from).format('YYYYMMDD')}.csv`,
      `\uFEFF${lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`, 'text/csv;charset=utf-8');
  };
  const exportKml = () => {
    const query = new URLSearchParams({ deviceId: selectedDeviceId, ...range });
    window.location.assign(`/api/positions/kml?${query.toString()}`);
  };

  const panelWidth = 400;
  const glass = {
    bgcolor: alpha(theme.palette.background.paper, 0.9),
    backdropFilter: 'blur(12px)',
    borderRadius: desktop ? '16px' : 0,
    border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
  };

  return (
    <Box sx={{ height: '100%' }}>
      <MapView>
        <MapGeofence />
        <MapRoutePath positions={positions} />
        <MapRoutePoints positions={positions} onClick={onPointClick} showSpeedControl />
        <MapMarkers markers={markers} showTitles={false} />
        {current && <MapPositions positions={[current]} onMarkerClick={onMarkerClick} titleField="fixTime" />}
      </MapView>
      <MapScale />
      <MapCamera positions={focus || positions} />

      <Paper
        elevation={0}
        sx={{
          position: 'fixed', zIndex: 3, top: 0, left: 0, m: desktop ? 1.5 : 0, width: desktop ? panelWidth : '100%',
          maxHeight: desktop ? 'calc(100vh - 24px)' : '55vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...glass,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
          <IconButton edge="start" onClick={() => navigate(-1)} aria-label={t('sharedBack')}><BackIcon /></IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>{t('reportReplay')}</Typography>
            {!expanded && range && (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {`${device?.name || ''} · ${dayjs(range.from).format('DD/MM HH:mm')} – ${dayjs(range.to).format('DD/MM HH:mm')}`}
              </Typography>
            )}
          </Box>
          {!expanded && (
            <>
              <Tooltip title={t('replayDownload')}><IconButton onClick={(event) => setDownloadMenu(event.currentTarget)} aria-label={t('replayDownload')}><DownloadIcon /></IconButton></Tooltip>
              <Tooltip title={t('replayFilter')}><IconButton edge="end" onClick={() => setExpanded(true)} aria-label={t('replayFilter')}><TuneIcon /></IconButton></Tooltip>
            </>
          )}
        </Stack>
        <Menu anchorEl={downloadMenu} open={Boolean(downloadMenu)} onClose={() => setDownloadMenu(null)}>
          <MenuItem onClick={() => { setDownloadMenu(null); exportKml(); }}>KML (Google Earth)</MenuItem>
          <MenuItem onClick={() => { setDownloadMenu(null); exportGpx(); }}>GPX</MenuItem>
          <MenuItem onClick={() => { setDownloadMenu(null); exportCsv(); }}>CSV / Excel</MenuItem>
        </Menu>
        {loading && <LinearProgress />}

        {expanded ? (
          <Box sx={{ p: 2 }}>
            <ReportFilter onShow={onShow} deviceType="single" loading={loading} />
          </Box>
        ) : summary && (
          <>
            <Grid container spacing={1} sx={{ px: 1.5 }}>
              {[
                [t('sharedDistance'), `${(summary.distance / 1000).toFixed(1)} km`],
                [t('replayDriving'), formatPeriod(summary.driving)],
                [t('replayStopped'), formatPeriod(summary.stopped)],
                [t('replayMaxSpeed'), `${Math.round(summary.maxSpeed * 1.852)} km/h`],
              ].map(([label, value]) => (
                <Grid key={label} size={3}>
                  <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'action.hover', textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
                    <Typography variant="body2" fontWeight={700} noWrap>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth" sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38 } }}>
              <Tab value="segments" label={`${t('replaySegments')} (${segments.length})`} />
              <Tab value="events" label={`${t('reportEvents')} (${events.length})`} />
            </Tabs>
            <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {tab === 'segments' && segments.map((segment) => {
                const active = activeSegment === segment;
                const trip = segment.kind === 'trip';
                return (
                  <Stack
                    key={`${segment.kind}-${segment.time}`}
                    direction="row"
                    spacing={1.25}
                    onClick={() => jump(segment.startTime, segment.endTime)}
                    sx={{
                      px: 1.5, py: 1, cursor: 'pointer', borderTop: `1px solid ${theme.palette.divider}`,
                      bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'transparent', '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                    }}
                  >
                    <Box sx={{
 width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(trip ? theme.palette.success.main : theme.palette.warning.main, 0.14), color: trip ? 'success.main' : 'warning.main' 
}}>
                      {trip ? <DirectionsCarIcon fontSize="small" /> : <LocalParkingIcon fontSize="small" />}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600}>{`${trip ? t('replayTrip') : t('replayStop')} · ${dayjs(segment.startTime).format('HH:mm')}–${dayjs(segment.endTime).format('HH:mm')}`}</Typography>
                        <Typography variant="body2" fontWeight={700}>{formatPeriod(segment.duration)}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {trip
                          ? `${(tripDistance(segment) / 1000).toFixed(1)} km · ${t('reportMaximumSpeed')} ${Math.round(segment.maxSpeed * 1.852)} km/h${segment.driverName ? ` · ${segment.driverName}` : ''}`
                          : segment.address || `${segment.latitude.toFixed(5)}, ${segment.longitude.toFixed(5)}`}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
              {tab === 'segments' && !segments.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('replayNoSegments')}</Typography>}
              {tab === 'events' && events.map((event) => (
                <Stack
                  key={event.id}
                  direction="row"
                  spacing={1.25}
                  alignItems="center"
                  onClick={() => jump(event.eventTime)}
                  sx={{ px: 1.5, py: 1, cursor: 'pointer', borderTop: `1px solid ${theme.palette.divider}`, '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) } }}
                >
                  <WarningAmberIcon fontSize="small" color={event.type === 'alarm' ? 'error' : 'warning'} />
                  <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>{alertTitle(event, t)}</Typography>
                  <Typography variant="caption" color="text.secondary">{dayjs(event.eventTime).format('HH:mm:ss')}</Typography>
                </Stack>
              ))}
              {tab === 'events' && !events.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('replayNoEvents')}</Typography>}
            </Box>
          </>
        )}
      </Paper>

      {!expanded && current && (
        <Paper
          elevation={0}
          sx={{
            position: 'fixed', zIndex: 3, bottom: desktop ? 16 : 0, right: desktop ? 16 : 0, left: desktop ? panelWidth + 36 : 0, px: 2, py: 1, ...glass,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={playing || index <= 0} aria-label={t('replayPrevious')}><SkipPreviousIcon /></IconButton>
            <IconButton color="primary" onClick={() => setPlaying(!playing)} disabled={index >= positions.length - 1} aria-label={t('replayPlay')} sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
              {playing ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
            <IconButton onClick={() => setIndex((value) => Math.min(positions.length - 1, value + 1))} disabled={playing || index >= positions.length - 1} aria-label={t('replayNext')}><SkipNextIcon /></IconButton>
            <Select size="small" value={speed} onChange={(event) => setSpeed(event.target.value)} sx={{ height: 32, fontSize: 13, fontWeight: 700 }}>
              {SPEEDS.map((value) => <MenuItem key={value} value={value}>{`${value}x`}</MenuItem>)}
            </Select>
            <Box sx={{ minWidth: 0, flexShrink: 0, px: 1 }}>
              <Typography variant="body2" fontWeight={700}>{dayjs(current.fixTime).format('DD/MM HH:mm:ss')}</Typography>
              <Typography variant="caption" color="text.secondary">{`${Math.round(current.speed * 1.852)} km/h · ${index + 1}/${positions.length}`}</Typography>
            </Box>
            {activeSegment && (
              <Chip size="small" color={activeSegment.kind === 'trip' ? 'success' : 'warning'} label={activeSegment.kind === 'trip' ? t('replayTrip') : t('replayStop')} sx={{ display: { xs: 'none', sm: 'flex' } }} />
            )}
            <Slider size="small" min={0} max={positions.length - 1} value={index} onChange={(_, value) => setIndex(value)} sx={{ mx: 2, flexGrow: 1 }} aria-label={t('replayPosition')} />
            <Tooltip title={t('replaySpeedChart')}><IconButton size="small" onClick={() => setChart(!chart)} color={chart ? 'primary' : 'default'} aria-label={t('replaySpeedChart')}><ShowChartIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
          {chart && (
            <Box sx={{ height: desktop ? 90 : 70, mt: 0.5, cursor: 'pointer' }}>
              <ResponsiveContainer>
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  onClick={(state) => state?.activeLabel && setIndex(closestIndex(positions, state.activeLabel))}
                >
                  <defs>
                    <linearGradient id="replaySpeed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value) => dayjs(value).format('HH:mm')} fontSize={10} stroke={theme.palette.text.secondary} />
                  <YAxis width={34} fontSize={10} stroke={theme.palette.text.secondary} unit="" />
                  <ChartTooltip labelFormatter={(value) => dayjs(value).format('HH:mm:ss')} formatter={(value) => [`${value} km/h`, t('positionSpeed')]} />
                  {device?.attributes?.speedLimit > 0 && <ReferenceLine y={Math.round(device.attributes.speedLimit * 1.852)} stroke={theme.palette.error.main} strokeDasharray="4 4" />}
                  <Area type="monotone" dataKey="speed" stroke={theme.palette.primary.main} strokeWidth={1.5} fill="url(#replaySpeed)" isAnimationActive={false} />
                  <ReferenceLine x={dayjs(current.fixTime).valueOf()} stroke={theme.palette.warning.main} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      )}

      {!expanded && !positions.length && !loading && <Alert severity="info" sx={{ position: 'fixed', bottom: 16, right: 16 }}>{t('sharedNoData')}</Alert>}

      {showCard && current && (
        <StatusCard deviceId={selectedDeviceId} position={current} onClose={() => setShowCard(false)} disableActions />
      )}
    </Box>
  );
};

export default ReplayPage;
