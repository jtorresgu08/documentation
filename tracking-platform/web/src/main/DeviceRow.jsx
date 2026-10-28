import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
import { alpha } from '@mui/material/styles';
import {
  Checkbox, Chip, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import ErrorIcon from '@mui/icons-material/Error';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import HistoryIcon from '@mui/icons-material/History';
import SendIcon from '@mui/icons-material/Send';
import ShareIcon from '@mui/icons-material/Share';
import EditIcon from '@mui/icons-material/Edit';
import VideocamIcon from '@mui/icons-material/Videocam';
import InfoIcon from '@mui/icons-material/Info';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import dayjs from 'dayjs';
import { devicesActions } from '../store';
import { formatAlarm, formatBoolean } from '../common/util/formatter';
import EngineIcon from '../resources/images/data/engine.svg?react';
import { speedFromKnots, speedUnitString } from '../common/util/converter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useDeviceReadonly, useRestriction } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import { fuelSensors } from '../common/util/sensors';
import { mapIconKey, mapIcons } from '../map/core/preloadImages';
import { openUnitInfo } from '../common/util/unitInfo';

export const GROUP_ROW_HEIGHT = 56;
export const DEVICE_ROW_HEIGHT = 68;

const useStyles = makeStyles()((theme) => ({
  group: {
    display: 'flex',
    alignItems: 'center',
    height: GROUP_ROW_HEIGHT - 8,
    margin: theme.spacing(0.5, 1),
    paddingRight: theme.spacing(0.5),
    borderRadius: theme.spacing(1.5),
    backgroundColor: alpha(theme.palette.text.primary, 0.04),
  },
  groupName: {
    flexGrow: 1,
    minWidth: 0,
    marginLeft: theme.spacing(0.5),
  },
  device: {
    display: 'flex',
    alignItems: 'center',
    height: DEVICE_ROW_HEIGHT - 4,
    margin: theme.spacing(0.25, 1),
    padding: theme.spacing(0, 0.25, 0, 0.75),
    cursor: 'pointer',
    borderRadius: theme.spacing(1.5),
    transition: 'background-color 0.15s',
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.06),
    },
  },
  selected: {
    backgroundColor: alpha(theme.palette.primary.main, 0.12),
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.14),
    },
  },
  disabled: {
    opacity: 0.5,
  },
  texts: {
    flexGrow: 1,
    minWidth: 0,
    marginLeft: theme.spacing(0.5),
  },
  speed: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    marginLeft: theme.spacing(1),
    whiteSpace: 'nowrap',
  },
  engine: {
    flexShrink: 0,
    marginLeft: theme.spacing(0.5),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'inline-block',
    marginRight: theme.spacing(0.75),
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing(1),
  },
  avatarIcon: {
    width: 20,
    height: 20,
    filter: 'brightness(0) invert(1)',
  },
}));

