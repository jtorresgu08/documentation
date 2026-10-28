import {
  useState, useCallback, useEffect, useMemo,
} from 'react';
import {
  Box, Chip, Paper, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import NavigationIcon from '@mui/icons-material/Navigation';
import { makeStyles } from 'tss-react/mui';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useDispatch, useSelector } from 'react-redux';
import DeviceList from './DeviceList';
import StatusCard from '../common/components/StatusCard';
import { devicesActions } from '../store';
import usePersistedState from '../common/util/usePersistedState';
import EventsDrawer from './EventsDrawer';
import UnitInfoPanel from './UnitInfoPanel';
import useFilter from './useFilter';
import MainToolbar from './MainToolbar';
import MainMap from './MainMap';
import { useAttributePreference } from '../common/util/preferences';
import { useTranslation } from '../common/components/LocalizationProvider';
import { statusCategory } from './DeviceRow';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
  },
  sidebar: {
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('md')]: {

      position: 'fixed',
      left: 0,
      top: 0,
      height: `calc(100% - ${theme.spacing(3)})`,
      width: theme.dimensions.deviceListWidth,
      margin: theme.spacing(1.5),
      zIndex: 3,
    },
    [theme.breakpoints.down('md')]: {
      height: '100%',
      width: '100%',
    },
  },
  header: {
    pointerEvents: 'auto',
    zIndex: 6,
    [theme.breakpoints.up('md')]: {
      borderRadius: `${theme.spacing(2)} ${theme.spacing(2)} 0 0`,
      backgroundColor: alpha(theme.palette.background.paper, 0.86),
      backdropFilter: 'blur(14px) saturate(160%)',
      boxShadow: `0 4px 24px ${alpha(theme.palette.common.black, 0.1)}`,
      borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
    },
  },
  glass: {
    [theme.breakpoints.up('md')]: {
      borderRadius: `0 0 ${theme.spacing(2)} ${theme.spacing(2)}`,
      backgroundColor: alpha(theme.palette.background.paper, 0.8),
      backdropFilter: 'blur(14px) saturate(160%)',
      boxShadow: `0 12px 32px ${alpha(theme.palette.common.black, 0.14)}`,
      overflow: 'hidden',
    },
  },
  middle: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    minHeight: 0,
  },
  contentMap: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
  },
  contentList: {
    pointerEvents: 'auto',
    gridArea: '1 / 1',
    zIndex: 4,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
  },
  quickFilters: {
    display: 'flex',
    gap: theme.spacing(0.75),
    padding: theme.spacing(1.25, 1.5, 0.5),
    overflowX: 'auto',
    flexShrink: 0,
  },
  listBox: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  counters: {
    position: 'fixed',
    top: theme.spacing(1.5),
    left: `calc(${theme.dimensions.deviceListWidth} + ${theme.spacing(4)})`,
    zIndex: 3,
    display: 'flex',
    gap: theme.spacing(1),
    padding: theme.spacing(0.75),
    borderRadius: theme.spacing(1.5),
    backgroundColor: alpha(theme.palette.background.paper, 0.85),
    backdropFilter: 'blur(8px)',
    boxShadow: theme.shadows[3],
  },
}));

