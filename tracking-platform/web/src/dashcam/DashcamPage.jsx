import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, CardContent, Chip, Container, Dialog, DialogContent,
  DialogTitle, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tab, Tabs, TextField,
  Typography,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';
import MovieIcon from '@mui/icons-material/Movie';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import dayjs from 'dayjs';
import { useCatch, useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatAlarm, formatTime } from '../common/util/formatter';
import fetchOrThrow from '../common/util/fetchOrThrow';
import usePersistedState from '../common/util/usePersistedState';
import LivePlayer from './LivePlayer';
import { buildCameraCommand, getCameraConfig } from '../common/util/dashcam';
const PERIODS = { day: 1, week: 7, month: 30 };
const DMS_ALARMS = ['fatigueDriving', 'phoneCall', 'smoking', 'distraction', 'driverAbnormal'];
const ADAS_ALARMS = ['forwardCollision', 'laneDeparture', 'vehicleDistance', 'pedestrianCollision', 'frequentLaneChange',
  'roadSignOverLimit', 'obstacle'];

const alarmFamily = (alarm) => {
  if (DMS_ALARMS.includes(alarm)) {
    return 'DMS';
  }
  return ADAS_ALARMS.includes(alarm) ? 'ADAS' : null;
};

const mediaUrl = (device, file) => `/api/media/${device.uniqueId}/${file}`;

const MediaView = ({ device, item, large }) => (item.type === 'video' ? (
  <video
    src={mediaUrl(device, item.file)}
    controls={large}
    muted
    preload="metadata"
    style={{
      width: '100%', height: large ? 'auto' : '100%', objectFit: 'cover', background: '#000', display: 'block',
    }}
  />
) : (
  <img
    src={mediaUrl(device, item.file)}
    alt=""
    loading="lazy"
    style={{
      width: '100%', height: large ? 'auto' : '100%', objectFit: 'cover', display: 'block',
    }}
  />
));

// Groups media events with the alarm that produced them: same alarm number (JT/T 808) or file listed in the
// alarm (Jimi GT06 cameras report the event file names in the alarm and upload them over HTTP afterwards)
const groupEvents = (events, positions) => {
  const groups = new Map();
  const jimiFiles = new Map();
  events.filter((event) => event.type === 'alarm').forEach((event) => {
    const files = positions[event.positionId]?.attributes.eventFiles;
    if (files) {
      files.split(/[,;\s]+/).filter(Boolean).forEach((name) => jimiFiles.set(name, `jimi-${event.id}`));
    }
  });
  events.forEach((event) => {
    const position = positions[event.positionId] || { attributes: {} };
    const key = position.attributes.alarmNumber
      || jimiFiles.get(position.attributes.eventFile)
      || (event.type === 'alarm' && position.attributes.eventFiles ? `jimi-${event.id}` : null)
      || `media-${event.id}`;
    const group = groups.get(key) || {
      key, time: event.eventTime, alarm: null, media: [], position,
    };
    if (event.type === 'alarm') {
      group.alarm = event.attributes.alarm;
      group.time = event.eventTime;
      group.position = position;
    } else {
      group.media.push({
        type: event.attributes.media, file: event.attributes.file, channel: positions[event.positionId]?.attributes.channel,
      });
      if (!group.alarm && position.attributes.mediaAlarm) {
        group.alarm = position.attributes.mediaAlarm;
      }
    }
    groups.set(key, group);
  });
  return [...groups.values()]
    .filter((group) => group.media.length || group.position.attributes.alarmAttachments
      || group.position.attributes.eventFiles)
    .sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
};