export const formatPeriod = (milliseconds) => {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}min`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
};

const isExpired = (device) => device.expirationTime && dayjs(device.expirationTime).isBefore(dayjs());

// green moving, yellow online but stopped, red offline or expired, grey without data
export const statusOf = (device, position) => {
  if (isExpired(device)) {
    return { color: 'error', key: 'deviceExpired' };
  }
  if (!device.lastUpdate) {
    return { color: 'neutral', key: 'deviceNoData' };
  }
  if (device.status === 'offline') {
    return { color: 'error', key: 'deviceDisconnected', since: device.lastUpdate };
  }
  if (!position) {
    return { color: 'neutral', key: 'deviceNoData' };
  }
  const moving = position.attributes.motion;
  return {
    color: moving ? 'success' : 'warning',
    key: moving ? 'deviceMoving' : 'deviceStopped',
    since: position.attributes.motionTime || position.fixTime,
  };
};

export const statusCategory = (device, position) => {
  const { key } = statusOf(device, position);
  if (key === 'deviceMoving') {
    return 'moving';
  }
  return key === 'deviceStopped' ? 'stopped' : 'offline';
};

export const GroupRow = ({ row, data }) => {
  const { classes } = useStyles();
  const t = useTranslation();
  const visible = row.deviceIds.filter((id) => !data.hidden.has(id)).length;
  const collapsed = data.collapsed.has(row.id);
  return (
    <div className={classes.group}>
      <Checkbox
        size="small"
        checked={visible === row.deviceIds.length && visible > 0}
        indeterminate={visible > 0 && visible < row.deviceIds.length}
        onChange={(event) => data.setHidden(row.deviceIds, !event.target.checked)}
      />
      <Typography variant="subtitle1" className={classes.groupName} noWrap>
        {row.name || t('deviceNoGroup')}
      </Typography>
      <Chip size="small" color="primary" label={row.deviceIds.length} sx={{ mr: 1, fontWeight: 600 }} />
      <IconButton size="small" color="primary" onClick={() => data.toggleCollapsed(row.id)}>
        {collapsed ? <AddIcon /> : <RemoveIcon />}
      </IconButton>
    </div>
  );
};

export const DeviceRow = ({ row, data }) => {
  const { classes, cx, theme } = useStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const admin = useAdministrator();
  const deviceReadonly = useDeviceReadonly();
  const readonly = useRestriction('readonly');
  const limitCommands = useRestriction('limitCommands');
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);

  const item = row.device;
  const position = useSelector((state) => state.session.positions[item.id]);

  const speedUnit = useAttributePreference('speedUnit', 'kmh');
  const devicePrimary = useAttributePreference('devicePrimary', 'name');

  const [anchor, setAnchor] = useState(null);

  const status = statusOf(item, position);
  const statusText = status.since
    ? `${t(status.key)} ${formatPeriod(dayjs().diff(dayjs(status.since)))}`
    : t(status.key);
  const time = position?.fixTime || item.lastUpdate;

  const action = (fn) => (event) => {
    event.stopPropagation();
    setAnchor(null);
    fn();
  };

  return (
    <div
      className={cx(classes.device, selectedDeviceId === item.id && classes.selected, !admin && item.disabled && classes.disabled)}
      onClick={() => dispatch(devicesActions.selectId(item.id))}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === 'Enter' && dispatch(devicesActions.selectId(item.id))}
    >
      {data.setHidden && (
        <Checkbox
          size="small"
          sx={{ p: 0.5, mr: 0.5 }}
          checked={!data.hidden.has(item.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => data.setHidden([item.id], !event.target.checked)}
        />
      )}
      <div className={classes.avatar} style={{ backgroundColor: theme.palette[status.color].main }}>
        <img className={classes.avatarIcon} src={mapIcons[mapIconKey(item.category)]} alt="" />
      </div>
      <Tooltip title={time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : ''} placement="top-start" enterDelay={600}>
        <div className={classes.texts}>
          <Typography variant="subtitle2" fontWeight={600} noWrap>{item[devicePrimary]}</Typography>
          <Typography variant="body2" noWrap sx={{ color: status.color === 'error' ? 'error.main' : 'text.secondary', display: 'flex', alignItems: 'center' }}>
            <span className={classes.dot} style={{ backgroundColor: theme.palette[status.color].main }} />
            {statusText}
          </Typography>
        </div>
      </Tooltip>
      {position?.attributes.alarm && (
        <Tooltip title={`${t('eventAlarm')}: ${formatAlarm(position.attributes.alarm, t)}`}>
          <ErrorIcon fontSize="small" color="error" />
        </Tooltip>
      )}
      {position?.attributes.hasOwnProperty('ignition') && (
        <Tooltip title={`${t('positionIgnition')}: ${formatBoolean(position.attributes.ignition, t)}`}>
          <EngineIcon
            width={20}
            height={20}
            className={classes.engine}
            style={{ color: position.attributes.ignition ? theme.palette.success.main : theme.palette.neutral.main }}
          />
        </Tooltip>
      )}
      <div className={classes.speed}>
        <Typography variant="body2" fontWeight={600}>
          {`${Math.round(speedFromKnots(position?.speed || 0, speedUnit))} ${speedUnitString(speedUnit, t)}`}
        </Typography>
      </div>
      <IconButton
        size="small"
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(event) => event.stopPropagation()}>
        <MenuItem onClick={action(() => dispatch(devicesActions.selectId(item.id)))}>
          <ListItemIcon><MyLocationIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('deviceShowOnMap')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={action(() => {
          dispatch(devicesActions.selectId(item.id));
          openUnitInfo(item.id);
        })}
        >
          <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('unitInfoTitle')}</ListItemText>
        </MenuItem>
        {fuelSensors(item).length > 0 && (
          <MenuItem onClick={action(() => navigate(`/reports/fuel?deviceId=${item.id}`))}>
            <ListItemIcon><LocalGasStationIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('fuelTitle')}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={action(() => {
          dispatch(devicesActions.selectId(item.id));
          navigate('/replay');
        })}
        >
          <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('navHistory')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={action(() => {
          dispatch(devicesActions.selectId(item.id));
          navigate('/dashcam');
        })}
        >
          <ListItemIcon><VideocamIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('navCameras')}</ListItemText>
        </MenuItem>
        {!limitCommands && !readonly && (
          <MenuItem onClick={action(() => navigate(`/settings/device/${item.id}/command`))}>
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('navSendCommand')}</ListItemText>
          </MenuItem>
        )}
        {!readonly && (
          <MenuItem onClick={action(() => navigate(`/settings/device/${item.id}/share`))}>
            <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('navShareLocation')}</ListItemText>
          </MenuItem>
        )}
        {!deviceReadonly && (
          <MenuItem onClick={action(() => navigate(`/settings/device/${item.id}`))}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('sharedEdit')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </div>
  );
};

const Row = ({ data, index, style }) => {
  const row = data.rows[index];
  return (
    <div style={style}>
      {row.type === 'group' ? <GroupRow row={row} data={data} /> : <DeviceRow row={row} data={data} />}
    </div>
  );
};

export default Row;
