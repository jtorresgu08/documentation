import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete, Box, Button, IconButton, MenuItem, Select, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ReplayIcon from '@mui/icons-material/Replay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Empty, Metric, distanceMeters, formatKm, speedKmh,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { setPanelData, updatePanel } from '../common/util/floatingPanels';

const PERIODS = {
  hour: () => [dayjs().subtract(1, 'hour'), dayjs()],
  six: () => [dayjs().subtract(6, 'hour'), dayjs()],
  today: () => [dayjs().startOf('day'), dayjs()],
  yesterday: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().startOf('day')],
};

// Quick replay over the main map without leaving it: unit and period, the route coloured by speed, playback at
// 1–32× with a position slider and the speed chart, and the summary of the trip
const ReplayPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const deviceId = panel.props.deviceId || null;
  const period = panel.props.period || 'today';
  const [positions, setPositions] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [loading, setLoading] = useState(false);

  const setProps = (changes) => updatePanel(panel.id, { props: { ...panel.props, ...changes } });

  useEffect(() => {
    if (!deviceId) {
      setPositions(null);
      return;
    }
    const [from, to] = PERIODS[period]();
    setLoading(true);
    setPlaying(false);
    fetchOrThrow(`/api/positions?deviceId=${deviceId}&from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((response) => response.json())
      .then((items) => {
        setPositions(items);
        setIndex(0);
      })
      .catch(() => setPositions([]))
      .finally(() => setLoading(false));
  }, [deviceId, period]);

  useEffect(() => {
    setPanelData(panel.id, positions?.length ? { positions, index, fit: `${deviceId}-${period}-${positions.length}` } : null);
  }, [positions, index]);

  useEffect(() => () => setPanelData(panel.id, null), []);

  useEffect(() => {
    if (!playing || !positions?.length) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => {
        if (current >= positions.length - 1) {
          setPlaying(false);
          return current;
        }
        return Math.min(positions.length - 1, current + Math.max(1, Math.round(speed / 4)));
      });
    }, 250);
    return () => clearInterval(timer);
  }, [playing, speed, positions]);

  const summary = useMemo(() => {
    if (!positions?.length) return null;
    let distance = 0;
    for (let i = 1; i < positions.length; i += 1) {
      const a = positions[i - 1];
      const b = positions[i];
      const meters = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      const seconds = (dayjs(b.fixTime).valueOf() - dayjs(a.fixTime).valueOf()) / 1000;
      if (seconds <= 0 || meters / seconds < 83) distance += meters;
    }
    const moving = positions.filter((position) => position.speed > 2).length;
    return {
      distance,
      max: Math.max(...positions.map(speedKmh)),
      duration: dayjs(positions[positions.length - 1].fixTime).diff(dayjs(positions[0].fixTime), 'minute'),
      moving: Math.round((moving / positions.length) * 100),
    };
  }, [positions]);

  const chart = useMemo(() => {
    if (!positions?.length) return [];
    const step = Math.max(1, Math.floor(positions.length / 300));
    return positions.filter((_, i) => i % step === 0).map((position) => ({ time: dayjs(position.fixTime).valueOf(), speed: speedKmh(position) }));
  }, [positions]);

  const current = positions?.[index];

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<ReplayIcon fontSize="small" />}
      title={t('panelReplay')}
      subtitle={deviceId && devices[deviceId] ? devices[deviceId].name : t('panelChooseUnit')}
      width={400}
      footer={deviceId && (
        <Button size="small" endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />} onClick={() => {
          const [from, to] = PERIODS[period]();
          navigate(`/replay?deviceId=${deviceId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
        }}
        >
          {t('panelFullReplay')}
        </Button>
      )}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Autocomplete
          size="small"
          sx={{ flexGrow: 1 }}
          options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
          getOptionLabel={(option) => option.name}
          value={devices[deviceId] || null}
          onChange={(_, value) => setProps({ deviceId: value?.id || null })}
          renderInput={(params) => <TextField {...params} placeholder={t('reportDevice')} />}
        />
        <Select size="small" value={period} onChange={(event) => setProps({ period: event.target.value })}>
          <MenuItem value="hour">{t('panelLastHour')}</MenuItem>
          <MenuItem value="six">{t('panelLast6Hours')}</MenuItem>
          <MenuItem value="today">{t('reportToday')}</MenuItem>
          <MenuItem value="yesterday">{t('reportYesterday')}</MenuItem>
        </Select>
      </Stack>
      {loading && <Typography variant="caption" color="text.secondary">{t('sharedLoading')}</Typography>}
      {deviceId && positions && !positions.length && !loading && <Empty>{t('panelNoRoute')}</Empty>}
      {summary && (
        <>
          <Stack direction="row" spacing={0.75}>
            <Box sx={{ flex: 1 }}><Metric label={t('sharedDistance')} value={formatKm(summary.distance)} /></Box>
            <Box sx={{ flex: 1 }}><Metric label={t('replayMaxSpeed')} value={`${summary.max} km/h`} /></Box>
            <Box sx={{ flex: 1 }}><Metric label={t('panelInMotion')} value={`${summary.moving} %`} /></Box>
          </Stack>
          <Box sx={{ height: 80, mt: 1 }}>
            <ResponsiveContainer>
              <AreaChart
                data={chart}
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                onClick={(event) => {
                  if (event?.activeLabel != null) {
                    const time = event.activeLabel;
                    const found = positions.findIndex((position) => dayjs(position.fixTime).valueOf() >= time);
                    if (found >= 0) setIndex(found);
                  }
                }}
              >
                <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value) => dayjs(value).format('HH:mm')} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="speed" stroke={theme.palette.primary.main} fill={alpha(theme.palette.primary.main, 0.15)} isAnimationActive={false} />
                {current && <ReferenceLine x={dayjs(current.fixTime).valueOf()} stroke={theme.palette.error.main} />}
              </AreaChart>
            </ResponsiveContainer>
          </Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
            <IconButton color="primary" onClick={() => {
              if (index >= positions.length - 1) setIndex(0);
              setPlaying(!playing);
            }}
            >
              {playing ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
            <Slider size="small" min={0} max={positions.length - 1} value={index} onChange={(_, value) => setIndex(value)} />
            <ToggleButtonGroup size="small" exclusive value={speed} onChange={(_, value) => value && setSpeed(value)} sx={{ '& .MuiToggleButton-root': { px: 0.75, py: 0.25, fontSize: 11 } }}>
              {[1, 4, 8, 32].map((value) => <ToggleButton key={value} value={value}>{`${value}×`}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
          {current && (
            <Typography variant="caption" color="text.secondary" component="div">
              {`${dayjs(current.fixTime).format('DD/MM HH:mm:ss')} · ${speedKmh(current)} km/h · ${index + 1}/${positions.length}`}
            </Typography>
          )}
        </>
      )}
    </FloatingPanel>
  );
};

export default ReplayPanel;