const MainPage = () => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const theme = useTheme();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const mapOnSelect = useAttributePreference('mapOnSelect', true);

  const selectedDeviceId = useSelector((state) => state.devices.selectedId);
  const positions = useSelector((state) => state.session.positions);
  const [filteredPositions, setFilteredPositions] = useState([]);
  const selectedPosition = filteredPositions.find((position) => selectedDeviceId && position.deviceId === selectedDeviceId);

  const [filteredDevices, setFilteredDevices] = useState([]);

  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = usePersistedState('filter', {
    statuses: [],
    groups: [],
  });
  const [filterSort, setFilterSort] = usePersistedState('filterSort', '');
  const [filterMap, setFilterMap] = usePersistedState('filterMap', false);
  const [hiddenDevices, setHiddenDevices] = usePersistedState('hiddenDevices', []);

  const [devicesOpen, setDevicesOpen] = useState(desktop);
  const [eventsOpen, setEventsOpen] = useState(false);

  const onEventsClick = useCallback(() => setEventsOpen(true), [setEventsOpen]);

  useEffect(() => {
    if (!desktop && mapOnSelect && selectedDeviceId) {
      setDevicesOpen(false);
    }
  }, [desktop, mapOnSelect, selectedDeviceId]);

  useFilter(keyword, filter, filterSort, filterMap, positions, setFilteredDevices, setFilteredPositions);

  const t = useTranslation();
  const [quickStatus, setQuickStatus] = usePersistedState('quickStatus', 'all');
  const categories = useMemo(
    () => Object.fromEntries(filteredDevices.map((device) => [device.id, statusCategory(device, positions[device.id])])),
    [filteredDevices, positions],
  );
  const counts = useMemo(() => Object.values(categories).reduce((result, category) => {
    result[category] += 1;
    return result;
  }, { moving: 0, stopped: 0, offline: 0 }), [categories]);
  const listDevices = quickStatus === 'all'
    ? filteredDevices : filteredDevices.filter((device) => categories[device.id] === quickStatus);

  const mapPositions = useMemo(() => {
    const hidden = new Set(hiddenDevices);
    return filteredPositions.filter((position) => !hidden.has(position.deviceId)
      && (quickStatus === 'all' || categories[position.deviceId] === quickStatus));
  }, [filteredPositions, hiddenDevices, quickStatus, categories]);

  const quickOptions = [
    ['all', t('quickAll'), filteredDevices.length, 'primary'],
    ['moving', t('quickMoving'), counts.moving, 'success'],
    ['stopped', t('quickStopped'), counts.stopped, 'warning'],
    ['offline', t('quickOffline'), counts.offline, 'error'],
  ];

  return (
    <div className={classes.root}>
      {desktop && (
        <MainMap
          filteredPositions={mapPositions}
          selectedPosition={selectedPosition}
          onEventsClick={onEventsClick}
        />
      )}
      <div className={classes.sidebar}>
        <Paper square elevation={3} className={classes.header}>
          <MainToolbar
            filteredDevices={filteredDevices}
            devicesOpen={devicesOpen}
            setDevicesOpen={setDevicesOpen}
            keyword={keyword}
            setKeyword={setKeyword}
            filter={filter}
            setFilter={setFilter}
            filterSort={filterSort}
            setFilterSort={setFilterSort}
            filterMap={filterMap}
            setFilterMap={setFilterMap}
          />
        </Paper>
        <div className={classes.middle}>
          {!desktop && (
            <div className={classes.contentMap}>
              <MainMap
                filteredPositions={mapPositions}
                selectedPosition={selectedPosition}
                onEventsClick={onEventsClick}
              />
            </div>
          )}
          <Paper square elevation={0} className={`${classes.contentList} ${classes.glass}`} style={devicesOpen ? {} : { visibility: 'hidden' }}>
            <div className={classes.quickFilters}>
              {quickOptions.map(([key, label, count, color]) => (
                <Chip
                  key={key}
                  size="small"
                  clickable
                  color={quickStatus === key ? color : 'default'}
                  variant={quickStatus === key ? 'filled' : 'outlined'}
                  onClick={() => setQuickStatus(key)}
                  label={(
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{label}</span>
                      <Box component="span" sx={{ fontWeight: 700, opacity: 0.85 }}>{count}</Box>
                    </Stack>
                  )}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </div>
            <div className={classes.listBox}>
              <DeviceList devices={listDevices} hiddenDevices={hiddenDevices} setHiddenDevices={setHiddenDevices} />
            </div>
          </Paper>
        </div>
      </div>
      {desktop && (
        <div className={classes.counters}>
          {[['all', DirectionsCarIcon, t('quickVehicles'), filteredDevices.length, theme.palette.success.main],
            ['moving', NavigationIcon, t('quickInMotion'), counts.moving, theme.palette.info.main]].map(([key, Icon, label, count, color]) => (
              <Stack
                key={key}
                direction="row"
                spacing={1}
                alignItems="center"
                onClick={() => setQuickStatus(quickStatus === key ? 'all' : key)}
                sx={{
                  px: 1.5, py: 0.75, borderRadius: 1, cursor: 'pointer', bgcolor: alpha(color, quickStatus === key ? 0.22 : 0.1), color,
                }}
              >
                <Icon fontSize="small" />
                <Typography variant="body2" fontWeight={600}>{`${count} ${label}`}</Typography>
              </Stack>
          ))}
        </div>
      )}
      <EventsDrawer open={eventsOpen} onClose={() => setEventsOpen(false)} />
      <UnitInfoPanel />
      {selectedDeviceId && (
        <StatusCard
          deviceId={selectedDeviceId}
          position={selectedPosition}
          onClose={() => dispatch(devicesActions.selectId(null))}
          desktopPadding={theme.dimensions.deviceListWidth}
        />
      )}
    </div>
  );
};

export default MainPage;
