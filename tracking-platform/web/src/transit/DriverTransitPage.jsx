import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Chip, Container, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PlaceIcon from '@mui/icons-material/Place';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { STATE_COLORS, delayState } from './transitStatus';

const km = (meters) => (meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`);
const ADVICE_COLORS = {
  bunching: '#d9534f', gap: '#e67e22', offRoute: '#d9534f', late: '#e67e22', early: '#2563c9',
};

// Driver screen of a public transport unit, opened by its link without an account: whether it is on time, early or
// late at the next stop, the bus ahead and behind with distance and minutes, advice to keep the spacing and the next
// stops with their scheduled time. Refreshes every 10 seconds, keeps the screen on and vibrates when the state changes.
const DriverTransitPage = () => {
  const t = useTranslation();
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(null);
  const previous = useRef(null);

  useEffect(() => {
    let lock;
    const load = async () => {
      try {
        const response = await fetch(`/api/transit/driver/${token}`);
        if (!response.ok) throw new Error(response.status === 404 ? t('transitDriverInvalid') : response.statusText);
        const result = await response.json();
        const key = `${delayState(result.unit?.nextStopDelayMinutes)}|${(result.advice || []).join(',')}`;
        if (previous.current !== null && previous.current !== key && navigator.vibrate) navigator.vibrate([200, 100, 200]);
        previous.current = key;
        setData(result);
        setUpdated(new Date());
        setError(null);
      } catch (e) {
        setError(e.message);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    navigator.wakeLock?.request('screen').then((value) => { lock = value; }).catch(() => {});
    return () => {
      clearInterval(interval);
      lock?.release();
    };
  }, [token]);

  if (error && !data) {
    return <Container maxWidth="sm" sx={{ py: 4 }}><Alert severity="error">{error}</Alert></Container>;
  }
  if (!data) return <LinearProgress />;
  if (!data.line) {
    return <Container maxWidth="sm" sx={{ py: 4 }}><Alert severity="info">{t('transitDriverNoLine').replace('{0}', data.name)}</Alert></Container>;
  }

  const { line, unit, stops } = data;
  const color = line.color || '#2563c9';
  const state = delayState(unit.nextStopDelayMinutes);
  const stateColor = STATE_COLORS[state] || '#5d6d7e';
  const stateLabel = state ? t(`transitState${state.charAt(0).toUpperCase()}${state.slice(1)}`) : t('transitNoSchedule');
  const next = unit.nextStop;
  const upcoming = [];
  if (next !== undefined && next !== null) {
    for (let i = 0; i < Math.min(5, stops.length); i += 1) {
      const index = (next + i) % stops.length;
      if (!line.circular && data.summary.returnStop == null && index < next) break;
      upcoming.push({ ...stops[index], index });
    }
  }
  // scheduled time of the following stops of the same trip, from the scheduled arrival at the next stop
  const scheduledAt = (stop) => {
    if (!unit.nextStopScheduled) return null;
    const first = stops[next];
    if (stop.direction !== first.direction || stop.index < next) return null;
    return dayjs(unit.nextStopScheduled).add(stop.minutes - first.minutes, 'minute').format('HH:mm');
  };
  const adviceText = (key) => ({
    bunching: t('transitAdviceBunching').replace('{0}', unit.aheadName).replace('{1}', km(unit.aheadMeters)),
    gap: t('transitAdviceGap').replace('{0}', km(unit.aheadMeters)),
    offRoute: t('transitAdviceOffRoute'),
    late: t('transitAdviceLate').replace('{0}', unit.nextStopDelayMinutes),
    early: t('transitAdviceEarly').replace('{0}', Math.abs(unit.nextStopDelayMinutes)),
  }[key]);

  const neighbour = (icon, label, name, meters, minutes) => (
    <Paper variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 3 }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {icon}
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Stack>
      {name ? (
        <>
          <Typography variant="subtitle1" fontWeight={700} noWrap>{name}</Typography>
          <Typography variant="h6" fontWeight={700}>{km(meters)}</Typography>
          <Typography variant="body2" color="text.secondary">{`${minutes} min`}</Typography>
        </>
      ) : <Typography variant="body2" color="text.secondary">—</Typography>}
    </Paper>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ bgcolor: color, color: '#fff', px: 2, py: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          {line.code && <Chip size="small" label={line.code} sx={{ bgcolor: '#fff', color, fontWeight: 800 }} />}
          <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>{line.name}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, opacity: 0.95 }}>
          <DirectionsBusIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>{data.name}</Typography>
          {unit.direction && <Typography variant="body2">{`· ${unit.direction === 'return' ? `← ${t('transitReturn')}` : `→ ${t('transitOutbound')}`}`}</Typography>}
          {unit.lap > 0 && <Typography variant="body2">{`· ${t('transitLap')} ${unit.lap}`}</Typography>}
        </Stack>
      </Box>
      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Stack spacing={1.5}>
          {error && <Alert severity="warning">{error}</Alert>}
          <Paper sx={{
            p: 2, borderRadius: 4, bgcolor: alpha(stateColor, 0.1), border: `2px solid ${stateColor}`, textAlign: 'center',
          }}
          >
            <Typography variant="h4" fontWeight={800} sx={{ color: stateColor, letterSpacing: 0.5 }}>{stateLabel.toUpperCase()}</Typography>
            {state && <Typography variant="h5" fontWeight={700} sx={{ color: stateColor }}>{`${unit.nextStopDelayMinutes > 0 ? '+' : ''}${unit.nextStopDelayMinutes} min`}</Typography>}
          </Paper>
          {unit.nextStopName && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
              <Typography variant="caption" color="text.secondary">{t('transitNextStop')}</Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <PlaceIcon sx={{ color }} />
                <Typography variant="h5" fontWeight={800}>{unit.nextStopName}</Typography>
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('transitDistance')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{km(unit.nextStopMeters)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('transitEtaLong')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{unit.nextStopEta ? dayjs(unit.nextStopEta).format('HH:mm') : '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('transitScheduledLong')}</Typography>
                  <Typography variant="h6" fontWeight={700}>{unit.nextStopScheduled ? dayjs(unit.nextStopScheduled).format('HH:mm') : '—'}</Typography>
                </Box>
              </Stack>
            </Paper>
          )}
          {(data.advice || []).map((key) => (
            <Alert key={key} icon={<WarningAmberIcon />} severity="warning" sx={{ borderRadius: 3, fontWeight: 600, fontSize: 15, bgcolor: alpha(ADVICE_COLORS[key], 0.12), color: ADVICE_COLORS[key], '& .MuiAlert-icon': { color: ADVICE_COLORS[key] } }}>
              {adviceText(key)}
            </Alert>
          ))}
          <Stack direction="row" spacing={1.5}>
            {neighbour(<ArrowUpwardIcon fontSize="small" color="action" />, t('transitAhead'), unit.aheadName, unit.aheadMeters, unit.aheadMinutes)}
            {neighbour(<ArrowDownwardIcon fontSize="small" color="action" />, t('transitBehind'), unit.behindName, unit.behindMeters, unit.behindMinutes)}
          </Stack>
          {upcoming.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>{t('transitUpcomingStops')}</Typography>
              {upcoming.map((stop, position) => (
                <Stack key={stop.index} direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.75 }}>
                  <Box sx={{
                    width: 14, height: 14, borderRadius: '50%', border: `3px solid ${color}`, bgcolor: position === 0 ? color : '#fff', flexShrink: 0,
                  }}
                  />
                  <Typography variant="body1" fontWeight={position === 0 ? 700 : 500} sx={{ flexGrow: 1 }}>{stop.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{scheduledAt(stop) || ''}</Typography>
                </Stack>
              ))}
            </Paper>
          )}
          <Typography variant="caption" color="text.secondary" align="center">
            {`${t('transitUpdated')} ${updated ? dayjs(updated).format('HH:mm:ss') : ''}`}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
};

export default DriverTransitPage;
