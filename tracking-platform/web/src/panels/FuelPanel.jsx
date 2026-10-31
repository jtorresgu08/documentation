import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete, Box, Button, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import GavelIcon from '@mui/icons-material/Gavel';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Empty, Metric, Row, Section, usePolling,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { updatePanel } from '../common/util/floatingPanels';
import { convertRaw, fuelSensors } from '../common/util/sensors';

// Live fuel of a unit: current level and percentage of the tank, the level of the last 12 hours, the fills and
// drains detected by the analyzer and, for a suspicious drain, the shortcut to its evidence package
const FuelPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const withFuel = useMemo(() => Object.values(devices).filter((device) => fuelSensors(device).length)
    .sort((a, b) => a.name.localeCompare(b.name)), [devices]);
  const deviceId = panel.props.deviceId || withFuel[0]?.id || null;
  const device = devices[deviceId];
  const position = useSelector((state) => state.session.positions[deviceId]);
  const sensor = device ? fuelSensors(device)[0] : null;
  const [report, setReport] = useState(null);

  usePolling(async () => {
    if (!deviceId || !sensor) return;
    const query = new URLSearchParams({
      deviceId, sensorId: sensor.id, from: dayjs().subtract(12, 'hour').toISOString(), to: dayjs().toISOString(),
    });
    try {
      const response = await fetchOrThrow(`/api/sensors/fuel?${query}`);
      setReport(await response.json());
    } catch {
      setReport({ points: [], changes: [], summary: {} });
    }
  }, 60000, [deviceId, sensor?.id]);

  const live = sensor && position ? convertRaw(sensor, position.attributes[sensor.source]) : null;
  const points = report?.points || [];
  const level = live ?? (points.length ? points[points.length - 1].level : null);
  const percent = level != null && sensor?.tankCapacity ? Math.min(100, (level / sensor.tankCapacity) * 100) : null;
  const unit = sensor?.unit || 'L';
  const changes = [...(report?.changes || [])].reverse();
  const drains = changes.filter((change) => change.type === 'drain');

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<LocalGasStationIcon fontSize="small" />}
      color={drains.length ? theme.palette.error.main : theme.palette.success.main}
      title={t('panelFuel')}
      subtitle={device?.name || t('panelNoFuelUnits')}
      width={380}
      footer={deviceId && <Button size="small" onClick={() => navigate(`/reports/fuel?deviceId=${deviceId}`)}>{t('panelOpenFuelReport')}</Button>}
    >
      <Autocomplete
        size="small"
        options={withFuel}
        getOptionLabel={(option) => option.name}
        value={device || null}
        onChange={(_, value) => updatePanel(panel.id, { props: { ...panel.props, deviceId: value?.id || null } })}
        renderInput={(params) => <TextField {...params} placeholder={t('reportDevice')} />}
        sx={{ mb: 1 }}
      />
      {!withFuel.length && <Empty>{t('panelNoFuelUnits')}</Empty>}
      {sensor && (
        <>
          <Stack direction="row" alignItems="flex-end" spacing={1}>
            <Typography variant="h4" fontWeight={800}>{level != null ? level.toFixed(1) : '—'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ pb: 0.75 }}>{`${unit}${percent != null ? ` · ${Math.round(percent)} %` : ''}`}</Typography>
          </Stack>
          {percent != null && <LinearProgress variant="determinate" value={percent} color={percent < 20 ? 'error' : 'success'} sx={{ height: 8, borderRadius: 4, my: 0.75 }} />}
          <Stack direction="row" spacing={0.75}>
            <Box sx={{ flex: 1 }}><Metric label={t('panelConsumed12h')} value={`${report?.summary?.consumed ?? '—'} ${unit}`} /></Box>
            <Box sx={{ flex: 1 }}><Metric label={t('fuelFills')} value={report?.summary?.fills ?? '—'} color={theme.palette.success.main} /></Box>
            <Box sx={{ flex: 1 }}><Metric label={t('fuelDrains')} value={report?.summary?.drains ?? '—'} color={theme.palette.error.main} /></Box>
          </Stack>
          <Box sx={{ height: 110, mt: 1 }}>
            {points.length > 1 ? (
              <ResponsiveContainer>
                <AreaChart data={points} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(value) => dayjs(value).format('HH:mm')} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip labelFormatter={(value) => dayjs(value).format('DD/MM HH:mm')} formatter={(value) => [`${value} ${unit}`, t('panelFuel')]} />
                  <Area type="monotone" dataKey="level" stroke={theme.palette.success.main} fill={alpha(theme.palette.success.main, 0.15)} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Typography variant="caption" color="text.secondary">{t('panelNoData')}</Typography>}
          </Box>
          <Section title={t('panelFuelChanges')}>
            {!changes.length && <Typography variant="caption" color="text.secondary">{t('panelNoFuelChanges')}</Typography>}
            {changes.slice(0, 6).map((change) => (
              <Row
                key={`${change.type}-${change.time}`}
                color={change.type === 'drain' ? theme.palette.error.main : theme.palette.success.main}
                primary={`${change.type === 'drain' ? t('fuelDrain') : t('fuelFill')} · ${change.amount} ${unit}`}
                secondary={`${dayjs(change.time).format('DD/MM HH:mm')} · ${change.before} → ${change.after} ${unit}`}
                right={change.type === 'drain' && (
                  <Button size="small" color="error" startIcon={<GavelIcon fontSize="small" />} onClick={() => navigate(`/reports/fuel/evidence?deviceId=${deviceId}&time=${change.time}&sensorId=${sensor.id}`)}>
                    {t('panelEvidence')}
                  </Button>
                )}
              />
            ))}
          </Section>
        </>
      )}
    </FloatingPanel>
  );
};

export default FuelPanel;
