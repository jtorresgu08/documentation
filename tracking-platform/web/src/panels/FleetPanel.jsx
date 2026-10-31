import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Grid, Stack, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Metric, Row, Section, usePolling, withDevices,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { setMapFilter, useMapFilter } from '../common/util/mapFilter';
import { statusCategory } from '../main/DeviceRow';
import { devicesActions } from '../store';

// Fleet summary: units in motion, stopped, not reporting and with open alerts (each one filters the map and the
// list), units not reporting for more than 24 h and today's ranking of speeding
const FleetPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const mapFilter = useMapFilter();
  const [alerts, setAlerts] = useState([]);
  const [speeding, setSpeeding] = useState([]);

  usePolling(async () => {
    const to = dayjs().add(1, 'minute').toISOString();
    try {
      const open = new URLSearchParams({ from: dayjs().subtract(24, 'hour').toISOString(), to });
      ['new', 'ack'].forEach((status) => open.append('status', status));
      const fast = new URLSearchParams({ from: dayjs().startOf('day').toISOString(), to });
      ['deviceOverspeed', 'alarm:overspeed'].forEach((type) => fast.append('type', type));
      if (!Object.keys(devices).length) return;
      withDevices(open, devices);
      withDevices(fast, devices);
      const [openResponse, fastResponse] = await Promise.all([fetchOrThrow(`/api/alerts?${open}`), fetchOrThrow(`/api/alerts?${fast}`)]);
      setAlerts(await openResponse.json());
      setSpeeding(await fastResponse.json());
    } catch {
      // keep the last values
    }
  }, 60000, [Object.keys(devices).length]);

  const groups = useMemo(() => {
    const result = {
      moving: [], stopped: [], offline: [], alert: [...new Set(alerts.map((item) => item.deviceId))].filter((id) => devices[id]),
    };
    Object.values(devices).forEach((device) => result[statusCategory(device, positions[device.id])].push(device.id));
    result.silent = Object.values(devices).filter((device) => !device.lastUpdate || dayjs().diff(dayjs(device.lastUpdate), 'hour') >= 24).map((device) => device.id);
    return result;
  }, [devices, positions, alerts]);

  const ranking = useMemo(() => {
    const byDevice = {};
    speeding.forEach((item) => {
      const entry = byDevice[item.deviceId] || { deviceId: item.deviceId, name: item.deviceName, count: 0, max: 0 };
      entry.count += 1;
      entry.max = Math.max(entry.max, Math.round((item.attributes?.speed || 0) * 1.852));
      byDevice[item.deviceId] = entry;
    });
    return Object.values(byDevice).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [speeding]);

  const filterBy = (key, label) => {
    if (mapFilter?.key === key) {
      setMapFilter(null);
    } else {
      setMapFilter({ key, label, deviceIds: groups[key] });
      navigate('/');
    }
  };

  const total = Object.keys(devices).length;
  const tiles = [
    ['moving', t('quickMoving'), theme.palette.success.main],
    ['stopped', t('quickStopped'), theme.palette.warning.main],
    ['offline', t('quickOffline'), theme.palette.error.main],
    ['alert', t('panelWithAlerts'), '#c62828'],
  ];

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<DashboardIcon fontSize="small" />}
      title={t('panelFleet')}
      subtitle={`${total} ${t('quickVehicles')}${mapFilter ? ` · ${t('panelFiltering')}: ${mapFilter.label}` : ''}`}
      width={360}
      footer={mapFilter && <Button size="small" onClick={() => setMapFilter(null)}>{t('panelClearFilter')}</Button>}
    >
      <Grid container spacing={0.75}>
        {tiles.map(([key, label, color]) => (
          <Grid size={6} key={key}>
            <Metric
              label={label}
              value={groups[key].length}
              color={color}
              active={mapFilter?.key === key}
              onClick={() => filterBy(key, label)}
              caption={total ? `${Math.round((groups[key].length / total) * 100)} %` : null}
            />
          </Grid>
        ))}
      </Grid>
      <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', mt: 1 }}>
        {tiles.slice(0, 3).map(([key, , color]) => <Box key={key} sx={{ width: `${total ? (groups[key].length / total) * 100 : 0}%`, bgcolor: color }} />)}
      </Box>
      <Section
        title={`${t('panelSilent24h')} (${groups.silent.length})`}
        action={groups.silent.length > 0 && <Button size="small" onClick={() => filterBy('silent', t('panelSilent24h'))}>{t('panelShowOnMap')}</Button>}
      >
        {groups.silent.slice(0, 4).map((id) => (
          <Row key={id} color={theme.palette.error.main} primary={devices[id].name} secondary={devices[id].lastUpdate ? dayjs(devices[id].lastUpdate).format('DD/MM HH:mm') : t('deviceNoData')} onClick={() => dispatch(devicesActions.selectId(id))} />
        ))}
      </Section>
      <Section title={t('panelSpeedingToday')}>
        {!ranking.length && <Typography variant="caption" color="text.secondary">{t('panelNoSpeeding')}</Typography>}
        {ranking.map((entry, index) => (
          <Row
            key={entry.deviceId}
            primary={`${index + 1}. ${entry.name}`}
            secondary={entry.max ? `${t('replayMaxSpeed')} ${entry.max} km/h` : null}
            right={(
              <Stack alignItems="flex-end">
                <Typography variant="body2" fontWeight={800} color="error.main">{entry.count}</Typography>
                <Typography variant="caption" color="text.secondary">{t('panelTimes')}</Typography>
              </Stack>
            )}
            onClick={() => dispatch(devicesActions.selectId(entry.deviceId))}
          />
        ))}
      </Section>
    </FloatingPanel>
  );
};

export default FleetPanel;
