import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, ButtonGroup, IconButton, MenuItem, Select, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import VideocamIcon from '@mui/icons-material/Videocam';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FilterNoneIcon from '@mui/icons-material/FilterNone';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { buildCameraCommand, cameraStreamUrl, getCameraConfig } from '../common/util/dashcam';
import { closeVideoWindow, focusVideoWindow, useVideoWindows } from '../common/util/videoWindows';
import { devicesActions } from '../store';
import EngineCutDialog from '../common/components/EngineCutDialog';
import VideoTile from '../dashcam/VideoTile';

const LAYOUTS = [1, 4, 9, 16];

const LayoutIcon = ({ size }) => {
  const cells = Math.sqrt(size);
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: `repeat(${cells}, 1fr)`, gap: '1.5px', width: 16, height: 12,
    }}
    >
      {Array.from({ length: size }, (_, index) => <Box key={index} sx={{ bgcolor: 'currentColor', borderRadius: '1.5px' }} />)}
    </Box>
  );
};

// Live video of one unit in a window floating over the platform: a grid of channels (1, 4, 9 or 16), each with its
// own controls, plus play / stop all, HD or SD stream, engine on / off and minimize, maximize, move and resize.
const VideoWindow = ({ deviceId, cascade, onTop }) => {
  const theme = useTheme();
  const t = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const device = useSelector((state) => state.devices.items[deviceId]);
  const position = useSelector((state) => state.session.positions[deviceId]);
  const serverAttributes = useSelector((state) => state.session.server.attributes);
  const readonly = useSelector((state) => state.session.user.readonly || state.session.user.limitCommands);

  const config = getCameraConfig(device, position);
  const template = config.playUrl
    || (config.protocol === 'jimi' && serverAttributes['dashcam.playUrlJimi']) || serverAttributes['dashcam.playUrl'];
  const channels = Array.from({ length: config.channels }, (_, index) => index + 1);
  const label = (channel) => config.channelName(channel) || `CH ${channel}`;

  const [playing, setPlaying] = useState([]);
  const [layout, setLayout] = useState(() => LAYOUTS.find((size) => size >= Math.min(config.channels, 16)) || 4);
  const [first, setFirst] = useState(1);
  const [single, setSingle] = useState(null);
  const [selected, setSelected] = useState(1);
  const [hd, setHd] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(() => Math.min(820, window.innerWidth - 140));
  const [message, setMessage] = useState(null);
  const [engineMode, setEngineMode] = useState(null);
  const drag = useRef(null);
  const resize = useRef(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const send = async (action, channel, options = {}) => fetchOrThrow('/api/commands/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCameraCommand(deviceId, config, action, channel, { hd, ...options })),
  });

  const run = async (task) => {
    try {
      setMessage(null);
      await task();
    } catch (error) {
      setMessage({ text: error.message, error: true });
    }
  };

  const start = (list) => run(async () => {
    const pending = list.filter((channel) => !playingRef.current.includes(channel));
    for (const channel of pending) {
      await send('live', channel);
    }
    setPlaying((current) => [...new Set([...current, ...pending])]);
  });

  const stop = (list) => run(async () => {
    const active = list.filter((channel) => playingRef.current.includes(channel));
    setPlaying((current) => current.filter((channel) => !active.includes(channel)));
    for (const channel of active) {
      await send('liveStop', channel);
    }
  });

  const toggle = (channel) => (playing.includes(channel) ? stop([channel]) : start([channel]));

  const photo = (channel) => run(async () => {
    await send('photo', channel);
    setMessage({ text: t('videoPhotoRequested') });
  });

  const changeQuality = (value) => run(async () => {
    const active = playingRef.current;
    for (const channel of active) {
      await send('liveStop', channel, { hd });
      await send('live', channel, { hd: value });
    }
    setHd(value);
  });

  const close = () => {
    playingRef.current.forEach((channel) => send('liveStop', channel).catch(() => {}));
    closeVideoWindow(deviceId);
  };

  useEffect(() => () => {
    playingRef.current.forEach((channel) => send('liveStop', channel).catch(() => {}));
  }, []);

  useEffect(() => {
    if (!device) {
      closeVideoWindow(deviceId);
    }
  }, [device]);

  if (!device) {
    return null;
  }

  const size = single ? 1 : Math.min(layout, Math.max(1, channels.length));
  const columns = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / columns);
  const page = Math.floor((first - 1) / size);
  const visible = single ? [single] : channels.slice(page * size, page * size + size);

  const startDrag = (event) => {
    if (!desktop || maximized || event.target.closest('button, input, [role="combobox"], .MuiSelect-select')) {
      return;
    }
    focusVideoWindow(deviceId);
    drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (drag.current) {
      setOffset({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
    }
  };
  const startResize = (event) => {
    event.stopPropagation();
    resize.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event) => {
    if (resize.current) {
      setWidth(Math.max(420, Math.min(window.innerWidth - 40, resize.current.width + event.clientX - resize.current.x)));
    }
  };

  const online = device.status === 'online';
  const speed = position ? Math.round(position.speed * 1.852) : null;

  const placement = (() => {
    if (!desktop) {
      return { left: 8, right: 8, bottom: 8 };
    }
    if (maximized) {
      return { inset: 16 };
    }
    return {
      top: 72 + cascade * 32, right: 24 + cascade * 32, width, transform: `translate(${offset.x}px, ${offset.y}px)`,
    };
  })();

  const headerButton = { minWidth: 0, height: 30, px: 1.25, borderRadius: 2, fontSize: 12, fontWeight: 700 };

  return (
    <Box
      onPointerDown={() => focusVideoWindow(deviceId)}
      sx={{
        position: 'fixed',
        zIndex: theme.zIndex.appBar + (onTop ? 3 : 2),
        ...placement,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '18px',
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, 0.82),
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
        boxShadow: onTop ? '0 18px 48px rgba(15,27,45,0.22)' : '0 8px 24px rgba(15,27,45,0.14)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={() => desktop && setMaximized(!maximized)}
        sx={{ px: 1.5, py: 1, cursor: desktop && !maximized ? 'move' : 'default', userSelect: 'none' }}
      >
        <Box sx={{
          width: 32, height: 32, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main',
        }}
        >
          <VideocamIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0, mr: 'auto' }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: online ? 'success.main' : 'error.main' }} />
            <Typography variant="subtitle2" fontWeight={700} noWrap>{device.name}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {`${config.channels} ${t('videoChannels')}${speed !== null ? ` · ${speed} km/h` : ''}${playing.length ? ` · ${playing.length} ${t('videoLive').toLowerCase()}` : ''}`}
          </Typography>
        </Box>

        {!minimized && (
          <>
            {channels.length > size && (
              <Select
                size="small"
                value={single || first}
                onChange={(event) => (single ? setSingle(event.target.value) : setFirst(event.target.value))}
                sx={{ height: 30, borderRadius: 2, fontSize: 12, fontWeight: 700, '& .MuiSelect-select': { py: 0.5 } }}
              >
                {(single || size === 1 ? channels : channels.filter((channel) => (channel - 1) % size === 0)).map((channel) => (
                  <MenuItem key={channel} value={channel}>
                    {single || size === 1 ? label(channel) : `CH ${channel}–${Math.min(channel + size - 1, channels.length)}`}
                  </MenuItem>
                ))}
              </Select>
            )}
            {channels.length > 1 && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={single ? 1 : layout}
                onChange={(_, value) => {
                  if (value) {
                    setSingle(value === 1 ? selected : null);
                    setLayout(value);
                    setFirst(1);
                  }
                }}
                sx={{ '& .MuiToggleButton-root': { height: 30, px: 1, borderRadius: 2 } }}
              >
                {LAYOUTS.filter((value, index) => value === 1 || LAYOUTS[index - 1] < channels.length).map((value) => (
                  <ToggleButton key={value} value={value} aria-label={`${value}`}><LayoutIcon size={value} /></ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
            {config.protocol === 'jt808' && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={hd ? 'hd' : 'sd'}
                onChange={(_, value) => value && changeQuality(value === 'hd')}
                sx={{ '& .MuiToggleButton-root': { height: 30, px: 1, borderRadius: 2, fontSize: 11, fontWeight: 700 } }}
              >
                <ToggleButton value="sd">SD</ToggleButton>
                <ToggleButton value="hd">HD</ToggleButton>
              </ToggleButtonGroup>
            )}
            <ButtonGroup size="small" variant="contained" disableElevation sx={{ '& .MuiButton-root': headerButton }}>
              <Tooltip title={t('videoPlayAll')}><Button color="success" onClick={() => start(visible)} aria-label={t('videoPlayAll')}><PlayArrowIcon fontSize="small" /></Button></Tooltip>
              <Tooltip title={t('videoStopAll')}><Button color="inherit" onClick={() => stop(channels)} aria-label={t('videoStopAll')}><StopIcon fontSize="small" /></Button></Tooltip>
            </ButtonGroup>
            {!readonly && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ pl: 1, borderLeft: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">{t('videoEngine')}</Typography>
                <Button size="small" color="success" variant="outlined" startIcon={<PowerSettingsNewIcon />} onClick={() => setEngineMode('resume')} sx={headerButton}>ON</Button>
                <Button size="small" color="error" variant="outlined" startIcon={<PowerSettingsNewIcon />} onClick={() => setEngineMode('stop')} sx={headerButton}>OFF</Button>
              </Stack>
            )}
          </>
        )}
        <Stack direction="row" spacing={0.25}>
          <Tooltip title={minimized ? t('videoRestore') : t('videoMinimize')}>
            <IconButton size="small" onClick={() => setMinimized(!minimized)} aria-label={t('videoMinimize')}><RemoveIcon fontSize="small" /></IconButton>
          </Tooltip>
          {desktop && (
            <Tooltip title={maximized ? t('videoRestore') : t('videoMaximize')}>
              <IconButton size="small" onClick={() => setMaximized(!maximized)} aria-label={t('videoMaximize')}>
                {maximized ? <FilterNoneIcon sx={{ fontSize: 16 }} /> : <CropSquareIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('sharedHide')}>
            <IconButton size="small" onClick={close} aria-label={t('sharedHide')}><CloseIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {!minimized && (
        <>
          <Box sx={{
            mx: 1.25,
            p: 0.75,
            borderRadius: '14px',
            bgcolor: '#070a0f',
            display: 'grid',
            gap: 0.75,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            ...(maximized && desktop ? { flex: 1, minHeight: 0 } : { aspectRatio: `${16 * columns} / ${9 * rows}` }),
          }}
          >
            {visible.map((channel) => (
              <VideoTile
                key={`${channel}-${hd}`}
                channel={channel}
                label={label(channel)}
                url={cameraStreamUrl(template, device, channel)}
                playing={playing.includes(channel)}
                selected={selected === channel}
                single={Boolean(single)}
                onSelect={() => setSelected(channel)}
                onToggle={toggle}
                onPhoto={photo}
                onSingle={(value) => setSingle(single ? null : value)}
              />
            ))}
          </Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.75, py: 0.75 }}>
            <Typography variant="caption" color={message?.error || !template ? 'error' : 'text.secondary'} sx={{ flexGrow: 1 }} noWrap>
              {message?.text || (!template ? t('dashcamNoVideoServer') : t('videoHint'))}
            </Typography>
            <Button
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
              onClick={() => {
                dispatch(devicesActions.selectId(deviceId));
                navigate('/dashcam');
              }}
              sx={{ fontSize: 12 }}
            >
              {t('videoOpenCameras')}
            </Button>
            {desktop && !maximized && (
              <Box
                onPointerDown={startResize}
                onPointerMove={moveResize}
                onPointerUp={() => { resize.current = null; }}
                aria-hidden="true"
                sx={{
                  width: 16, height: 16, cursor: 'nwse-resize', mr: -1,
                  background: `linear-gradient(135deg, transparent 50%, ${alpha(theme.palette.text.secondary, 0.5)} 50%, ${alpha(theme.palette.text.secondary, 0.5)} 60%, transparent 60%, transparent 70%, ${alpha(theme.palette.text.secondary, 0.5)} 70%, ${alpha(theme.palette.text.secondary, 0.5)} 80%, transparent 80%)`,
                }}
              />
            )}
          </Stack>
        </>
      )}
      <EngineCutDialog deviceId={engineMode ? deviceId : null} mode={engineMode} onClose={() => setEngineMode(null)} />
    </Box>
  );
};

const VideoWindows = () => {
  const windows = useVideoWindows();
  return windows.map((item, index) => (
    <VideoWindow key={item.deviceId} deviceId={item.deviceId} cascade={item.cascade % 4} onTop={index === windows.length - 1} />
  ));
};

export default VideoWindows;
