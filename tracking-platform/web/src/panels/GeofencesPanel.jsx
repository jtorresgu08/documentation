import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, Collapse, Stack, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import PentagonIcon from '@mui/icons-material/Pentagon';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Empty, Row, Section, formatMinutes, usePolling, withDevices,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { setMapFilter } from '../common/util/mapFilter';
import { devicesActions } from '../store';

// Geofences live: which units are inside every geofence (warehouses, sites, clients) and for how long, plus the
// entries and exits of today
const GeofencesPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const geofences = useSelector((state) => state.geofences.items);
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const [moves, setMoves] = useState([]);
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState('');

  usePolling(async () => {
    const query = new URLSearchParams({ from: dayjs().startOf('day').toISOString(), to: dayjs().add(1, 'minute').toISOString() });
    ['geofenceEnter', 'geofenceExit'].forEach((type) => query.append('type', type));
    if (!Object.keys(devices).length) return;
    withDevices(query, devices);
    try {
      setMoves(await (await fetchOrThrow(`/api/alerts?${query}`)).json());
    } catch {
      // keep the last ones
    }
  }, 60000, [Object.keys(devices).length]);

  const rows = useMemo(() => {
    const entered = {};
    [...moves].reverse().forEach((item) => {
      const key = `${item.deviceId}-${item.geofenceId}`;
      if (item.type === 'geofenceEnter' && !entered[key]) entered[key] = item.eventTime;
    });
    return Object.values(geofences).map((geofence) => {
      const inside = Object.values(positions)
        .filter((position) => devices[position.deviceId] && position.geofenceIds?.includes(geofence.id))
        .map((position) => ({ deviceId: position.deviceId, since: entered[`${position.deviceId}-${geofence.id}`] }));
      return { geofence, inside };
    }).filter((row) => row.geofence.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.inside.length - a.inside.length || a.geofence.name.localeCompare(b.geofence.name));
  }, [geofences, positions, devices, moves, search]);

  const occupied = rows.filter((row) => row.inside.length).length;

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<PentagonIcon fontSize="small" />}
      color={theme.palette.secondary.main}
      title={t('panelGeofences')}
      subtitle={`${Object.keys(geofences).length} ${t('sharedGeofences').toLowerCase()} · ${occupied} ${t('panelOccupied')}`}
      width={360}
      height={480}
    >
      <TextField size="small" fullWidth placeholder={t('sharedSearch')} value={search} onChange={(event) => setSearch(event.target.value)} sx={{ mb: 1 }} />
      {!rows.length && <Empty>{t('panelNoGeofences')}</Empty>}
      <Stack spacing={0.5}>
        {rows.map(({ geofence, inside }) => (
          <Box key={geofence.id} sx={{ borderRadius: '12px', bgcolor: alpha(theme.palette.secondary.main, inside.length ? 0.07 : 0.02) }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1, cursor: inside.length ? 'pointer' : 'default' }} onClick={() => inside.length && setOpen(open === geofence.id ? null : geofence.id)}>
              <PentagonIcon fontSize="small" sx={{ color: geofence.attributes?.color || theme.palette.secondary.main }} />
              <Typography variant="body2" fontWeight={700} sx={{ flexGrow: 1 }} noWrap>{geofence.name}</Typography>
              <Chip size="small" label={inside.length} color={inside.length ? 'secondary' : 'default'} sx={{ height: 20, fontWeight: 700 }} />
            </Stack>
            <Collapse in={open === geofence.id}>
              <Box sx={{ px: 1, pb: 1 }}>
                {inside.map((item) => (
                  <Row
                    key={item.deviceId}
                    primary={devices[item.deviceId]?.name}
                    secondary={item.since ? `${t('panelInsideFor')} ${formatMinutes(dayjs().diff(dayjs(item.since), 'minute', true))}` : t('panelInside')}
                    onClick={() => { dispatch(devicesActions.selectId(item.deviceId)); navigate('/'); }}
                  />
                ))}
                <Button size="small" onClick={() => { setMapFilter({ key: `geofence-${geofence.id}`, label: geofence.name, deviceIds: inside.map((item) => item.deviceId) }); navigate('/'); }}>
                  {t('panelShowOnMap')}
                </Button>
              </Box>
            </Collapse>
          </Box>
        ))}
      </Stack>
      <Section title={t('panelTodayMoves')}>
        {!moves.length && <Typography variant="caption" color="text.secondary">{t('panelNoData')}</Typography>}
        {moves.slice(0, 8).map((item) => (
          <Stack key={item.id} direction="row" spacing={1} alignItems="center" sx={{ py: 0.4 }}>
            {item.type === 'geofenceEnter' ? <LoginIcon fontSize="small" color="success" /> : <LogoutIcon fontSize="small" color="warning" />}
            <Typography variant="caption" sx={{ flexGrow: 1 }} noWrap>
              {`${item.deviceName} · ${geofences[item.geofenceId]?.name || ''}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">{dayjs(item.eventTime).format('HH:mm')}</Typography>
          </Stack>
        ))}
      </Section>
    </FloatingPanel>
  );
};

export default GeofencesPanel;
