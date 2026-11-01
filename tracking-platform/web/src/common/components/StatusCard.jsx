import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import {
  Button,
  Chip,
  Divider,
  Stack,
  Card,
  CardContent,
  Typography,
  CardActions,
  IconButton,
  Menu,
  MenuItem,
  CardMedia,
  Tooltip,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { alpha, useTheme } from '@mui/material/styles';
import SpeedIcon from '@mui/icons-material/Speed';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HistoryIcon from '@mui/icons-material/History';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import SensorDoorIcon from '@mui/icons-material/SensorDoor';
import InsightsIcon from '@mui/icons-material/Insights';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import RouteIcon from '@mui/icons-material/Route';
import dayjs from 'dayjs';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import VideocamIcon from '@mui/icons-material/Videocam';

import { useTranslation } from './LocalizationProvider';
import RemoveDialog from './RemoveDialog';
import EngineCutDialog from './EngineCutDialog';
import { convertVolume, deviceFuelUnit } from '../util/fuelUnits';
import AddressValue from './AddressValue';
import { useDeviceReadonly, useRestriction } from '../util/permissions';
import { devicesActions } from '../../store';
import { useCatch, useCatchCallback } from '../../reactHelper';
import { useAttributePreference } from '../util/preferences';
import fetchOrThrow from '../util/fetchOrThrow';
import {
  formatSensorValue, parseSensors, sensorColor, sensorValue,
} from '../util/sensors';
import { openUnitInfo, useUnitInfo } from '../util/unitInfo';
import { useMapFollow } from '../util/mapFollow';
import {
  distanceFromMeters, distanceUnitString, speedFromKnots, speedUnitString,
} from '../util/converter';
import { formatBoolean } from '../util/formatter';
import { mapIconKey, mapIcons } from '../../map/core/preloadImages';
import { map } from '../../map/core/MapView';
import { formatPeriod, statusOf } from '../../main/DeviceRow';
import { openVideoWindow } from '../util/videoWindows';
import GoogleViewDialog from './GoogleViewDialog';

const SENSOR_ICONS = {
  fuel: <LocalGasStationIcon />,
  temperature: <ThermostatIcon />,
  voltage: <BatteryChargingFullIcon />,
  binary: <SensorDoorIcon />,
  numeric: <InsightsIcon />,
  ignition: <PowerSettingsNewIcon />,
  door: <SensorDoorIcon />,
  panic: <SensorDoorIcon />,
  seatbelt: <SensorDoorIcon />,
  pto: <SensorDoorIcon />,
  fuelImpulse: <LocalGasStationIcon />,
  fuelAbsolute: <LocalGasStationIcon />,
  fuelInstant: <LocalGasStationIcon />,
  fuelCalculated: <LocalGasStationIcon />,
  tirePressure: <InsightsIcon />,
};

const ago = (time) => {
  const seconds = Math.max(0, dayjs().diff(dayjs(time), 'second'));
  return seconds < 60 ? `${seconds} s` : formatPeriod(seconds * 1000);
};

const useStyles = makeStyles()((theme, { desktopPadding }) => ({
  card: {
    pointerEvents: 'auto',
    width: 360,
    [theme.breakpoints.down('md')]: {
      width: `calc(100vw - ${theme.spacing(10)})`,
      maxWidth: 360,
    },
    borderRadius: theme.spacing(2),
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: {
    width: 20,
    height: 20,
    filter: 'brightness(0) invert(1)',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginLeft: 8,
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    paddingBottom: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  buttons: {
    marginTop: theme.spacing(1.5),
    '& .MuiButton-root': { textTransform: 'none', whiteSpace: 'nowrap' },
  },
  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1.5),
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1, 1.25),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.spacing(1.5),
    minWidth: 0,
  },
  tileIcon: {
    display: 'flex',
    flexShrink: 0,
  },
  media: {
    height: theme.dimensions.popupImageHeight,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  mediaButton: {
    color: theme.palette.primary.contrastText,
    mixBlendMode: 'difference',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.25),
    padding: theme.spacing(1.5, 1, 1, 2),
    cursor: 'move',
  },
  content: {
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(1),
    maxHeight: theme.dimensions.cardContentMaxHeight,
    overflow: 'auto',
  },
  icon: {
    width: '25px',
    height: '25px',
    filter: 'brightness(0) invert(1)',
  },
  table: {
    '& .MuiTableCell-sizeSmall': {
      paddingLeft: 0,
      paddingRight: 0,
    },
    '& .MuiTableCell-sizeSmall:first-of-type': {
      paddingRight: theme.spacing(1),
    },
  },
  cell: {
    borderBottom: 'none',
  },
  actions: {
    justifyContent: 'space-between',
    '& .MuiButton-root': { textTransform: 'none', minWidth: 0, padding: theme.spacing(0.5, 0.75) },
    borderTop: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(0.5, 1),
  },
  root: {
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 5,
    left: '50%',
    [theme.breakpoints.up('md')]: {
      left: `calc(50% + ${desktopPadding} / 2)`,
      bottom: theme.spacing(3),
      transform: 'translateX(-50%)',
    },
    [theme.breakpoints.down('md')]: {
      left: theme.spacing(1),
      bottom: `calc(${theme.spacing(3)} + ${theme.dimensions.bottomBarHeight}px)`,
    },
  },
}));

