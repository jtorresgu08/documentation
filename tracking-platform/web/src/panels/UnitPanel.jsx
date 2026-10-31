import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Grid, IconButton, LinearProgress, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import VideocamIcon from '@mui/icons-material/Videocam';
import ReplayIcon from '@mui/icons-material/Replay';
import ShareIcon from '@mui/icons-material/Share';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ChatIcon from '@mui/icons-material/Chat';
import {
  Area, AreaChart, ResponsiveContainer, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
 Row, Section, formatAgo, speedKmh 
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { openPanel } from '../common/util/floatingPanels';
import { openVideoWindow } from '../common/util/videoWindows';
import { getCameraConfig } from '../common/util/dashcam';
import { convertRaw, fuelSensors } from '../common/util/sensors';
import { devicesActions } from '../store';
import EngineCutDialog from '../common/components/EngineCutDialog';
import { statusOf } from '../main/DeviceRow';
import { alertTitle } from '../operations/alertUtils';

// Follow-up card of one unit that stays on screen: live status, speed, ignition, driver, fuel, power and odometer,
// the speed of the last hour, its latest events and shortcuts to locate, video, replay, fuel, chat, engine and share.
// Several can be open to compare units.
const UnitPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { deviceId } = panel.props;
  const device = useSelector((state) => state.devices.items[deviceId]);
  const position = useSelector((state) => state.session.positions[deviceId]);
  const drivers = useSelector((state) => state.drivers.items);
  const readonly = useSelector((state) => state.session.user.readonly || state.session.user.limitCommands);
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState(null);
  const [engineMode, setEngineMode] = useState(null);

  useEffect(() => {
    const from = dayjs().subtract(1, 'hour').toISOString();
    const to = dayjs().toISOString();
    fetchOrThrow(`/api/positions?deviceId=${deviceId}&from=${from}&to=${to}`).then((response) => response.json())
      .then((items) => setHistory(items.map((item) => ({ time: dayjs(item.fixTime).valueOf(), speed: speedKmh(item) }))))
      .catch(() => {});
    fetchOrThrow(`/api/reports/events?deviceId=${deviceId}&from=${dayjs().subtract(24, 'hour').toISOString()}&to=${to}`, {
      headers: { Accept: 'application/json' },
    }).then((response) => response.json())
      .then((items) => setEvents(items.filter((item) => !['deviceOnline', 'deviceUnknown', 'deviceOffline'].includes(item.type)).slice(-6).reverse()))
      .catch(() => setEvents([]));
  }, [deviceId]);

  useEffect(() => {
    if (position) {
      const time = dayjs(position.fixTime).valueOf();
      setHistory((current) => (current.length && current[current.length - 1].time >= time
        ? current : [...current.filter((item) => item.time > time - 3600000), { time, speed: speedKmh(position) }]));
    }
  }, [position]);

  const fuel = useMemo(() => {
    const sensor = fuelSensors(device)[0];
    if (!sensor || !position) return null;
    const value = convertRaw(sensor, position.attributes[sensor.source]);
    if (value == null) return null;
    return { value, percent: sensor.tankCapacity ? Math.min(100, (value / sensor.tankCapacity) * 100) : null, unit: sensor.unit || 'L' };
  }, [device, position]);

  if (!device) return null;

  const status = statusOf(device, position);
  const attributes = position?.attributes || {};
  const driver = attributes.driverUniqueId ? Object.values(drivers).find((item) => item.uniqueId === attributes.driverUniqueId) : null;
  const camera = Boolean(getCameraConfig(device, position).kind);
  const power = attributes.power ?? attributes.battery;
  const locate = () => {
    dispatch(devicesActions.selectId(deviceId));
    navigate('/');
  };

  const tiles = [
    [t('positionSpeed'), `${speedKmh(position)} km/h`],
    [t('positionIgnition'), attributes.ignition == null ? '—' : (attributes.ignition ? 'ON' : 'OFF')],
    [t('positionOdometer'), attributes.totalDistance != null ? `${Math.round(attributes.totalDistance / 1000).toLocaleString('es-PE')} km` : '—'],
    [t('positionPower'), power != null ? `${Number(power).toFixed(1)} V` : '—'],
  ];

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<DirectionsCarIcon fontSize="small" />}
      color={theme.palette[status.color]?.main || theme.palette.text.secondary}
      title={device.name}
      subtitle={`${t(status.key)} · ${formatAgo(position?.fixTime || device.lastUpdate)}`}
      width={340}
      footer={(
        <Stack direction="row" spacing={0.25}>
          <Tooltip title={t('panelLocate')}><IconButton size="small" onClick={locate}><MyLocationIcon fontSize="small" /></IconButton></Tooltip>
          {camera && <Tooltip title={t('videoOpen')}><IconButton size="small" onClick={() => openVideoWindow(deviceId)}><VideocamIcon fontSize="small" /></IconButton></Tooltip>}
          <Tooltip title={t('panelReplay')}><IconButton size="small" onClick={() => openPanel('replay', { deviceId })}><ReplayIcon fontSize="small" /></IconButton></Tooltip>
          {fuel && <Tooltip title={t('panelFuel')}><IconButton size="small" onClick={() => openPanel('fuel', { deviceId })}><LocalGasStationIcon fontSize="small" /></IconButton></Tooltip>}
          <Tooltip title={t('panelChat')}><IconButton size="small" onClick={() => openPanel('chat', { deviceId })}><ChatIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title={t('deviceShare')}><IconButton size="small" onClick={() => navigate(`/settings/device/${deviceId}/share`)}><ShareIcon fontSize="small" /></IconButton></Tooltip>
          {!readonly && <Tooltip title={t('videoEngine')}><IconButton size="small" color="error" onClick={() => setEngineMode('stop')}><PowerSettingsNewIcon fontSize="small" /></IconButton></Tooltip>}
        </Stack>
      )}
    >
      <Grid container spacing={0.75}>
        {tiles.map(([label, value]) => (
          <Grid size={6} key={label}>
            <Box sx={{ p: 0.75, px: 1, borderRadius: '10px', bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>{label}</Typography>
              <Typography variant="body2" fontWeight={700} noWrap>{value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }} noWrap>
        {`${t('sharedDriver')}: ${driver?.name || attributes.driverUniqueId || '—'}`}
      </Typography>
      {fuel && (
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">{t('panelFuel')}</Typography>
            <Typography variant="caption" fontWeight={700}>{`${fuel.value.toFixed(1)} ${fuel.unit}${fuel.percent != null ? ` · ${Math.round(fuel.percent)} %` : ''}`}</Typography>
          </Stack>
          {fuel.percent != null && <LinearProgress variant="determinate" value={fuel.percent} sx={{ height: 6, borderRadius: 3 }} color={fuel.percent < 20 ? 'error' : 'success'} />}
        </Box>
      )}
      <Section title={t('panelSpeedLastHour')}>
        <Box sx={{ height: 64 }}>
          {history.length > 1 ? (
            <ResponsiveContainer>
              <AreaChart data={history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <YAxis hide domain={[0, 'dataMax + 10']} />
                <Area type="monotone" dataKey="speed" stroke={theme.palette.primary.main} fill={alpha(theme.palette.primary.main, 0.15)} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Typography variant="caption" color="text.secondary">{t('panelNoData')}</Typography>}
        </Box>
      </Section>
      <Section title={t('panelLatestEvents')}>
        {events && !events.length && <Typography variant="caption" color="text.secondary">{t('panelNoData')}</Typography>}
        {(events || []).map((event) => (
          <Row key={event.id} primary={alertTitle(event, t)} right={<Typography variant="caption" color="text.secondary">{dayjs(event.eventTime).format('HH:mm')}</Typography>} />
        ))}
      </Section>
      {!readonly && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" fullWidth variant="outlined" color="success" startIcon={<PowerSettingsNewIcon />} onClick={() => setEngineMode('resume')}>ON</Button>
          <Button size="small" fullWidth variant="outlined" color="error" startIcon={<PowerSettingsNewIcon />} onClick={() => setEngineMode('stop')}>OFF</Button>
        </Stack>
      )}
      <EngineCutDialog deviceId={engineMode ? deviceId : null} mode={engineMode} onClose={() => setEngineMode(null)} />
    </FloatingPanel>
  );
};

export default UnitPanel;
