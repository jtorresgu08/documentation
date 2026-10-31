import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import VideocamIcon from '@mui/icons-material/Videocam';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Empty, formatAgo, usePolling, withDevices,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { updatePanel } from '../common/util/floatingPanels';
import { openVideoWindow } from '../common/util/videoWindows';
import { devicesActions } from '../store';
import {
  SEVERITY_COLORS, alertTitle, capitalize, playAlertSound,
} from '../operations/alertUtils';

// Live alerts: the open critical and high priority alerts of the last 24 hours, newest first, with a beep for every
// new critical one and take / resolve / false alarm, locate and video without leaving the map
const AlertsPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const readonly = useSelector((state) => state.session.user.readonly);
  const socketEvents = useSelector((state) => state.events.items.length);
  const devices = useSelector((state) => state.devices.items);
  const severities = panel.props.severities || ['critical', 'high'];
  const sound = panel.props.sound !== false;
  const [items, setItems] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const known = useRef(null);

  const load = async () => {
    const query = new URLSearchParams({ from: dayjs().subtract(24, 'hour').toISOString(), to: dayjs().add(1, 'minute').toISOString() });
    ['new', 'ack'].forEach((status) => query.append('status', status));
    severities.forEach((severity) => query.append('severity', severity));
    if (!Object.keys(devices).length) return;
    withDevices(query, devices);
    try {
      const response = await fetchOrThrow(`/api/alerts?${query}`);
      const list = await response.json();
      if (known.current && sound && list.some((item) => item.severity === 'critical' && item.status === 'new' && !known.current.has(item.id))) {
        playAlertSound();
      }
      known.current = new Set(list.map((item) => item.id));
      setItems(list);
    } catch {
      setItems((current) => current || []);
    }
  };

  usePolling(load, 20000, [severities.join(), sound, Object.keys(devices).length]);
  useEffect(() => {
    if (known.current) load();
  }, [socketEvents]);

  const act = async (item, status) => {
    await fetchOrThrow(`/api/alerts/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const locate = (item) => {
    dispatch(devicesActions.selectId(item.deviceId));
    navigate('/');
  };

  const toggleSeverity = (severity) => {
    const next = severities.includes(severity) ? severities.filter((item) => item !== severity) : [...severities, severity];
    if (next.length) updatePanel(panel.id, { props: { ...panel.props, severities: next } });
  };

  const critical = (items || []).filter((item) => item.severity === 'critical').length;

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<NotificationsActiveIcon fontSize="small" />}
      color={SEVERITY_COLORS.critical}
      title={t('panelAlerts')}
      subtitle={items ? `${items.length} ${t('panelOpen')} · ${critical} ${t('alertSeverityCritical').toLowerCase()}` : t('sharedLoading')}
      width={380}
      height={460}
      actions={(
        <Tooltip title={t('panelSound')}>
          <IconButton size="small" onClick={() => updatePanel(panel.id, { props: { ...panel.props, sound: !sound } })}>
            {sound ? <VolumeUpIcon fontSize="small" /> : <VolumeOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      footer={<Button size="small" onClick={() => navigate('/alert-center')}>{t('panelOpenAlertCenter')}</Button>}
    >
      <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
        {['critical', 'high', 'medium', 'low'].map((severity) => {
          const active = severities.includes(severity);
          return (
            <Chip
              key={severity}
              size="small"
              label={t(`alertSeverity${capitalize(severity)}`)}
              onClick={() => toggleSeverity(severity)}
              sx={{
                height: 22, fontSize: 11, fontWeight: 700, bgcolor: alpha(SEVERITY_COLORS[severity], active ? 0.16 : 0.04), color: active ? SEVERITY_COLORS[severity] : 'text.disabled',
              }}
            />
          );
        })}
      </Stack>
      {items && !items.length && <Empty>{t('panelNoAlerts')}</Empty>}
      <Stack spacing={0.75}>
        {(items || []).slice(0, 50).map((item) => (
          <Box
            key={item.id}
            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            sx={{
              p: 1,
              borderRadius: '12px',
              cursor: 'pointer',
              borderLeft: `4px solid ${SEVERITY_COLORS[item.severity]}`,
              bgcolor: alpha(SEVERITY_COLORS[item.severity], item.status === 'new' ? 0.08 : 0.03),
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{alertTitle(item, t)}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {`${item.deviceName} · ${dayjs(item.eventTime).format('HH:mm')}${item.userName ? ` · ${item.userName}` : ''}`}
                </Typography>
              </Box>
              <Stack alignItems="flex-end" spacing={0.25}>
                <Chip size="small" label={t(`alertStatus${capitalize(item.status)}`)} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} color={item.status === 'new' ? 'error' : 'warning'} variant="outlined" />
                <Typography variant="caption" color="text.secondary">{formatAgo(item.eventTime)}</Typography>
              </Stack>
            </Stack>
            {expanded === item.id && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }} onClick={(event) => event.stopPropagation()}>
                {!readonly && item.status === 'new' && <Button size="small" variant="contained" color="warning" onClick={() => act(item, 'ack')}>{t('alertTake')}</Button>}
                {!readonly && <Button size="small" variant="contained" color="success" onClick={() => act(item, 'resolved')}>{t('alertResolve')}</Button>}
                {!readonly && <Button size="small" onClick={() => act(item, 'dismissed')}>{t('alertDismiss')}</Button>}
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title={t('panelLocate')}><IconButton size="small" onClick={() => locate(item)}><MyLocationIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={t('videoOpen')}><IconButton size="small" onClick={() => openVideoWindow(item.deviceId)}><VideocamIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
            )}
          </Box>
        ))}
      </Stack>
    </FloatingPanel>
  );
};

export default AlertsPanel;
