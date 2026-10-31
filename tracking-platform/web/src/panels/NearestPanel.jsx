import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Button, FormControlLabel, IconButton, Stack, Switch, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import NearMeIcon from '@mui/icons-material/NearMe';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import FloatingPanel from './FloatingPanel';
import {
  Empty, distanceMeters, formatKm, formatMinutes, speedKmh,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import { openPanel, setPanelData, updatePanel } from '../common/util/floatingPanels';
import { map } from '../map/core/MapView';
import { statusCategory } from '../main/DeviceRow';
import { devicesActions } from '../store';

// road distance is longer than the straight line; average urban speed for the arrival estimate
const ROAD_FACTOR = 1.3;
const AVERAGE_SPEED = 35;

// Nearest unit to a point: click on the map (or use the selected unit's position) and get the closest units with
// the estimated distance by road and arrival time, to dispatch one with a command or a message to its driver
const NearestPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const point = panel.props.point || null;
  const onlyAvailable = panel.props.onlyAvailable !== false;
  const [picking, setPicking] = useState(!point);

  useEffect(() => {
    if (!picking) return undefined;
    const onClick = (event) => {
      event.preventDefault();
      updatePanel(panel.id, { props: { ...panel.props, point: [event.lngLat.lng, event.lngLat.lat] } });
      setPicking(false);
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [picking, panel.props]);

  const nearest = useMemo(() => {
    if (!point) return [];
    return Object.values(positions)
      .filter((position) => devices[position.deviceId])
      .map((position) => {
        const device = devices[position.deviceId];
        const category = statusCategory(device, position);
        const straight = distanceMeters(point[1], point[0], position.latitude, position.longitude);
        return {
          device, position, category, distance: straight * ROAD_FACTOR, minutes: ((straight * ROAD_FACTOR) / 1000 / AVERAGE_SPEED) * 60,
        };
      })
      .filter((item) => !onlyAvailable || item.category !== 'offline')
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [point, positions, devices, onlyAvailable]);

  useEffect(() => {
    setPanelData(panel.id, point ? { point, targets: nearest.slice(0, 3).map((item) => [item.position.longitude, item.position.latitude]) } : null);
  }, [point, nearest]);

  useEffect(() => () => setPanelData(panel.id, null), []);

  const colors = { moving: theme.palette.success.main, stopped: theme.palette.warning.main, offline: theme.palette.error.main };

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<NearMeIcon fontSize="small" />}
      title={t('panelNearest')}
      subtitle={point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : t('panelPickPoint')}
      width={360}
      height={460}
      footer={<Typography variant="caption" color="text.secondary">{t('panelNearestHint')}</Typography>}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Button size="small" variant={picking ? 'contained' : 'outlined'} startIcon={<AdsClickIcon />} onClick={() => setPicking(!picking)}>
          {picking ? t('panelClickOnMap') : t('panelPickPoint')}
        </Button>
        <FormControlLabel
          control={<Switch size="small" checked={onlyAvailable} onChange={(event) => updatePanel(panel.id, { props: { ...panel.props, onlyAvailable: event.target.checked } })} />}
          label={<Typography variant="caption">{t('panelOnlyAvailable')}</Typography>}
        />
      </Stack>
      {!point && <Empty>{t('panelPickPointHint')}</Empty>}
      {point && !nearest.length && <Empty>{t('panelNoUnitsNear')}</Empty>}
      <Stack spacing={0.5}>
        {nearest.map((item, index) => (
          <Stack
            key={item.device.id}
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ p: 0.75, borderRadius: '12px', bgcolor: index === 0 ? alpha(theme.palette.primary.main, 0.08) : 'transparent' }}
          >
            <Box sx={{
              width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff', bgcolor: colors[item.category], flexShrink: 0,
            }}
            >
              {index + 1}
            </Box>
            <Box sx={{ minWidth: 0, flexGrow: 1, cursor: 'pointer' }} onClick={() => dispatch(devicesActions.selectId(item.device.id))}>
              <Typography variant="body2" fontWeight={700} noWrap>{item.device.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {`${formatKm(item.distance)} · ${t('panelEta')} ${formatMinutes(item.minutes)} · ${speedKmh(item.position)} km/h`}
              </Typography>
            </Box>
            <Tooltip title={t('panelCommands')}><IconButton size="small" onClick={() => openPanel('commands', { deviceIds: [item.device.id] })}><SendIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title={t('panelChat')}><IconButton size="small" onClick={() => openPanel('chat', { deviceId: item.device.id })}><ChatIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        ))}
      </Stack>
    </FloatingPanel>
  );
};

export default NearestPanel;
