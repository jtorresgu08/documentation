import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Collapse, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EditIcon from '@mui/icons-material/Edit';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import {
  INFO_PREFIX, UNIT_INFO_FIELDS, formatSensorValue, fuelSensors, infoLabelKey, parseSensors, sensorValue,
} from '../common/util/sensors';
import { closeUnitInfo, useUnitInfo } from '../common/util/unitInfo';
import { speedFromKnots, speedUnitString } from '../common/util/converter';
import { formatBoolean } from '../common/util/formatter';
import { useAttributePreference } from '../common/util/preferences';

const Section = ({ title, rows, open, onToggle }) => (rows.length > 0 && (
  <Box sx={{ mt: 1 }}>
    <Stack direction="row" alignItems="center" onClick={onToggle} sx={{ cursor: 'pointer', userSelect: 'none' }}>
      <Typography variant="overline" color="primary" fontWeight={700} sx={{ flexGrow: 1, lineHeight: 2.2 }}>{title}</Typography>
      {open ? <ExpandLessIcon fontSize="small" color="action" /> : <ExpandMoreIcon fontSize="small" color="action" />}
    </Stack>
    <Collapse in={open}>
      {rows.map(([label, value]) => (
        <Stack key={label} direction="row" spacing={1} sx={{ py: 0.4, borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.5)}` }}>
          <Typography variant="body2" color="text.secondary" sx={{ width: '45%', flexShrink: 0 }}>{label}</Typography>
          <Typography variant="body2" fontWeight={500} sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{value}</Typography>
        </Stack>
      ))}
    </Collapse>
  </Box>
));

// Unit information, Wialon style, in a translucent window floating over the map: live sensors, device, SIM,
// vehicle and installation data. It can be dragged, minimized and copied, and leaves the map usable around it.
const UnitInfoPanel = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const speedUnit = useAttributePreference('speedUnit', 'kmh');

  const deviceId = useUnitInfo();
  const device = useSelector((state) => state.devices.items[deviceId]);
  const position = useSelector((state) => state.session.positions[deviceId]);
  const group = useSelector((state) => state.groups.items[device?.groupId]);

  const [minimized, setMinimized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [closed, setClosed] = useState({});
  const drag = useRef(null);

  useEffect(() => {
    setMinimized(false);
  }, [deviceId]);

  if (!device) {
    return null;
  }

  const attributes = device.attributes || {};
  const info = (key) => attributes[INFO_PREFIX + key];
  const present = (rows) => rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const infoRows = (section) => present(UNIT_INFO_FIELDS
    .filter((field) => field.section === section)
    .map((field) => [t(infoLabelKey(field.key)), info(field.key)]));

  const sensors = parseSensors(device);
  const sections = [
    ['device', t('unitInfoDevice'), present([
      [t('deviceIdentifier'), device.uniqueId],
      [t('deviceModel'), device.model],
      [t('addDeviceProtocol'), position?.protocol],
      [t('groupParent'), group?.name],
      [t('deviceContact'), device.contact],
      [t('deviceLastUpdate'), device.lastUpdate && dayjs(device.lastUpdate).format('YYYY-MM-DD HH:mm:ss')],
      [t('userExpirationTime'), device.expirationTime && dayjs(device.expirationTime).format('YYYY-MM-DD')],
    ])],
    ['sim', t('unitInfoSim'), present([
      [t('unitInfoSimNumber'), device.phone],
      [t('unitInfoIccid'), info('iccid') || position?.attributes?.iccid],
      [t('unitInfoSimOperator'), info('simOperator')],
    ])],
    ['vehicle', t('unitInfoVehicle'), infoRows('vehicle')],
    ['installation', t('unitInfoInstallation'), infoRows('installation')],
  ];

  const copy = () => navigator.clipboard?.writeText([
    device.name,
    ...(sensors.length ? [`\n${t('sensorsTitle')}\n${sensors.map((sensor) => `${sensor.name}: ${formatSensorValue(sensor, sensorValue(sensor, position), t)}`).join('\n')}`] : []),
    ...sections.filter(([, , rows]) => rows.length).map(([, title, rows]) => (
      `\n${title}\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`)),
  ].join('\n'));

  const startDrag = (event) => {
    if (!desktop || event.target.closest('button')) {
      return;
    }
    drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (drag.current) {
      setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
    }
  };

  const online = device.status === 'online';
  const live = position ? [
    [t('positionSpeed'), `${Math.round(speedFromKnots(position.speed, speedUnit))} ${speedUnitString(speedUnit, t)}`],
    ...(position.attributes.hasOwnProperty('ignition') ? [[t('positionIgnition'), formatBoolean(position.attributes.ignition, t),
      position.attributes.ignition ? theme.palette.success.main : theme.palette.text.secondary]] : []),
    [t('positionFixTime'), dayjs(position.fixTime).format('DD MMM HH:mm')],
  ] : [];
  const plate = info('plate');

  return (
    <Box
      sx={{
        position: 'fixed',
        zIndex: theme.zIndex.appBar,
        ...(desktop
          ? { top: 16, right: 72, width: 400, maxHeight: 'calc(100vh - 32px)', transform: `translate(${offset.x}px, ${offset.y}px)` }
          : { left: 8, right: 8, top: 64, maxHeight: '62vh' }),
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, 0.52),
        backdropFilter: 'blur(10px) saturate(170%)',
        WebkitBackdropFilter: 'blur(10px) saturate(170%)',
        border: `1px solid ${alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.12 : 0.6)}`,
        boxShadow: `0 12px 40px ${alpha(theme.palette.common.black, 0.22)}`,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => { drag.current = null; }}
        sx={{
          px: 1.5, py: 1, cursor: desktop ? 'move' : 'default', bgcolor: alpha(theme.palette.primary.main, 0.85), color: 'primary.contrastText', touchAction: 'none',
        }}
      >
        {desktop && <DragIndicatorIcon fontSize="small" sx={{ opacity: 0.7 }} />}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography fontWeight={700} noWrap>{device.name}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: online ? theme.palette.success.light : theme.palette.grey[400] }} />
            <Typography variant="caption" sx={{ opacity: 0.9 }} noWrap>
              {[t(online ? 'deviceStatusOnline' : 'deviceStatusOffline'), plate, device.model].filter(Boolean).join(' · ')}
            </Typography>
          </Stack>
        </Box>
        <Tooltip title={t('addDeviceCopy')}>
          <IconButton size="small" color="inherit" onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton>
        </Tooltip>
        <IconButton size="small" color="inherit" onClick={() => setMinimized(!minimized)}>
          {minimized ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
        <IconButton size="small" color="inherit" onClick={closeUnitInfo}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Collapse in={!minimized} sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pb: 1.5, overflowY: 'auto', maxHeight: desktop ? 'calc(100vh - 160px)' : 'calc(62vh - 110px)' }}>
          {(sensors.length > 0 || position) && (
            <Box sx={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mt: 1.5,
            }}
            >
              {live.map(([label, value, color]) => (
                <Box key={label} sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.background.paper, 0.45), border: `1px solid ${alpha(theme.palette.divider, 0.6)}` }}>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
                  <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ color }}>{value}</Typography>
                </Box>
              ))}
              {sensors.map((sensor) => (
                <Box key={sensor.id} sx={{ p: 1, borderRadius: 2, bgcolor: alpha(theme.palette.background.paper, 0.45), border: `1px solid ${alpha(theme.palette.divider, 0.6)}` }}>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">{sensor.name}</Typography>
                  <Typography variant="subtitle1" fontWeight={700} noWrap color={sensor.type === 'fuel' ? 'primary' : 'text.primary'}>
                    {formatSensorValue(sensor, sensorValue(sensor, position), t)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          {sections.map(([key, title, rows]) => (
            <Section key={key} title={title} rows={rows} open={!closed[key]} onToggle={() => setClosed({ ...closed, [key]: !closed[key] })} />
          ))}
          {!sensors.length && !sections[2][2].length && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{t('unitInfoEmpty')}</Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ px: 1.5, py: 1, borderTop: `1px solid ${alpha(theme.palette.divider, 0.6)}` }}>
          {fuelSensors(device).length > 0 && (
            <Button size="small" startIcon={<LocalGasStationIcon />} onClick={() => navigate(`/reports/fuel?deviceId=${device.id}`)}>
              {t('fuelTitle')}
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" startIcon={<EditIcon />} onClick={() => navigate(`/settings/device/${device.id}`)}>{t('sharedEdit')}</Button>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default UnitInfoPanel;
