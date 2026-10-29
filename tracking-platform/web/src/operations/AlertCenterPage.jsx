import {
 useEffect, useMemo, useRef, useState 
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Collapse, Container, FormControlLabel, Grid, IconButton,
  LinearProgress, MenuItem, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import ReportIcon from '@mui/icons-material/Report';
import TimerIcon from '@mui/icons-material/Timer';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import InboxIcon from '@mui/icons-material/Inbox';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import InsightsIcon from '@mui/icons-material/Insights';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlaceIcon from '@mui/icons-material/Place';
import HistoryIcon from '@mui/icons-material/History';
import VideocamIcon from '@mui/icons-material/Videocam';
import CloseIcon from '@mui/icons-material/Close';
import {
  Bar, BarChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useRestriction } from '../common/util/permissions';
import { formatPeriod } from '../main/DeviceRow';
import { devicesActions } from '../store';
import { openVideoWindow } from '../common/util/videoWindows';
import usePersistedState from '../common/util/usePersistedState';
import {
  SEVERITIES, SEVERITY_COLORS, STATUS_COLORS, alertTitle, capitalize, playAlertSound,
} from './alertUtils';

const PERIODS = {
  today: () => dayjs().startOf('day'),
  last24h: () => dayjs().subtract(24, 'hour'),
  last7d: () => dayjs().subtract(7, 'day'),
  last30d: () => dayjs().subtract(30, 'day'),
};
const VIEWS = {
  open: ['new', 'ack'], new: ['new'], ack: ['ack'], resolved: ['resolved', 'dismissed'], all: [],
};
const REFRESH = 20000;

// Alert center: the events that need attention in one place, by priority, with their handling (take, resolve,
// false alarm, notes and history), response times and quick access to the unit, its history and cameras
const AlertCenterPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const desktop = useMediaQuery(theme.breakpoints.up('lg'));
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => state.devices.items);
  const liveEvents = useSelector((state) => state.events.items);

  const [period, setPeriod] = usePersistedState('alertsPeriod', 'last24h');
  const [view, setView] = useState('open');
  const [severities, setSeverities] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [routine, setRoutine] = useState(false);
  const [sound, setSound] = usePersistedState('alertsSound', true);
  const [analytics, setAnalytics] = usePersistedState('alertsAnalytics', true);
  const [items, setItems] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [note, setNote] = useState('');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const known = useRef(null);

  const query = () => {
    const params = new URLSearchParams({ from: PERIODS[period]().toISOString(), to: dayjs().add(1, 'minute').toISOString() });
    (units.length ? units : Object.values(devices)).forEach((device) => params.append('deviceId', device.id));
    return params;
  };

  const load = async () => {
    if (!Object.keys(devices).length) {
      return;
    }
    try {
      const params = query();
      const list = new URLSearchParams(params);
      if (routine) {
        list.append('all', 'true');
      }
      const [listResponse, summaryResponse] = await Promise.all([
        fetchOrThrow(`/api/alerts?${list}`),
        fetchOrThrow(`/api/alerts/summary?${params}`),
      ]);
      const data = await listResponse.json();
      const fresh = data.filter((item) => item.severity === 'critical' && item.status === 'new');
      if (known.current && sound && fresh.some((item) => !known.current.has(item.id))) {
        playAlertSound();
      }
      known.current = new Set(fresh.map((item) => item.id));
      setItems(data);
      setSummary(await summaryResponse.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    setItems(null);
    load();
    const interval = setInterval(load, REFRESH);
    return () => clearInterval(interval);
  }, [period, units, routine, Object.keys(devices).length]);

  useEffect(() => {
    if (liveEvents.length) {
      load();
    }
  }, [liveEvents.length]);

  const visible = useMemo(() => (items || []).filter((item) => {
    const statuses = VIEWS[view];
    if (statuses.length && !statuses.includes(item.status)) return false;
    if (severities.length && !severities.includes(item.severity)) return false;
    if (search) {
      const text = `${item.deviceName} ${alertTitle(item, t)} ${item.note || ''}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [items, view, severities, search]);

  const current = selected && (items || []).find((item) => item.id === selected);

  useEffect(() => {
    setNote('');
    setPosition(null);
    if (current?.positionId) {
      fetchOrThrow(`/api/alerts/position/${current.id}`).then((response) => response.json()).then(setPosition).catch(() => {});
    }
  }, [selected]);

  const update = async (ids, status) => {
    try {
      if (ids.length === 1) {
        await fetchOrThrow(`/api/alerts/${ids[0]}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }),
        });
      } else {
        await fetchOrThrow('/api/alerts/batch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventIds: ids, status, note }),
        });
      }
      setNote('');
      setChecked([]);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const viewCounts = useMemo(() => Object.fromEntries(Object.entries(VIEWS).map(([key, statuses]) => [
    key, (items || []).filter((item) => !statuses.length || statuses.includes(item.status)).length,
  ])), [items]);

  const ago = (time) => `${formatPeriod(Date.now() - dayjs(time).valueOf())}`;

  const Kpi = ({ icon, color, label, value, caption }) => (
    <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.12), color }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>{value}</Typography>
          {caption && <Typography variant="caption" color="text.secondary" noWrap component="div">{caption}</Typography>}
        </Box>
      </Stack>
    </Card>
  );

  const detail = current && (
    <Card variant="outlined" sx={{ p: 2, position: desktop ? 'sticky' : 'static', top: 16 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ width: 6, alignSelf: 'stretch', borderRadius: 3, bgcolor: SEVERITY_COLORS[current.severity] }} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>{alertTitle(current, t)}</Typography>
          <Typography variant="body2" color="text.secondary">{`${current.deviceName} · ${dayjs(current.eventTime).format('DD/MM/YYYY HH:mm:ss')}`}</Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={t(`alertSeverity${capitalize(current.severity)}`)} sx={{ bgcolor: alpha(SEVERITY_COLORS[current.severity], 0.12), color: SEVERITY_COLORS[current.severity] }} />
            <Chip size="small" label={t(`alertStatus${capitalize(current.status)}`)} sx={{ bgcolor: alpha(STATUS_COLORS[current.status], 0.12), color: STATUS_COLORS[current.status] }} />
            {current.responseMinutes != null && <Chip size="small" variant="outlined" label={`${t('alertResponse')}: ${Math.round(current.responseMinutes)} min`} />}
          </Stack>
        </Box>
        <IconButton size="small" onClick={() => setSelected(null)} aria-label={t('sharedHide')}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      {position && (
        <Stack spacing={0.5} sx={{ mt: 2, p: 1.5, borderRadius: '12px', bgcolor: 'action.hover' }}>
          <Typography variant="body2">{`${t('positionSpeed')}: ${Math.round(position.speed * 1.852)} km/h`}</Typography>
          {position.address && <Typography variant="body2">{position.address}</Typography>}
          <Typography variant="caption" color="text.secondary">{`${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`}</Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
        <Button size="small" startIcon={<PlaceIcon />} onClick={() => { dispatch(devicesActions.selectId(current.deviceId)); navigate('/'); }}>{t('alertViewOnMap')}</Button>
        <Button
          size="small"
          startIcon={<HistoryIcon />}
          onClick={() => navigate(`/replay?deviceId=${current.deviceId}&from=${encodeURIComponent(dayjs(current.eventTime).subtract(30, 'minute').toISOString())}&to=${encodeURIComponent(dayjs(current.eventTime).add(30, 'minute').toISOString())}`)}
        >
          {t('navHistory')}
        </Button>
        {devices[current.deviceId]?.attributes?.['dashcam.kind'] && (
          <Button size="small" startIcon={<VideocamIcon />} onClick={() => openVideoWindow(current.deviceId)}>{t('videoTitle')}</Button>
        )}
      </Stack>

      {!readonly && (
        <>
          <TextField
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            label={t('alertNote')}
            placeholder={t('alertNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            {current.status !== 'ack' && <Button variant="contained" color="warning" onClick={() => update([current.id], 'ack')}>{t('alertTake')}</Button>}
            {current.status !== 'resolved' && <Button variant="contained" color="success" onClick={() => update([current.id], 'resolved')}>{t('alertResolve')}</Button>}
            {current.status !== 'dismissed' && <Button variant="outlined" color="inherit" onClick={() => update([current.id], 'dismissed')}>{t('alertDismiss')}</Button>}
            {current.status !== 'new' && <Button onClick={() => update([current.id], 'new')}>{t('alertReopen')}</Button>}
          </Stack>
        </>
      )}

      {current.note && (
        <Alert severity="info" icon={false} sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" component="div">{t('alertLastNote')}</Typography>
          {current.note}
        </Alert>
      )}
      {Array.isArray(current.history) && current.history.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">{t('alertHistory')}</Typography>
          {[...current.history].reverse().map((entry) => (
            <Stack key={entry.time} direction="row" spacing={1} sx={{ py: 0.75, borderTop: `1px solid ${theme.palette.divider}` }}>
              <Box sx={{ width: 8, height: 8, mt: 0.75, borderRadius: '50%', bgcolor: STATUS_COLORS[entry.status], flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>{`${t(`alertStatus${capitalize(entry.status)}`)} · ${entry.userName || ''}`}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">{dayjs(entry.time).format('DD/MM HH:mm')}</Typography>
                {entry.note && <Typography variant="body2">{entry.note}</Typography>}
              </Box>
            </Stack>
          ))}
        </Box>
      )}
    </Card>
  );

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('alertCenterTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('alertCenterSubtitle')}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 150 }}>
            {Object.keys(PERIODS).map((key) => <MenuItem key={key} value={key}>{t(`alertPeriod${capitalize(key)}`)}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            limitTags={1}
            sx={{ minWidth: 220 }}
            options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
            getOptionLabel={(option) => option.name}
            value={units}
            onChange={(_, value) => setUnits(value)}
            renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={units.length ? '' : t('drivingAllUnits')} />}
          />
          <Tooltip title={sound ? t('alertSoundOn') : t('alertSoundOff')}>
            <IconButton onClick={() => setSound(!sound)} aria-label={t('alertSoundOn')}>{sound ? <VolumeUpIcon /> : <VolumeOffIcon />}</IconButton>
          </Tooltip>
          <Tooltip title={t('videoRefresh')}><IconButton onClick={load} aria-label={t('videoRefresh')}><RefreshIcon /></IconButton></Tooltip>
          <Tooltip title={t('alertAnalytics')}><IconButton onClick={() => setAnalytics(!analytics)} color={analytics ? 'primary' : 'default'} aria-label={t('alertAnalytics')}><InsightsIcon /></IconButton></Tooltip>
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {summary && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, md: 2.4 }}><Kpi icon={<InboxIcon />} color={theme.palette.primary.main} label={t('alertOpen')} value={summary.open} caption={`${summary.total} ${t('alertTotal')}`} /></Grid>
          <Grid size={{ xs: 6, md: 2.4 }}><Kpi icon={<ReportIcon />} color={SEVERITY_COLORS.critical} label={t('alertOpenCritical')} value={summary.openCritical} caption={`${summary.bySeverity.critical} ${t('alertInPeriod')}`} /></Grid>
          <Grid size={{ xs: 6, md: 2.4 }}><Kpi icon={<TimerIcon />} color="#6a1b9a" label={t('alertAvgResponse')} value={summary.avgResponseMinutes != null ? `${Math.round(summary.avgResponseMinutes)} min` : '—'} /></Grid>
          <Grid size={{ xs: 6, md: 2.4 }}><Kpi icon={<TaskAltIcon />} color={theme.palette.success.main} label={t('alertHandled')} value={summary.handledPercent != null ? `${Math.round(summary.handledPercent)} %` : '—'} caption={`${summary.byStatus.resolved} ${t('alertStatusResolved').toLowerCase()}`} /></Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
              <Typography variant="caption" color="text.secondary">{t('alertBySeverity')}</Typography>
              <Stack direction="row" sx={{ height: 10, borderRadius: 5, overflow: 'hidden', mt: 1, bgcolor: 'action.hover' }}>
                {SEVERITIES.map((severity) => (
                  <Box key={severity} sx={{ width: `${summary.total ? (summary.bySeverity[severity] / summary.total) * 100 : 0}%`, bgcolor: SEVERITY_COLORS[severity] }} />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                {SEVERITIES.map((severity) => (
                  <Typography key={severity} variant="caption"><b style={{ color: SEVERITY_COLORS[severity] }}>{summary.bySeverity[severity]}</b>{` ${t(`alertSeverity${capitalize(severity)}`)}`}</Typography>
                ))}
              </Stack>
            </Card>
          </Grid>
        </Grid>
      )}

      <Collapse in={analytics && Boolean(summary?.total)}>
        {summary && (
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined" sx={{ p: 1.75 }}>
                <Typography variant="subtitle2" fontWeight={700}>{t('alertByHour')}</Typography>
                <Box sx={{ height: 120 }}>
                  <ResponsiveContainer>
                    <BarChart data={Object.entries(summary.byHour).map(([hour, count]) => ({ hour: `${hour}h`, count }))}>
                      <XAxis dataKey="hour" fontSize={10} interval={2} stroke={theme.palette.text.secondary} />
                      <ChartTooltip />
                      <Bar dataKey="count" name={t('alertTotal')} fill={theme.palette.primary.main} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('alertTopTypes')}</Typography>
                {summary.byType.slice(0, 5).map((entry) => (
                  <Stack key={entry.key} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                    <Typography variant="body2" noWrap>{alertTitle({ type: entry.key.startsWith('alarm:') ? 'alarm' : entry.key, attributes: { alarm: entry.key.replace('alarm:', '') } }, t)}</Typography>
                    <Typography variant="body2" fontWeight={700}>{entry.count}</Typography>
                  </Stack>
                ))}
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined" sx={{ p: 1.75, height: '100%' }}>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('alertTopUnits')}</Typography>
                {summary.byDevice.map((entry) => (
                  <Stack key={entry.key} direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
                    <Typography variant="body2" noWrap>{entry.key}</Typography>
                    <Typography variant="body2" fontWeight={700}>{entry.count}</Typography>
                  </Stack>
                ))}
              </Card>
            </Grid>
          </Grid>
        )}
      </Collapse>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: current ? 7.5 : 12 }}>
          <Card variant="outlined">
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1} sx={{ px: 1.5, pt: 0.5 }}>
              <Tabs value={view} onChange={(_, value) => setView(value)} variant="scrollable" sx={{ flexGrow: 1 }}>
                {Object.keys(VIEWS).map((key) => <Tab key={key} value={key} label={`${t(`alertView${capitalize(key)}`)} (${viewCounts[key] || 0})`} />)}
              </Tabs>
              <TextField size="small" placeholder={t('sharedSearch')} value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 180 }} />
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 1.5, py: 1 }} flexWrap="wrap" useFlexGap>
              {SEVERITIES.map((severity) => {
                const on = severities.includes(severity);
                return (
                  <Chip
                    key={severity}
                    size="small"
                    label={t(`alertSeverity${capitalize(severity)}`)}
                    onClick={() => setSeverities(on ? severities.filter((value) => value !== severity) : [...severities, severity])}
                    sx={{ bgcolor: on ? SEVERITY_COLORS[severity] : alpha(SEVERITY_COLORS[severity], 0.1), color: on ? '#fff' : SEVERITY_COLORS[severity] }}
                  />
                );
              })}
              <FormControlLabel sx={{ ml: 1 }} control={<Switch size="small" checked={routine} onChange={(event) => setRoutine(event.target.checked)} />} label={<Typography variant="body2">{t('alertIncludeRoutine')}</Typography>} />
              <Box sx={{ flexGrow: 1 }} />
              {!readonly && checked.length > 0 && (
                <Stack direction="row" spacing={1}>
                  <Typography variant="body2" sx={{ alignSelf: 'center' }}>{`${checked.length} ${t('alertSelected')}`}</Typography>
                  <Button size="small" variant="contained" color="warning" onClick={() => update(checked, 'ack')}>{t('alertTake')}</Button>
                  <Button size="small" variant="contained" color="success" onClick={() => update(checked, 'resolved')}>{t('alertResolve')}</Button>
                </Stack>
              )}
            </Stack>
            {!items && <LinearProgress />}
            <Box>
              {visible.slice(0, 300).map((item) => (
                <Stack
                  key={item.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.25}
                  onClick={() => setSelected(item.id)}
                  sx={{
                    px: 1.5, py: 1, cursor: 'pointer', borderTop: `1px solid ${theme.palette.divider}`,
                    bgcolor: selected === item.id ? alpha(theme.palette.primary.main, 0.08) : item.status === 'new' && item.severity === 'critical' ? alpha(SEVERITY_COLORS.critical, 0.05) : 'transparent',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                  }}
                >
                  {!readonly && (
                    <Checkbox
                      size="small"
                      checked={checked.includes(item.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setChecked(event.target.checked ? [...checked, item.id] : checked.filter((id) => id !== item.id))}
                      inputProps={{ 'aria-label': alertTitle(item, t) }}
                    />
                  )}
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SEVERITY_COLORS[item.severity], flexShrink: 0, boxShadow: item.status === 'new' && item.severity === 'critical' ? `0 0 0 4px ${alpha(SEVERITY_COLORS.critical, 0.2)}` : 'none' }} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={item.status === 'new' ? 700 : 500} noWrap>{alertTitle(item, t)}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {`${item.deviceName}${item.userName ? ` · ${item.userName}` : ''}${item.note ? ` · ${item.note}` : ''}`}
                    </Typography>
                  </Box>
                  <Chip size="small" label={t(`alertStatus${capitalize(item.status)}`)} sx={{ height: 22, fontSize: 11, bgcolor: alpha(STATUS_COLORS[item.status], 0.12), color: STATUS_COLORS[item.status] }} />
                  <Tooltip title={dayjs(item.eventTime).format('DD/MM/YYYY HH:mm:ss')}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 72, textAlign: 'right', flexShrink: 0 }}>{ago(item.eventTime)}</Typography>
                  </Tooltip>
                </Stack>
              ))}
              {items && !visible.length && (
                <Stack alignItems="center" spacing={1} sx={{ py: 6, color: 'text.secondary' }}>
                  <TaskAltIcon sx={{ fontSize: 40 }} color="success" />
                  <Typography variant="body2">{t('alertNone')}</Typography>
                </Stack>
              )}
            </Box>
          </Card>
        </Grid>
        {current && <Grid size={{ xs: 12, lg: 4.5 }}>{detail}</Grid>}
      </Grid>
      {!Object.keys(devices).length && <Alert severity="info" icon={<NotificationsActiveIcon />}>{t('alertNone')}</Alert>}
    </Container>
  );
};

export default AlertCenterPage;
