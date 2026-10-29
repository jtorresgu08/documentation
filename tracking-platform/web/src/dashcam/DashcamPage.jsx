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
import { useCatch, useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatAlarm, formatTime } from '../common/util/formatter';
import fetchOrThrow from '../common/util/fetchOrThrow';
import usePersistedState from '../common/util/usePersistedState';
import LivePlayer from './LivePlayer';
import PlaybackPanel from './PlaybackPanel';
import {
  MediaView, PERIODS, alarmFamily, fetchCameraEvents, mediaUrl,
} from './cameraEvents';
import { buildCameraCommand, getCameraConfig } from '../common/util/dashcam';
const DashcamPage = () => {
  const t = useTranslation();

  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const serverPlayUrl = useSelector((state) => state.session.server.attributes['dashcam.playUrl']);
  const serverJimiPlayUrl = useSelector((state) => state.session.server.attributes['dashcam.playUrlJimi']);
  const serverPlaybackUrl = useSelector((state) => state.session.server.attributes['dashcam.playbackUrl']);
  const serverJimiPlaybackUrl = useSelector((state) => state.session.server.attributes['dashcam.playbackUrlJimi']);

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
    setGroups(await fetchCameraEvents(device.id, PERIODS[period]));
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
        <Tab value="playback" label={t('playbackTitle')} />
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

      {device && tab === 'playback' && (
        <PlaybackPanel
          device={device}
          protocol={config.protocol}
          channels={channels}
          channelLabel={channelLabel}
          onMessage={setMessage}
          onMediaRequested={() => setTimeout(() => setTimestamp(Date.now()), 60000)}
          resolveUrl={(channel) => {
            const template = device.attributes?.['dashcam.playbackUrl']
              || (config.protocol === 'jimi' ? serverJimiPlaybackUrl : serverPlaybackUrl);
            return template ? template
              .replaceAll('{uniqueId}', device.uniqueId)
              .replaceAll('{deviceId}', device.id)
              .replaceAll('{channel}', channel) : resolveUrl(channel);
          }}
        />
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
