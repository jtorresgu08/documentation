import { useEffect, useRef } from 'react';
import {
  Box, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import dayjs from 'dayjs';

export const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
};

export const formatKm = (meters) => (meters >= 1000
  ? `${(meters / 1000).toLocaleString('es-PE', { maximumFractionDigits: meters >= 10000 ? 0 : 1 })} km`
  : `${Math.round(meters)} m`);

export const formatMinutes = (minutes) => {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${Math.round(minutes % 60)} min`;
};

export const formatAgo = (time) => {
  if (!time) return '—';
  const minutes = dayjs().diff(dayjs(time), 'minute');
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
};

// the alert API works on the units it is given: all the units the user can see
export const withDevices = (query, devices) => {
  Object.keys(devices).forEach((id) => query.append('deviceId', id));
  return query;
};

export const speedKmh = (position) => (position ? Math.round(position.speed * 1.852) : 0);

// Calls fn now and every interval ms while mounted, re-running when deps change
export const usePolling = (fn, interval, deps = []) => {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let active = true;
    const run = () => active && saved.current();
    run();
    const timer = setInterval(run, interval);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, deps);
};

export const Metric = ({
  label, value, color, onClick, active, caption,
}) => (
  <Box
    onClick={onClick}
    sx={{
      p: 1,
      borderRadius: '12px',
      bgcolor: (theme) => alpha(color || theme.palette.primary.main, active ? 0.2 : 0.08),
      outline: active ? `2px solid ${color}` : 'none',
      cursor: onClick ? 'pointer' : 'default',
      minWidth: 0,
    }}
  >
    <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
    <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }} noWrap>{value}</Typography>
    {caption && <Typography variant="caption" color="text.secondary" noWrap component="div">{caption}</Typography>}
  </Box>
);

export const Empty = ({ children }) => (
  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>{children}</Typography>
);

export const Section = ({ title, action, children }) => (
  <Box sx={{ mt: 1.25 }}>
    <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ flexGrow: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

export const Row = ({
  primary, secondary, right, color, onClick, selected,
}) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={1}
    onClick={onClick}
    sx={{
      px: 1,
      py: 0.75,
      borderRadius: '10px',
      cursor: onClick ? 'pointer' : 'default',
      bgcolor: (theme) => (selected ? alpha(theme.palette.primary.main, 0.1) : 'transparent'),
      '&:hover': onClick ? { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06) } : {},
    }}
  >
    {color && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />}
    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
      <Typography variant="body2" fontWeight={600} noWrap>{primary}</Typography>
      {secondary && <Typography variant="caption" color="text.secondary" noWrap component="div">{secondary}</Typography>}
    </Box>
    {right}
  </Stack>
);
