import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, Grid, IconButton, LinearProgress, MenuItem, Slider, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import DownloadIcon from '@mui/icons-material/Download';
import dayjs from 'dayjs';
import mpegts from 'mpegts.js';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';

const SPEEDS = [1, 2, 4, 8];
const DAY = 24 * 3600 * 1000;
const MINUTE = 60000;
const JIMI_BATCH = 8; // REPLAYLIST streams at most eight one-minute files

// Recordings stored on a JT/T 1078 MDVR or a Jimi GT06 dashcam: search by day and channel, 24 h timeline per channel
// and on-demand playback streamed by the device to the media server. JT/T 1078 adds pause, speed, seek and stop on the
// device; Jimi plays one-minute files by name (REPLAYLIST, continued in batches) and can upload a minute (HVIDEO).
const PlaybackPanel = ({
  device, protocol = 'jt808', channels, channelLabel, resolveUrl, onMessage, onMediaRequested,
}) => {
  const jimi = protocol === 'jimi';
  const theme = useTheme();
  const t = useTranslation();
  const videoRef = useRef(null);

  const [day, setDay] = useState(dayjs().format('YYYY-MM-DD'));
  const [channel, setChannel] = useState(0);
  const [recordings, setRecordings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [position, setPosition] = useState(0);

  const dayStart = dayjs(day).startOf('day').valueOf();

  const command = async (type, attributes) => fetchOrThrow('/api/commands/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: device.id, type, attributes }),
  });
  const text = (data) => command('custom', { data });

  // Jimi: stream the files from the chosen minute, eight at a time
  const replayJimi = async (recording, index) => {
    const batch = recording.files.slice(index, index + JIMI_BATCH);
    await text(`REPLAYLIST,${batch.join(',')}`);
    const from = recording.start + index * MINUTE;
    setPlaying({ ...recording, from, index, count: batch.length, startedAt: Date.now() });
    setPosition(from);
    setPaused(false);
  };

  const search = useCatch(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        deviceId: device.id, channel, from: new Date(dayStart).toISOString(), to: new Date(dayStart + DAY - 1000).toISOString(),
      });
      const response = await fetch(`/api/video/recordings?${query}`);
      if (response.status === 409) {
        setError(t('playbackOffline'));
        setRecordings(null);
      } else if (response.status === 504) {
        setError(t(jimi ? 'playbackTimeoutJimi' : 'playbackTimeout'));
        setRecordings(null);
      } else if (!response.ok) {
        throw new Error(await response.text());
      } else {
        setRecordings((await response.json()).sort((a, b) => a.channel - b.channel || a.start - b.start));
      }
    } finally {
      setLoading(false);
    }
  });

  const stop = useCatch(async () => {
    if (playing && !jimi) {
      await command('videoPlaybackControl', { index: playing.channel, control: 2 });
    }
    setPlaying(null);
    setPaused(false);
  });

  const play = useCatch(async (recording, from = recording.start) => {
    if (jimi) {
      const index = Math.min(recording.files.length - 1, Math.max(0, Math.floor((from - recording.start) / MINUTE)));
      await replayJimi(recording, index);
      return;
    }
    if (playing) {
      await command('videoPlaybackControl', { index: playing.channel, control: 2 });
    }
    await command('videoPlayback', {
      index: recording.channel, from, to: recording.end, speed,
    });
    setPlaying({ ...recording, from });
    setPosition(from);
    setPaused(false);
  });

  const togglePause = useCatch(async () => {
    if (jimi) {
      if (paused) {
        videoRef.current?.play()?.catch?.(() => {});
      } else {
        videoRef.current?.pause();
      }
      setPaused(!paused);
      return;
    }
    await command('videoPlaybackControl', { index: playing.channel, control: paused ? 0 : 1 });
    setPaused(!paused);
  });

  const changeSpeed = useCatch(async (value) => {
    setSpeed(value);
    if (playing) {
      await command('videoPlaybackControl', { index: playing.channel, control: value > 1 ? 3 : 0, speed: value });
    }
  });

  const seek = useCatch(async (value) => {
    if (jimi) {
      await play(playing, value);
      return;
    }
    await command('videoPlaybackControl', { index: playing.channel, control: 5, seek: value });
    setPosition(value);
  });

  useEffect(() => {
    if (!playing || !videoRef.current) {
      return undefined;
    }
    const url = resolveUrl(playing.channel);
    if (!url || !mpegts.getFeatureList().mseLivePlayback) {
      return undefined;
    }
    const player = mpegts.createPlayer({ type: 'flv', isLive: true, url }, { enableStashBuffer: false });
    player.attachMediaElement(videoRef.current);
    player.load();
    const start = setTimeout(() => player.play()?.catch?.(() => {}), 300);
    return () => {
      clearTimeout(start);
      player.destroy();
    };
  }, [playing?.channel, playing?.from, playing?.startedAt]);

  // Jimi: follow the playing minute and ask for the next files before the current batch ends
  useEffect(() => {
    if (!jimi || !playing) {
      return undefined;
    }
    const tick = setInterval(() => {
      if (!paused) {
        setPosition((value) => Math.min(playing.end, value + 1000));
      }
    }, 1000);
    const next = playing.index + playing.count;
    const continuation = next < playing.files.length
      ? setTimeout(() => replayJimi(playing, next).catch(() => {}), playing.count * MINUTE - 15000) : null;
    return () => {
      clearInterval(tick);
      clearTimeout(continuation);
    };
  }, [playing, paused]);

  const downloadMinute = useCatch(async () => {
    const index = Math.min(playing.files.length - 1, Math.max(0, Math.floor((position - playing.start) / MINUTE)));
    const name = playing.files[index];
    await text(`HVIDEO,${name.slice(0, 19)},${playing.channel}`);
    onMessage?.(t('playbackDownloadRequested'));
    onMediaRequested?.();
  });

  useEffect(() => () => {
    if (playing && !jimi) {
      command('videoPlaybackControl', { index: playing.channel, control: 2 }).catch(() => {});
    }
  }, [device.id]);

  const rows = channel ? [channel] : channels;
  const percent = (time) => Math.max(0, Math.min(100, ((time - dayStart) / DAY) * 100));

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label={t('playbackDay')} value={day} onChange={(event) => setDay(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label={t('dashcamChannel')} value={channel} onChange={(event) => setChannel(Number(event.target.value))} sx={{ minWidth: 160 }}>
          <MenuItem value={0}>{t('playbackAllChannels')}</MenuItem>
          {channels.map((value) => <MenuItem key={value} value={value}>{channelLabel(value)}</MenuItem>)}
        </TextField>
        <Button variant="contained" startIcon={<SearchIcon />} onClick={search} disabled={loading}>{t('playbackSearch')}</Button>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {playing && (
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: 'hidden' }}>
          <Box sx={{ position: 'relative', overflow: 'hidden', height: { xs: 220, sm: 360, lg: 460 }, bgcolor: '#111', display: 'grid', placeItems: 'center' }}>
            {resolveUrl(playing.channel)
              ? <video ref={videoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
              : <Typography color="grey.500">{t('dashcamNoVideoServer')}</Typography>}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1 }}>
            <IconButton onClick={togglePause}>{paused ? <PlayArrowIcon /> : <PauseIcon />}</IconButton>
            <IconButton onClick={stop}><StopIcon /></IconButton>
            <Typography variant="body2" sx={{ minWidth: 150 }}>
              {`${channelLabel(playing.channel)} · ${dayjs(position).format('HH:mm:ss')}`}
            </Typography>
            <Slider
              size="small"
              min={playing.start}
              max={playing.end}
              step={1000}
              value={position}
              onChange={(_, value) => setPosition(value)}
              onChangeCommitted={(_, value) => seek(value)}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => dayjs(value).format('HH:mm:ss')}
              sx={{ mx: 2 }}
            />
            {jimi ? (
              <Tooltip title={t('playbackDownloadMinute')}>
                <IconButton onClick={downloadMinute}><DownloadIcon /></IconButton>
              </Tooltip>
            ) : (
              <TextField select size="small" value={speed} onChange={(event) => changeSpeed(Number(event.target.value))} sx={{ width: 90 }}>
                {SPEEDS.map((value) => <MenuItem key={value} value={value}>{`x${value}`}</MenuItem>)}
              </TextField>
            )}
          </Stack>
        </Card>
      )}

      {recordings && (
        <>
          <Card variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>{t('playbackTimeline')}</Typography>
            {rows.map((row) => (
              <Stack key={row} direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ width: 90, flexShrink: 0 }} noWrap>{channelLabel(row)}</Typography>
                <Box sx={{ position: 'relative', flexGrow: 1, height: 22, borderRadius: 1, bgcolor: alpha(theme.palette.text.primary, 0.06) }}>
                  {recordings.filter((item) => item.channel === row).map((item) => (
                    <Tooltip key={`${item.start}`} title={`${dayjs(item.start).format('HH:mm')} – ${dayjs(item.end).format('HH:mm')}`}>
                      <Box
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          const ratio = (event.clientX - rect.left) / rect.width;
                          play(item, Math.round(item.start + ratio * (item.end - item.start)));
                        }}
                        sx={{
                          position: 'absolute',
                          top: 2,
                          bottom: 2,
                          left: `${percent(item.start)}%`,
                          width: `${Math.max(0.4, percent(item.end) - percent(item.start))}%`,
                          borderRadius: 0.5,
                          cursor: 'pointer',
                          bgcolor: item.alarm ? theme.palette.error.main : theme.palette.primary.main,
                          '&:hover': { opacity: 0.8 },
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Stack>
            ))}
            <Stack direction="row" justifyContent="space-between" sx={{ ml: 13 }}>
              {[0, 6, 12, 18, 24].map((hour) => <Typography key={hour} variant="caption" color="text.secondary">{`${hour}:00`}</Typography>)}
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('dashcamChannel')}</TableCell>
                  <TableCell>{t('reportStartTime')}</TableCell>
                  <TableCell>{t('reportEndTime')}</TableCell>
                  <TableCell align="right">{t('reportDuration')}</TableCell>
                  <TableCell align="right">{t('playbackSize')}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {recordings.map((item) => (
                  <TableRow key={`${item.channel}-${item.start}`} hover selected={playing?.start === item.start && playing?.channel === item.channel}>
                    <TableCell>{channelLabel(item.channel)}</TableCell>
                    <TableCell>{dayjs(item.start).format('HH:mm:ss')}</TableCell>
                    <TableCell>{dayjs(item.end).format('HH:mm:ss')}</TableCell>
                    <TableCell align="right">{`${Math.round((item.end - item.start) / 60000)} min`}</TableCell>
                    <TableCell align="right">{item.size ? `${(item.size / 1048576).toFixed(0)} MB` : '—'}</TableCell>
                    <TableCell>{item.alarm ? <Chip size="small" color="error" label={t('playbackAlarm')} /> : null}</TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<PlayArrowIcon />} onClick={() => play(item)}>{t('playbackPlay')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!recordings.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', py: 1 }}>
                        <VideoLibraryIcon fontSize="small" />
                        <Typography variant="body2">{t('playbackNone')}</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
      {!recordings && !loading && !error && (
        <Grid container>
          <Typography variant="body2" color="text.secondary">{t('playbackHint')}</Typography>
        </Grid>
      )}
    </Box>
  );
};

export default PlaybackPanel;
