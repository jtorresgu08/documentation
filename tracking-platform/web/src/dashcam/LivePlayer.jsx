import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, Card, CardActions, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import mpegts from 'mpegts.js';
import { useTranslation } from '../common/components/LocalizationProvider';

// Plays the HTTP-FLV / WS-FLV stream a JT/T 1078 media server publishes for one camera channel
const LivePlayer = ({
  channel, url, onStart, onStop,
}) => {
  const t = useTranslation();
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playing || !url || !videoRef.current) {
      return undefined;
    }
    if (!mpegts.getFeatureList().mseLivePlayback) {
      setError('MSE');
      return undefined;
    }
    const player = mpegts.createPlayer({ type: 'flv', isLive: true, url }, {
      enableStashBuffer: false,
      liveBufferLatencyChasing: true,
    });
    player.on(mpegts.Events.ERROR, () => setError(t('dashcamConnecting')));
    player.attachMediaElement(videoRef.current);
    player.load();
    const retry = setTimeout(() => player.play()?.catch?.(() => {}), 300);
    return () => {
      clearTimeout(retry);
      player.destroy();
    };
  }, [playing, url]);

  const start = async () => {
    setError(null);
    await onStart(channel);
    setPlaying(true);
  };

  const stop = async () => {
    setPlaying(false);
    await onStop(channel);
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{
        position: 'relative', aspectRatio: '16 / 9', bgcolor: '#111', display: 'grid', placeItems: 'center',
      }}
      >
        {playing ? (
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <VideocamOffIcon sx={{ color: 'grey.600', fontSize: 48 }} />
        )}
        <Typography
          variant="caption"
          sx={{
            position: 'absolute', top: 6, left: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)', px: 0.75, borderRadius: 0.5,
          }}
        >
          {`${t('dashcamChannel')} ${channel}`}
        </Typography>
        {playing && error && (
          <Typography variant="caption" sx={{ position: 'absolute', bottom: 8, color: 'grey.300' }}>{error}</Typography>
        )}
      </Box>
      <CardActions sx={{ justifyContent: 'space-between' }}>
        {playing ? (
          <Button size="small" color="error" startIcon={<StopIcon />} onClick={stop}>{t('dashcamStop')}</Button>
        ) : (
          <Button size="small" startIcon={<PlayArrowIcon />} onClick={start} disabled={!url}>{t('dashcamStart')}</Button>
        )}
      </CardActions>
    </Card>
  );
};

export default LivePlayer;
