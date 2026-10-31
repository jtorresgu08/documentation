import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Autocomplete, Box, Button, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import StraightenIcon from '@mui/icons-material/Straighten';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Metric, distanceMeters, formatKm, formatMinutes,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { setPanelData, updatePanel } from '../common/util/floatingPanels';
import { map } from '../map/core/MapView';

const lengthOf = (points) => points.reduce((sum, point, i) => (i ? sum + distanceMeters(points[i - 1][1], points[i - 1][0], point[1], point[0]) : 0), 0);

// local metric projection around a latitude, good enough for a city or a route
const project = (lat0) => ([lon, lat]) => [lon * 111320 * Math.cos((lat0 * Math.PI) / 180), lat * 110540];

const areaOf = (points) => {
  if (points.length < 3) return 0;
  const xy = points.map(project(points[0][1]));
  let sum = 0;
  xy.forEach(([x1, y1], i) => {
    const [x2, y2] = xy[(i + 1) % xy.length];
    sum += x1 * y2 - x2 * y1;
  });
  return Math.abs(sum / 2);
};

const segmentDistance = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const k = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
};

// distance of every real point to the planned route, in meters
export const deviations = (planned, real) => {
  if (planned.length < 2 || !real.length) return [];
  const toXY = project(planned[0][1]);
  const route = planned.map(toXY);
  return real.map((point) => {
    const xy = toXY(point);
    let best = Infinity;
    for (let i = 1; i < route.length; i += 1) best = Math.min(best, segmentDistance(xy, route[i - 1], route[i]));
    return best;
  });
};

const formatArea = (m2) => (m2 >= 10000 ? `${(m2 / 10000).toLocaleString('es-PE', { maximumFractionDigits: 2 })} ha` : `${Math.round(m2).toLocaleString('es-PE')} m²`);

// Map tools: measure a distance or an area by clicking on the map, or draw a planned route and compare it with the
// real track of a unit (share of the track inside the corridor, maximum deviation, planned vs driven distance)
const MeasurePanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const devices = useSelector((state) => state.devices.items);
  const mode = panel.props.mode || 'distance';
  const points = useMemo(() => panel.props.points || [], [panel.props.points]);
  const corridor = panel.props.corridor || 300;
  const [deviceId, setDeviceId] = useState(panel.props.deviceId || null);
  const [period, setPeriod] = useState('today');
  const [real, setReal] = useState([]);

  const setProps = (changes) => updatePanel(panel.id, { props: { ...panel.props, ...changes } });

  useEffect(() => {
    if (panel.minimized) return undefined;
    const onClick = (event) => {
      event.preventDefault();
      setProps({ points: [...points, [event.lngLat.lng, event.lngLat.lat]] });
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [panel.props, panel.minimized]);

  useEffect(() => {
    if (mode !== 'route' || !deviceId) {
      setReal([]);
      return;
    }
    const from = period === 'today' ? dayjs().startOf('day') : dayjs().subtract(1, 'day').startOf('day');
    const to = period === 'today' ? dayjs() : dayjs().startOf('day');
    fetchOrThrow(`/api/positions?deviceId=${deviceId}&from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((response) => response.json())
      .then((items) => setReal(items.map((item) => [item.longitude, item.latitude])))
      .catch(() => setReal([]));
  }, [mode, deviceId, period]);

  const comparison = useMemo(() => {
    if (mode !== 'route' || points.length < 2 || !real.length) return null;
    const values = deviations(points, real);
    const inside = values.filter((value) => value <= corridor).length;
    return {
      inside: Math.round((inside / values.length) * 100),
      max: Math.max(...values),
      real: lengthOf(real),
      off: real.filter((_, i) => values[i] > corridor),
    };
  }, [mode, points, real, corridor]);

  useEffect(() => {
    setPanelData(panel.id, {
      mode, points, real: mode === 'route' ? real : [], off: comparison?.off || [],
    });
  }, [mode, points, real, comparison]);

  useEffect(() => () => setPanelData(panel.id, null), []);

  const length = lengthOf(mode === 'area' && points.length > 2 ? [...points, points[0]] : points);

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<StraightenIcon fontSize="small" />}
      color={theme.palette.info.main}
      title={t('panelMeasure')}
      subtitle={t('panelClickOnMap')}
      width={360}
      footer={(
        <Stack direction="row" spacing={0.5}>
          <Button size="small" startIcon={<UndoIcon />} disabled={!points.length} onClick={() => setProps({ points: points.slice(0, -1) })}>{t('panelUndo')}</Button>
          <Button size="small" startIcon={<DeleteOutlineIcon />} disabled={!points.length} onClick={() => setProps({ points: [] })}>{t('panelClear')}</Button>
        </Stack>
      )}
    >
      <Tabs value={mode} onChange={(_, value) => setProps({ mode: value })} variant="fullWidth" sx={{ minHeight: 34, mb: 1, '& .MuiTab-root': { minHeight: 34, py: 0.5, fontSize: 12 } }}>
        <Tab value="distance" label={t('panelDistance')} />
        <Tab value="area" label={t('panelArea')} />
        <Tab value="route" label={t('panelPlannedRoute')} />
      </Tabs>
      <Stack direction="row" spacing={0.75}>
        <Box sx={{ flex: 1 }}><Metric label={mode === 'area' ? t('panelPerimeter') : t('sharedDistance')} value={formatKm(length)} /></Box>
        {mode === 'area' && <Box sx={{ flex: 1 }}><Metric label={t('panelArea')} value={formatArea(areaOf(points))} /></Box>}
        {mode !== 'area' && <Box sx={{ flex: 1 }}><Metric label={t('panelDriveTime')} value={length ? formatMinutes((length / 1000 / 35) * 60) : '—'} caption="35 km/h" /></Box>}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
        {`${points.length} ${t('panelPoints')} · ${mode === 'route' ? t('panelRouteHint') : t('panelMeasureHint')}`}
      </Typography>
      {mode === 'route' && (
        <>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Autocomplete
              size="small"
              sx={{ flexGrow: 1 }}
              options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
              getOptionLabel={(option) => option.name}
              value={devices[deviceId] || null}
              onChange={(_, value) => setDeviceId(value?.id || null)}
              renderInput={(params) => <TextField {...params} placeholder={t('panelCompareWith')} />}
            />
            <Select size="small" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <MenuItem value="today">{t('reportToday')}</MenuItem>
              <MenuItem value="yesterday">{t('reportYesterday')}</MenuItem>
            </Select>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">{t('panelCorridor')}</Typography>
            <Select size="small" value={corridor} onChange={(event) => setProps({ corridor: event.target.value })} sx={{ fontSize: 12 }}>
              {[100, 300, 500, 1000].map((value) => <MenuItem key={value} value={value}>{`${value} m`}</MenuItem>)}
            </Select>
          </Stack>
          {comparison && (
            <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
              <Box sx={{ flex: 1 }}><Metric label={t('panelOnRoute')} value={`${comparison.inside} %`} color={comparison.inside >= 90 ? theme.palette.success.main : theme.palette.error.main} /></Box>
              <Box sx={{ flex: 1 }}><Metric label={t('panelMaxDeviation')} value={formatKm(comparison.max)} /></Box>
              <Box sx={{ flex: 1 }}><Metric label={t('panelDriven')} value={formatKm(comparison.real)} /></Box>
            </Stack>
          )}
        </>
      )}
    </FloatingPanel>
  );
};

export default MeasurePanel;
