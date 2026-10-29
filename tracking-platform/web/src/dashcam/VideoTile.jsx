import { useEffect, useRef, useState } from 'react';
import {
  Box, CircularProgress, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import mpegts from 'mpegts.js';
import { useTranslation } from '../common/components/LocalizationProvider';

// One camera channel inside a floating video window: its own player and controls (play / stop, photo, sound,
// single view and full screen), so every panel can be handled on its own or together from the window.
const VideoTile = ({
  channel, label, url, playing, selected, single, onSelect, onToggle, onPhoto, onSingle,
}) => {
  const t = useTranslation();
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const [state, setState] = useState('idle');
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!playing) {
      setState('idle');
      return undefined;
    }
    if (!url || !videoRef.current) {
      setState(url ? 'connecting' : 'noserver');
      return undefined;
    }
    if (!mpegts.getFeatureList().mseLivePlayback) {
      setState('unsupported');
      return undefined;
    }
    setState('connecting');
    const player = mpegts.createPlayer({ type: 'flv', isLive: true, url }, {
      enableStashBuffer: false,
      liveBufferLatencyChasing: true,
    });
    const video = videoRef.current;
    const onPlaying = () => setState('live');
    video.addEventListener('playing', onPlaying);
    player.on(mpegts.Events.ERROR, () => setState('connecting'));
    player.attachMediaElement(video);
    player.load();
    const start = setTimeout(() => player.play()?.catch?.(() => {}), 300);
    return () => {
      clearTimeout(start);
      video.removeEventListener('playing', onPlaying);
      player.destroy();
    };
  }, [playing, url]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted, state]);

  const status = {
    live: [t('videoLive'), '#2e7d32'],
    connecting: [t('videoConnecting'), '#ed6c02'],
    noserver: [t('videoNoServer'), '#d32f2f'],
    unsupported: ['MSE', '#d32f2f'],
  }[state];

  const control = (title, icon, onClick, disabled) => (
    <Tooltip title={title}>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          aria-label={title}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          sx={{ color: '#fff', bgcolor: 'rgba(0,0,0,0.35)', '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' }, width: 30, height: 30 }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Box
      ref={boxRef}
      onClick={onSelect}
      sx={{
        position: 'relative',
        minHeight: 0,
        borderRadius: 2.5,
        overflow: 'hidden',
        bgcolor: '#0d1117',
        cursor: 'pointer',
        outline: selected ? (theme) => `2px solid ${theme.palette.primary.main}` : '1px solid rgba(255,255,255,0.06)',
        outlineOffset: -1,
        '&:hover .tile-controls': { opacity: 1 },
      }}
    >
      {playing ? (
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      ) : (
        <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ position: 'absolute', inset: 0, color: 'grey.600' }}>
          <VideocamOffIcon />
          <Typography variant="caption">{t('videoStopped')}</Typography>
        </Stack>
      )}

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ position: 'absolute', top: 8, left: 8, right: 8, pointerEvents: 'none' }}>
        <Typography variant="caption" fontWeight={700} sx={{ color: '#fff', bgcolor: 'rgba(0,0,0,0.45)', px: 1, py: 0.25, borderRadius: 1.5 }}>
          {label}
        </Typography>
        {status && (
          <Typography variant="caption" fontWeight={600} sx={{ color: '#fff', bgcolor: alpha(status[1], 0.85), px: 1, py: 0.25, borderRadius: 1.5 }}>
            {status[0]}
          </Typography>
        )}
        {state === 'connecting' && <CircularProgress size={14} sx={{ color: '#fff' }} />}
      </Stack>

      <Stack
        className="tile-controls"
        direction="row"
        spacing={0.5}
        sx={{
          position: 'absolute', bottom: 8, left: 8, right: 8, justifyContent: 'center', opacity: { xs: 1, md: selected ? 1 : 0 }, transition: 'opacity .15s',
        }}
      >
        {control(playing ? t('dashcamStop') : t('dashcamStart'), playing ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />, () => onToggle(channel))}
        {control(t('dashcamTakePhoto'), <PhotoCameraIcon fontSize="small" />, () => onPhoto(channel))}
        {control(muted ? t('videoUnmute') : t('videoMute'), muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />, () => setMuted(!muted), !playing)}
        {control(single ? t('videoGrid') : t('videoSingle'), single ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />, () => onSingle(channel))}
        {control(t('videoFullscreen'), <FullscreenIcon fontSize="small" />, () => boxRef.current?.requestFullscreen?.())}
      </Stack>
    </Box>
  );
};

export default VideoTile;
