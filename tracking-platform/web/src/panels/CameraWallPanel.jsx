import {
 useEffect, useMemo, useRef, useState 
} from 'react';
import { useSelector } from 'react-redux';
import {
  Autocomplete, Box, Button, MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import FloatingPanel from './FloatingPanel';
import { Empty } from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { updatePanel } from '../common/util/floatingPanels';
import { openVideoWindow } from '../common/util/videoWindows';
import { buildCameraCommand, cameraStreamUrl, getCameraConfig } from '../common/util/dashcam';
import { gridFor } from '../main/VideoWindows';
import VideoTile from '../dashcam/VideoTile';

// Camera wall for a monitoring screen: one channel (front camera by default) of several units at once, 4, 6 or 9
// per page, rotating pages every 15–60 s; only the visible tiles stream, the rest are stopped
const CameraWallPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const serverAttributes = useSelector((state) => state.session.server.attributes);
  const withCamera = useMemo(() => Object.values(devices)
    .filter((device) => getCameraConfig(device, positions[device.id]).kind)
    .sort((a, b) => a.name.localeCompare(b.name)), [devices]);
  const deviceIds = (panel.props.deviceIds || withCamera.map((device) => device.id)).filter((id) => devices[id]);
  const size = panel.props.size || 4;
  const channel = panel.props.channel || 1;
  const rotate = panel.props.rotate ?? 30;
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const [playing, setPlaying] = useState([]);
  const active = useRef([]);
  active.current = playing;

  const pages = Math.max(1, Math.ceil(deviceIds.length / size));
  const visible = deviceIds.slice((page % pages) * size, (page % pages) * size + size);
  const setProps = (changes) => updatePanel(panel.id, { props: { ...panel.props, ...changes } });

  const configOf = (id) => getCameraConfig(devices[id], positions[id]);
  const urlOf = (id) => {
    const config = configOf(id);
    const template = config.playUrl
      || (config.protocol === 'jimi' && serverAttributes['dashcam.playUrlJimi']) || serverAttributes['dashcam.playUrl'];
    return cameraStreamUrl(template, devices[id], Math.min(channel, config.channels));
  };
  const command = (id, action) => fetchOrThrow('/api/commands/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCameraCommand(id, configOf(id), action, Math.min(channel, configOf(id).channels), { hd: false })),
  }).catch(() => {});

  const start = async (ids) => {
    const pending = ids.filter((id) => !active.current.includes(id));
    setPlaying((current) => [...new Set([...current, ...pending])]);
    for (const id of pending) await command(id, 'live');
  };
  const stop = async (ids) => {
    const list = ids.filter((id) => active.current.includes(id));
    setPlaying((current) => current.filter((id) => !list.includes(id)));
    for (const id of list) await command(id, 'liveStop');
  };

  // the visible page streams, the previous one stops
  useEffect(() => {
    if (!running) return;
    stop(active.current.filter((id) => !visible.includes(id)));
    start(visible);
  }, [running, page, size, channel, deviceIds.join()]);

  useEffect(() => {
    if (!running || !rotate || pages < 2) return undefined;
    const timer = setInterval(() => setPage((current) => (current + 1) % pages), rotate * 1000);
    return () => clearInterval(timer);
  }, [running, rotate, pages]);

  useEffect(() => () => active.current.forEach((id) => command(id, 'liveStop')), []);

  const [columns, rows] = gridFor(size);

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<ViewModuleIcon fontSize="small" />}
      title={t('panelCameraWall')}
      subtitle={`${deviceIds.length} ${t('quickVehicles')} · ${t('panelPage')} ${(page % pages) + 1}/${pages}`}
      width={760}
      minWidth={480}
      actions={(
        <Stack direction="row" spacing={0.5} alignItems="center">
          <ToggleButtonGroup size="small" exclusive value={size} onChange={(_, value) => value && setProps({ size: value })} sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 11 } }}>
            {[4, 6, 9].map((value) => <ToggleButton key={value} value={value}>{value}</ToggleButton>)}
          </ToggleButtonGroup>
          {running
            ? <Button size="small" variant="contained" color="inherit" startIcon={<StopIcon />} onClick={() => { setRunning(false); stop(active.current); }}>{t('videoStopAll')}</Button>
            : <Button size="small" variant="contained" color="success" startIcon={<PlayArrowIcon />} disabled={!deviceIds.length} onClick={() => setRunning(true)}>{t('videoPlayAll')}</Button>}
        </Stack>
      )}
      footer={(
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" startIcon={<NavigateBeforeIcon />} disabled={pages < 2} onClick={() => setPage((page - 1 + pages) % pages)}>{t('panelPrevious')}</Button>
          <Button size="small" endIcon={<NavigateNextIcon />} disabled={pages < 2} onClick={() => setPage((page + 1) % pages)}>{t('panelNext')}</Button>
          <Typography variant="caption" color="text.secondary">{t('panelRotate')}</Typography>
          <Select size="small" value={rotate} onChange={(event) => setProps({ rotate: event.target.value })} sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0.25 } }}>
            {[0, 15, 30, 60].map((value) => <MenuItem key={value} value={value}>{value ? `${value} s` : t('panelNoRotation')}</MenuItem>)}
          </Select>
          <Typography variant="caption" color="text.secondary">CH</Typography>
          <Select size="small" value={channel} onChange={(event) => setProps({ channel: event.target.value })} sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0.25 } }}>
            {[1, 2, 3, 4].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </Select>
        </Stack>
      )}
    >
      <Autocomplete
        multiple
        size="small"
        limitTags={4}
        options={withCamera}
        getOptionLabel={(option) => option.name}
        value={deviceIds.map((id) => devices[id])}
        onChange={(_, value) => { setPage(0); setProps({ deviceIds: value.map((device) => device.id) }); }}
        renderInput={(params) => <TextField {...params} placeholder={t('panelCameraUnits')} />}
        sx={{ mb: 1 }}
      />
      {!withCamera.length && <Empty>{t('panelNoCameras')}</Empty>}
      {deviceIds.length > 0 && (
        <Box sx={{
          p: 0.75, borderRadius: '14px', bgcolor: '#070a0f', display: 'grid', gap: 0.75,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, aspectRatio: `${16 * columns} / ${9 * rows}`,
        }}
        >
          {visible.map((id) => (
            <VideoTile
              key={`${id}-${channel}`}
              channel={channel}
              label={devices[id].name}
              url={urlOf(id)}
              playing={playing.includes(id)}
              selected={false}
              single={false}
              onSelect={() => {}}
              onToggle={() => (playing.includes(id) ? stop([id]) : start([id]))}
              onPhoto={() => command(id, 'photo')}
              onSingle={() => openVideoWindow(id)}
            />
          ))}
        </Box>
      )}
    </FloatingPanel>
  );
};

export default CameraWallPanel;