const StatusCard = ({ deviceId, position, onClose, disableActions, desktopPadding = 0 }) => {
  const { classes } = useStyles({ desktopPadding });
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const t = useTranslation();

  const readonly = useRestriction('readonly');
  const limitCommands = useRestriction('limitCommands');
  const [engineMode, setEngineMode] = useState(null);
  const deviceReadonly = useDeviceReadonly();

  const shareDisabled = useSelector((state) => state.session.server.attributes.disableShare);
  const user = useSelector((state) => state.session.user);
  const device = useSelector((state) => state.devices.items[deviceId]);
  const infoOpen = useUnitInfo() === deviceId;

  const deviceImage = device?.attributes?.deviceImage;

  const theme = useTheme();
  const speedUnit = useAttributePreference('speedUnit', 'kmh');
  const distanceUnit = useAttributePreference('distanceUnit', 'km');
  const follow = useMapFollow();

  const navigationAppLink = useAttributePreference('navigationAppLink');
  const navigationAppTitle = useAttributePreference('navigationAppTitle');

  const [anchorEl, setAnchorEl] = useState(null);
  const [googleView, setGoogleView] = useState(null);
  const googleKey = useAttributePreference('googleKey');

  const [removing, setRemoving] = useState(false);

  const handleRemove = useCatch(async (removed) => {
    if (removed) {
      const response = await fetchOrThrow('/api/devices');
      dispatch(devicesActions.refresh(await response.json()));
    }
    setRemoving(false);
  });

  const handleGeofence = useCatchCallback(async () => {
    const newItem = {
      name: t('sharedGeofence'),
      area: `CIRCLE (${position.latitude} ${position.longitude}, 50)`,
    };
    const response = await fetchOrThrow('/api/geofences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem),
    });
    const item = await response.json();
    await fetchOrThrow('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: position.deviceId, geofenceId: item.id }),
    });
    navigate(`/settings/geofence/${item.id}`);
  }, [navigate, position]);

  // the floating unit information panel already shows this unit
  if (infoOpen) {
    return null;
  }

  const status = device ? statusOf(device, position) : { color: 'neutral' };
  const online = ['deviceMoving', 'deviceStopped'].includes(status.key);
  const center = () => position && map.easeTo({ center: [position.longitude, position.latitude], zoom: Math.max(map.getZoom(), 15) });

  // sensor values first, otherwise the usual device data
  const attributes = position?.attributes || {};
  const sensors = parseSensors(device).filter((sensor) => !sensor.hidden && sensorValue(sensor, position) !== undefined);
  const tiles = (sensors.length ? sensors.map((sensor) => ({
    key: sensor.id,
    icon: SENSOR_ICONS[sensor.type] || SENSOR_ICONS.numeric,
    label: sensor.name,
    value: formatSensorValue(sensor, sensorValue(sensor, position), t),
    color: sensorColor(sensor, sensorValue(sensor, position)),
  })) : [
    attributes.hasOwnProperty('ignition') && {
      key: 'ignition', icon: <PowerSettingsNewIcon />, label: t('positionIgnition'), value: formatBoolean(attributes.ignition, t), color: attributes.ignition ? theme.palette.success.main : theme.palette.text.secondary,
    },
    attributes.hasOwnProperty('fuel') && {
      key: 'fuel', icon: <LocalGasStationIcon />, label: t('positionFuel'), value: `${convertVolume(attributes.fuel, 'L', deviceFuelUnit(device)).toFixed(1)} ${deviceFuelUnit(device)}`,
    },
    attributes.hasOwnProperty('power') && {
      key: 'power', icon: <BatteryChargingFullIcon />, label: t('positionPower'), value: `${Number(attributes.power).toFixed(1)} V`,
    },
    attributes.hasOwnProperty('batteryLevel') && {
      key: 'batteryLevel', icon: <BatteryChargingFullIcon />, label: t('positionBatteryLevel'), value: `${attributes.batteryLevel} %`,
    },
    attributes.hasOwnProperty('totalDistance') && {
      key: 'distance', icon: <RouteIcon />, label: t('deviceTotalDistance'), value: `${distanceFromMeters(attributes.totalDistance, distanceUnit).toFixed(0)} ${distanceUnitString(distanceUnit, t)}`,
    },
  ].filter(Boolean)).slice(0, 6);

  return (
    <>
      <div className={classes.root}>
        {device && (
          <Rnd
            default={{ x: 0, y: 0, width: 'auto', height: 'auto' }}
            enableResizing={false}
            dragHandleClassName="draggable-header"
            style={{ position: 'relative' }}
          >
            <Card elevation={6} className={classes.card}>
              {deviceImage && (
                <CardMedia
                  className={`${classes.media} draggable-header`}
                  image={`/api/media/${device.uniqueId}/${deviceImage}`}
                />
              )}
              <div className={`${classes.header} draggable-header`}>
                <div className={classes.avatar} style={{ backgroundColor: theme.palette[status.color].main }}>
                  <img className={classes.avatarIcon} src={mapIcons[mapIconKey(device.category)]} alt="" />
                </div>
                <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>{device.name}</Typography>
                <Chip
                  size="small"
                  label={t(online ? 'cardConnected' : 'cardDisconnected')}
                  icon={<span className={classes.chipDot} style={{ backgroundColor: online ? theme.palette.success.main : theme.palette.error.main }} />}
                  sx={{ bgcolor: alpha(online ? theme.palette.success.main : theme.palette.error.main, 0.1), color: online ? 'success.dark' : 'error.main', fontWeight: 600 }}
                />
                <IconButton size="small" onClick={onClose} onTouchStart={onClose}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </div>
              {position && (
                <CardContent className={classes.content}>
                  <div className={classes.stats}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
                      <SpeedIcon color="action" />
                      <Typography variant="h6" fontWeight={700}>
                        {Math.round(speedFromKnots(position.speed, speedUnit))}
                        <Typography component="span" variant="body2" color="text.secondary">{` ${speedUnitString(speedUnit, t)}`}</Typography>
                      </Typography>
                    </Stack>
                    <Divider orientation="vertical" flexItem />
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1.3, pl: 1.5 }}>
                      <AccessTimeIcon color="action" fontSize="small" />
                      <div>
                        <Typography variant="body2" fontWeight={600}>{t('cardAgo').replace('{time}', ago(position.fixTime))}</Typography>
                        <Typography variant="caption" color="text.secondary">{t('cardLastUpdate')}</Typography>
                      </div>
                    </Stack>
                  </div>
                  {position && (
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                      <PlaceOutlinedIcon fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                        <AddressValue latitude={position.latitude} longitude={position.longitude} originalAddress={position.address} />
                      </Typography>
                    </Stack>
                  )}
                  {tiles.length > 0 && (
                    <div className={classes.tiles}>
                      {tiles.map(({ key, icon, label, value, color }) => (
                        <div key={key} className={classes.tile}>
                          <div className={classes.tileIcon} style={{ color: color || theme.palette.primary.main }}>{icon}</div>
                          <div style={{ minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
                            <Typography variant="subtitle2" fontWeight={700} noWrap>{value}</Typography>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Stack direction="row" spacing={1} className={classes.buttons}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<HistoryIcon />}
                      onClick={() => navigate(`/replay?deviceId=${deviceId}`)}
                      disabled={disableActions}
                    >
                      {t('cardHistory')}
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<DescriptionOutlinedIcon />}
                      onClick={() => navigate(`/reports/combined?deviceId=${deviceId}`)}
                      disabled={disableActions}
                    >
                      {t('reportTitle')}
                    </Button>
                  </Stack>
                </CardContent>
              )}
              <CardActions classes={{ root: classes.actions }} disableSpacing>
                <Button size="small" color="inherit" startIcon={<CenterFocusStrongIcon />} onClick={center} disabled={!position}>
                  {t('cardCenter')}
                </Button>
                {follow.toggle && (
                  <Button size="small" color={follow.active ? 'primary' : 'inherit'} startIcon={<GpsFixedIcon />} onClick={follow.toggle}>
                    {t('cardFollow')}
                  </Button>
                )}
                {(device.attributes?.['dashcam.kind'] || position?.protocol === 'huabao') && (
                  <Button size="small" color="inherit" startIcon={<VideocamIcon />} onClick={() => openVideoWindow(deviceId)}>
                    {t('videoTitle')}
                  </Button>
                )}
                {!deviceReadonly && !disableActions && (
                  <Button size="small" color="inherit" startIcon={<EditIcon />} onClick={() => navigate(`/settings/device/${deviceId}`)}>
                    {t('sharedEdit')}
                  </Button>
                )}
                <Tooltip title={t('sharedExtra')}>
                  <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
                    <MoreHorizIcon />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Rnd>
        )}
      </div>
      {device && (
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} onClick={() => setAnchorEl(null)}>
          <MenuItem onClick={() => openUnitInfo(deviceId)}>{t('unitInfoTitle')}</MenuItem>
          <MenuItem onClick={() => openVideoWindow(deviceId)}>{t('videoLiveFloating')}</MenuItem>
          {position && <MenuItem component={RouterLink} to={`/position/${position.id}`}>{t('sharedShowDetails')}</MenuItem>}
          {!disableActions && <MenuItem onClick={() => navigate(`/settings/device/${deviceId}/command`)}>{t('commandTitle')}</MenuItem>}
          {!disableActions && !readonly && !limitCommands && (
            <MenuItem onClick={() => setEngineMode('stop')}><Typography color="error">{t('engineCutTitle')}</Typography></MenuItem>
          )}
          {!disableActions && !readonly && !limitCommands && (
            <MenuItem onClick={() => setEngineMode('resume')}>{t('engineResumeTitle')}</MenuItem>
          )}
          {position && !readonly && <MenuItem onClick={handleGeofence}>{t('sharedCreateGeofence')}</MenuItem>}
          {position && <MenuItem component="a" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${position.latitude}%2C${position.longitude}`}>{t('linkGoogleMaps')}</MenuItem>}
          {position && <MenuItem onClick={() => setGoogleView('streetview')}>{t('linkStreetView')}</MenuItem>}
          {position && <MenuItem onClick={() => setGoogleView('satellite')}>{t('googleViews')}</MenuItem>}
          {position && <MenuItem onClick={() => setGoogleView('search')}>{t('googleNearby')}</MenuItem>}
          {position && navigationAppTitle && <MenuItem component="a" target="_blank" href={navigationAppLink.replace('{latitude}', position.latitude).replace('{longitude}', position.longitude)}>{navigationAppTitle}</MenuItem>}
          {!shareDisabled && !user.temporary && (
            <MenuItem onClick={() => navigate(`/settings/device/${deviceId}/share`)}>{t('deviceShare')}</MenuItem>
          )}
          {!deviceReadonly && !disableActions && (
            <MenuItem onClick={() => setRemoving(true)}><Typography color="error">{t('sharedRemove')}</Typography></MenuItem>
          )}
        </Menu>
      )}
      <EngineCutDialog deviceId={engineMode ? deviceId : null} mode={engineMode} onClose={() => setEngineMode(null)} />
      <GoogleViewDialog open={Boolean(googleView)} initialTab={googleView || 'satellite'} position={position} googleKey={googleKey} title={device?.name} onClose={() => setGoogleView(null)} />
      <RemoveDialog
        open={removing}
        endpoint="devices"
        itemId={deviceId}
        onResult={(removed) => handleRemove(removed)}
      />
    </>
  );
};

export default StatusCard;
