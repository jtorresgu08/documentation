import { useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, LinearProgress, MenuItem, Select, Stack, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatAlarm, formatTime } from '../common/util/formatter';
import {
  MediaView, PERIODS, alarmFamily, fetchCameraEvents, mediaUrl,
} from './cameraEvents';

// Photos, videos and ADAS / DMS alarms of a unit stored in the platform, compact for the floating video window:
// a grid of events and, on click, the event's media in place with download
const EventsPanel = ({ device, channelLabel, refresh }) => {
  const t = useTranslation();
  const [period, setPeriod] = useState('day');
  const [timestamp, setTimestamp] = useState(Date.now());
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);

  useEffectAsync(async () => {
    setGroups(null);
    setGroups(await fetchCameraEvents(device.id, PERIODS[period]));
  }, [device.id, period, timestamp, refresh]);

  if (open) {
    return (
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <IconButton size="small" onClick={() => setOpen(null)} aria-label={t('sharedBack')}><ArrowBackIcon fontSize="small" /></IconButton>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>{open.alarm ? formatAlarm(open.alarm, t) : t('dashcamManualCapture')}</Typography>
            <Typography variant="caption" color="text.secondary">{formatTime(open.time, 'seconds')}</Typography>
          </Box>
        </Stack>
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {open.media.map((item) => (
            <Box key={item.file} sx={{ borderRadius: '12px', overflow: 'hidden', bgcolor: '#000' }}>
              <MediaView device={device} item={item} large />
              <Stack direction="row" alignItems="center" sx={{ px: 1, py: 0.5, bgcolor: 'background.paper' }}>
                <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {item.channel ? channelLabel(item.channel) : ''}
                </Typography>
                <Button size="small" startIcon={<DownloadIcon />} href={mediaUrl(device, item.file)} download>{t('dashcamDownload')}</Button>
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Select size="small" value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="day">{t('reportToday')}</MenuItem>
          <MenuItem value="week">{t('reportThisWeek')}</MenuItem>
          <MenuItem value="month">{t('reportThisMonth')}</MenuItem>
        </Select>
        <IconButton size="small" onClick={() => setTimestamp(Date.now())} aria-label={t('videoRefresh')}><RefreshIcon fontSize="small" /></IconButton>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, textAlign: 'right' }}>
          {groups ? `${groups.length} ${t('videoEvents').toLowerCase()}` : ''}
        </Typography>
      </Stack>
      {!groups && <LinearProgress sx={{ mb: 1 }} />}
      {groups && !groups.length && <Alert severity="info">{t('dashcamNoEvents')}</Alert>}
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {(groups || []).map((group) => {
          const family = alarmFamily(group.alarm);
          const cover = group.media.find((item) => item.type === 'image') || group.media[0];
          const images = group.media.filter((item) => item.type === 'image').length;
          const videos = group.media.filter((item) => item.type === 'video').length;
          return (
            <Box
              key={group.key}
              component="button"
              type="button"
              disabled={!group.media.length}
              onClick={() => setOpen(group)}
              sx={{
                p: 0, border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: '12px', overflow: 'hidden', textAlign: 'left',
                bgcolor: 'background.paper', cursor: group.media.length ? 'pointer' : 'default', font: 'inherit', color: 'inherit',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Box sx={{ aspectRatio: '16 / 9', bgcolor: '#111' }}>
                {cover && <MediaView device={device} item={cover} />}
              </Box>
              <Box sx={{ p: 1 }}>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5, minWidth: 0 }}>
                  <Chip
                    size="small"
                    color={group.alarm ? (family === 'DMS' ? 'warning' : 'error') : 'default'}
                    label={group.alarm ? formatAlarm(group.alarm, t) : t('dashcamManualCapture')}
                    sx={{ maxWidth: '100%', height: 22, fontSize: 11 }}
                  />
                  {family && <Typography variant="caption" color="text.secondary">{family}</Typography>}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                  <Typography variant="caption" sx={{ flexGrow: 1 }}>{formatTime(group.time, 'minutes')}</Typography>
                  {images > 0 && <Stack direction="row" alignItems="center" spacing={0.25}><ImageIcon sx={{ fontSize: 14 }} /><Typography variant="caption">{images}</Typography></Stack>}
                  {videos > 0 && <Stack direction="row" alignItems="center" spacing={0.25}><MovieIcon sx={{ fontSize: 14 }} /><Typography variant="caption">{videos}</Typography></Stack>}
                </Stack>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default EventsPanel;
