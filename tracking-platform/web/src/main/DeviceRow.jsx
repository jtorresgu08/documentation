import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { makeStyles } from 'tss-react/mui';
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
import dayjs from 'dayjs';
import { devicesActions } from '../store';
import { formatAlarm, formatBoolean } from '../common/util/formatter';
import EngineIcon from '../resources/images/data/engine.svg?react';
import { speedFromKnots, speedUnitString } from '../common/util/converter';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useDeviceReadonly, useRestriction } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';

export const GROUP_ROW_HEIGHT = 56;
export const DEVICE_ROW_HEIGHT = 84;

const useStyles = makeStyles()((theme) => ({
  group: {
    display: 'flex',
    alignItems: 'center',
    height: GROUP_ROW_HEIGHT - 8,
    margin: theme.spacing(0.5, 1),
    paddingRight: theme.spacing(0.5),
    borderRadius: theme.shape.borderRadius * 3,
    backgroundColor: theme.palette.action.hover,
  },
  groupName: {
    flexGrow: 1,
    minWidth: 0,
    marginLeft: theme.spacing(0.5),
  },
  device: {
    display: 'flex',
    alignItems: 'center',
    height: DEVICE_ROW_HEIGHT,
    padding: theme.spacing(0, 0.5, 0, 1.5),
    cursor: 'pointer',
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
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
    width: 12,
    height: 12,
    borderRadius: '50%',
    flexShrink: 0,
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
const statusOf = (device, position) => {
  if (isExpired(device)) {
    return { color: 'error', key: 'deviceExpired' };
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
      <Checkbox
        size="small"
        checked={!data.hidden.has(item.id)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => data.setHidden([item.id], !event.target.checked)}
      />
      <div className={classes.texts}>
        <Typography variant="subtitle1" noWrap sx={{ lineHeight: 1.3 }}>{item[devicePrimary]}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '—'}</Typography>
        <Typography variant="body2" noWrap sx={{ color: status.color === 'error' ? 'error.main' : 'text.secondary' }}>
          {statusText}
        </Typography>
      </div>
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
        <span className={classes.dot} style={{ backgroundColor: theme.palette[status.color].main }} />
        <Typography variant="body1">
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