const DashcamPage = () => {
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const serverPlayUrl = useSelector((state) => state.session.server.attributes['dashcam.playUrl']);
  const serverJimiPlayUrl = useSelector((state) => state.session.server.attributes['dashcam.playUrlJimi']);

  const [storedDeviceId, setDeviceId] = usePersistedState('dashcamDevice', null);
  const deviceId = storedDeviceId ?? selectedId;
  const [tab, setTab] = useState('events');
  const [period, setPeriod] = useState('day');
  const [groups, setGroups] = useState(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);
  const [photoChannel, setPhotoChannel] = useState(1);

  const device = devices[deviceId];
  const config = getCameraConfig(device, positions[deviceId]);
  const playUrl = config.playUrl || (config.protocol === 'jimi' && serverJimiPlayUrl) || serverPlayUrl;
  const channels = Array.from({ length: config.channels }, (_, index) => index + 1);
  const channelLabel = (channel) => config.channelName(channel) || `${t('dashcamChannel')} ${channel}`;

  // only devices configured as camera, unless none is configured yet
  const deviceOptions = useMemo(() => {
    const all = Object.values(devices).sort((a, b) => a.name.localeCompare(b.name));
    const cameras = all.filter((item) => item.attributes?.['dashcam.kind']);
    return cameras.length ? cameras : all;
  }, [devices]);

  useEffectAsync(async () => {
    if (!device) {
      setGroups(null);
      return;
    }
    setGroups(null);
    const query = new URLSearchParams({
      deviceId: device.id,
      from: dayjs().subtract(PERIODS[period], 'day').toISOString(),
      to: dayjs().add(1, 'minute').toISOString(),
    });
    query.append('type', 'media');
    query.append('type', 'alarm');
    const response = await fetchOrThrow(`/api/reports/events?${query}`, { headers: { Accept: 'application/json' } });
    const events = await response.json();
    const positionIds = [...new Set(events.map((event) => event.positionId).filter(Boolean))];
    const positions = {};
    for (let i = 0; i < positionIds.length; i += 100) {
      const ids = new URLSearchParams();
      positionIds.slice(i, i + 100).forEach((id) => ids.append('id', id));
      const items = await (await fetchOrThrow(`/api/positions?${ids}`)).json();
      items.forEach((position) => { positions[position.id] = position; });
    }
    setGroups(groupEvents(events, positions));
  }, [device?.id, period, timestamp]);

  const sendCommand = useCatch(async (action, channel) => {
    await fetchOrThrow('/api/commands/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildCameraCommand(device.id, config, action, channel)),
    });
  });

  const takePhoto = async () => {
    await sendCommand('photo', Math.min(photoChannel, config.channels));
    setMessage(t('dashcamPhotoRequested'));
    setTimeout(() => setTimestamp(Date.now()), 8000);
  };

  const resolveUrl = (channel) => (playUrl && device ? playUrl
    .replaceAll('{uniqueId}', device.uniqueId)
    .replaceAll('{deviceId}', device.id)
    .replaceAll('{channel}', channel)
    .replaceAll('{camera}', channel === 1 ? 'OUT' : 'IN') : null);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{t('navCameras')}</Typography>
        <Autocomplete
          sx={{ minWidth: 280 }}
          size="small"
          options={deviceOptions}
          getOptionLabel={(option) => option.name}
          value={device || null}
          onChange={(_, value) => setDeviceId(value?.id || null)}
          renderInput={(params) => <TextField {...params} label={t('dashcamSelectDevice')} />}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label={t('dashcamChannel')}
            value={Math.min(photoChannel, config.channels)}
            onChange={(event) => setPhotoChannel(Number(event.target.value))}
            disabled={!device}
            sx={{ minWidth: 120 }}
          >
            {channels.map((channel) => <MenuItem key={channel} value={channel}>{channelLabel(channel)}</MenuItem>)}
          </TextField>
          <Button variant="contained" startIcon={<PhotoCameraIcon />} disabled={!device} onClick={takePhoto}>
            {t('dashcamTakePhoto')}
          </Button>
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="events" label={t('dashcamEvents')} />
        <Tab value="live" label={t('dashcamLive')} />
      </Tabs>

      {!device && <Alert severity="info">{t('dashcamSelectDevice')}</Alert>}

      {device && tab === 'live' && (
        <>
          {!playUrl && <Alert severity="warning" sx={{ mb: 2 }}>{t('dashcamNoVideoServer')}</Alert>}
          <Grid container spacing={2}>
            {channels.map((channel) => (
              <Grid key={channel} size={{ xs: 12, sm: 6, lg: channels.length > 4 ? 3 : 12 / Math.min(channels.length, 4) }}>
                <LivePlayer
                  channel={channel}
                  label={channelLabel(channel)}
                  url={resolveUrl(channel)}
                  onStart={(value) => sendCommand('live', value)}
                  onStop={(value) => sendCommand('liveStop', value)}
                />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {device && tab === 'events' && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('reportPeriod')}</InputLabel>
              <Select label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)}>
                <MenuItem value="day">{t('reportToday')}</MenuItem>
                <MenuItem value="week">{t('reportThisWeek')}</MenuItem>
                <MenuItem value="month">{t('reportThisMonth')}</MenuItem>
              </Select>
            </FormControl>
            <IconButton onClick={() => setTimestamp(Date.now())}><RefreshIcon /></IconButton>
          </Stack>
          {groups && !groups.length && <Alert severity="info">{t('dashcamNoEvents')}</Alert>}
          <Grid container spacing={2}>
            {(groups || []).map((group) => {
              const family = alarmFamily(group.alarm);
              const cover = group.media.find((item) => item.type === 'image') || group.media[0];
              return (
                <Grid key={group.key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                    <CardActionArea onClick={() => setOpen(group)} disabled={!group.media.length}>
                      <Box sx={{ aspectRatio: '16 / 9', bgcolor: '#111' }}>
                        {cover && <MediaView device={device} item={cover} />}
                      </Box>
                      <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Chip
                            size="small"
                            color={group.alarm ? (family === 'DMS' ? 'warning' : 'error') : 'default'}
                            label={group.alarm ? formatAlarm(group.alarm, t) : t('dashcamManualCapture')}
                          />
                          {family && <Chip size="small" variant="outlined" label={family} />}
                        </Stack>
                        <Typography variant="body2">{formatTime(group.time, 'seconds')}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, color: 'text.secondary' }} alignItems="center">
                          {group.media.filter((item) => item.type === 'image').length > 0 && (
                            <Stack direction="row" alignItems="center" spacing={0.25}>
                              <ImageIcon fontSize="small" />
                              <Typography variant="caption">{group.media.filter((item) => item.type === 'image').length}</Typography>
                            </Stack>
                          )}
                          {group.media.filter((item) => item.type === 'video').length > 0 && (
                            <Stack direction="row" alignItems="center" spacing={0.25}>
                              <MovieIcon fontSize="small" />
                              <Typography variant="caption">{group.media.filter((item) => item.type === 'video').length}</Typography>
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}

      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} maxWidth="md" fullWidth>
        {open && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ flexGrow: 1 }}>
                {open.alarm ? formatAlarm(open.alarm, t) : t('dashcamManualCapture')}
                <Typography variant="body2" color="text.secondary">
                  {`${device?.name} · ${formatTime(open.time, 'seconds')}`}
                </Typography>
              </Box>
              <IconButton onClick={() => setOpen(null)}><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2}>
                {open.media.map((item) => (
                  <Box key={item.file}>
                    <MediaView device={device} item={item} large />
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {item.channel ? channelLabel(item.channel) : ''}
                      </Typography>
                      <Button size="small" startIcon={<DownloadIcon />} href={mediaUrl(device, item.file)} download>
                        {t('dashcamDownload')}
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={5000}
        onClose={() => setMessage(null)}
        message={message}
      />
    </Container>
  );
};

export default DashcamPage;
