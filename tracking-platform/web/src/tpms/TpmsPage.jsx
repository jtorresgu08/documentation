import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Autocomplete, Box, Button, Card, CardActionArea, Chip, Container, Grid, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import TireDiagram, { TIRE_COLORS } from './TireDiagram';
import TpmsConfigDialog from './TpmsConfigDialog';

const LINE_COLORS = ['#2563c9', '#e67e22', '#2f9e5b', '#8e44ad', '#d9534f', '#1a9aa3', '#c0a000', '#5d6d7e', '#ff6f91', '#3b8686'];

// Tire pressure of the fleet: every vehicle with its tires colored by state; the selected one in large with pressure
// and temperature per tire, setup and the last 24 hours
const TpmsPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [fleet, setFleet] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const items = await (await fetch('/api/tpms')).json();
    items.sort((a, b) => (b.alarms || 0) - (a.alarms || 0) || a.name.localeCompare(b.name));
    setFleet(items);
    setSelectedId((current) => current || items[0]?.deviceId || null);
  };
  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const selected = fleet?.find((item) => item.deviceId === selectedId);
  useEffect(() => {
    if (!selectedId) return;
    setHistory(null);
    fetch(`/api/tpms/${selectedId}/history?from=${encodeURIComponent(dayjs().subtract(24, 'hour').toISOString())}&to=${encodeURIComponent(dayjs().toISOString())}`)
      .then((response) => response.json()).then(setHistory);
  }, [selectedId]);

  const statusLabel = (status) => t(`tpmsStatus${status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`);
  const unconfigured = devices.filter((device) => !fleet?.some((item) => item.deviceId === device.id));

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('tpmsTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('tpmsSubtitle')}</Typography>
        </Box>
        {!readonly && (
          <Autocomplete
            size="small"
            sx={{ minWidth: 260 }}
            options={unconfigured}
            getOptionLabel={(option) => option.name}
            onChange={(_, device) => device && setEditing({ device })}
            renderInput={(params) => <TextField {...params} label={t('tpmsAddVehicle')} />}
          />
        )}
      </Stack>
      {!fleet && <LinearProgress />}
      {fleet && !fleet.length && <Typography color="text.secondary">{t('tpmsEmpty')}</Typography>}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Stack spacing={1}>
            {fleet?.map((item) => (
              <Card key={item.deviceId} variant="outlined" sx={{ borderRadius: 3, borderColor: item.deviceId === selectedId ? 'primary.main' : undefined }}>
                <CardActionArea onClick={() => setSelectedId(item.deviceId)} sx={{ p: 1.25 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ transform: 'scale(0.8)', transformOrigin: 'left center', width: 100 }}>
                      <TireDiagram config={item.config} wheels={item.wheels} unit={item.config.unit} t={t} />
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography fontWeight={700} noWrap>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.fixTime ? dayjs(item.fixTime).format('DD/MM HH:mm') : t('tpmsNoData')}</Typography>
                    </Box>
                    <Chip size="small" color={item.alarms ? 'error' : 'success'} label={item.alarms ? `${item.alarms} ${t('tpmsAlerts')}` : 'OK'} />
                  </Stack>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7, lg: 8 }}>
          {selected && (
            <Stack spacing={2}>
              <Card variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
                <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{selected.name}</Typography>
                  {!readonly && <Button startIcon={<SettingsIcon />} onClick={() => setEditing({ device: { id: selected.deviceId, name: selected.name }, config: selected.config })}>{t('tpmsConfigure')}</Button>}
                </Stack>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, alignItems: 'start' }}>
                  <TireDiagram config={selected.config} wheels={selected.wheels} size="large" unit={selected.config.unit} t={t} />
                  <Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                      {['ok', 'low', 'high', 'hot', 'no_data'].map((status) => (
                        <Chip key={status} size="small" label={statusLabel(status)} sx={{ bgcolor: `${TIRE_COLORS[status]}22`, color: TIRE_COLORS[status], fontWeight: 700 }} />
                      ))}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {`${t('tpmsRange')}: ${selected.config.minPressure}–${selected.config.maxPressure} ${selected.config.unit} · ${t('tpmsMaxTemperature')} ${selected.config.maxTemperature} °C`}
                    </Typography>
                    {selected.wheels.filter((wheel) => wheel.status !== 'ok').map((wheel) => (
                      <Stack key={wheel.number} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: TIRE_COLORS[wheel.status] }} />
                        <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>{`${wheel.number}. ${wheel.name}`}</Typography>
                        <Typography variant="body2" sx={{ color: TIRE_COLORS[wheel.status], fontWeight: 700 }}>
                          {`${statusLabel(wheel.status)}${wheel.pressure != null ? ` · ${wheel.pressure} ${selected.config.unit}` : ''}${wheel.temperature != null ? ` · ${wheel.temperature} °C` : ''}`}
                        </Typography>
                      </Stack>
                    ))}
                  </Box>
                </Box>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>{t('tpmsHistory')}</Typography>
                {!history && <LinearProgress />}
                {history && (
                  <Box sx={{ height: 260 }}>
                    <ResponsiveContainer>
                      <LineChart data={history.points.map((point) => ({ ...point, label: dayjs(point.time).format('HH:mm') }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={11} minTickGap={30} />
                        <YAxis fontSize={11} domain={['auto', 'auto']} unit={` ${selected.config.unit}`} width={70} />
                        <ChartTooltip />
                        <Legend />
                        <ReferenceLine y={selected.config.minPressure} stroke="#d9534f" strokeDasharray="4 4" />
                        <ReferenceLine y={selected.config.maxPressure} stroke="#e67e22" strokeDasharray="4 4" />
                        {selected.wheels.map((wheel, index) => (
                          <Line key={wheel.number} dataKey={`p${wheel.number}`} name={`${wheel.number}. ${wheel.name}`} stroke={LINE_COLORS[index % LINE_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                )}
              </Card>
            </Stack>
          )}
        </Grid>
      </Grid>
      {editing && (
        <TpmsConfigDialog
          device={editing.device}
          initial={editing.config}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); setSelectedId(saved.deviceId); load(); }}
        />
      )}
    </Container>
  );
};

export default TpmsPage;
