import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, Chip, IconButton, LinearProgress, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BarChartIcon from '@mui/icons-material/BarChart';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import MapView from '../map/core/MapView';
import MapScale from '../map/MapScale';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import LineDiagram from './LineDiagram';
import TransitMap from './TransitMap';
import RouteDialog from './RouteDialog';

const km = (meters) => (meters === undefined || meters === null ? '—' : meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`);

// Public transport panel: lines on the left; for the selected line the strip with the buses and the distance between
// consecutive ones, the map and the table of units (progress, next stop, bus ahead and behind, delay, lap)
const TransitPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const readonly = useRestriction('readonly');
  const [routes, setRoutes] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [live, setLive] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);

  const loadRoutes = async () => {
    const response = await fetch('/api/transit/routes');
    if (response.ok) {
      const items = await response.json();
      setRoutes(items);
      setRouteId((current) => current || items[0]?.id || null);
    }
  };

  useEffect(() => {
    loadRoutes();
  }, []);

  useEffect(() => {
    if (!routeId) return undefined;
    setLive(null);
    const load = async () => {
      const response = await fetch(`/api/transit/routes/${routeId}/live`);
      if (response.ok) setLive(await response.json());
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [routeId]);

  const route = routes?.find((item) => item.id === routeId);
  const summary = live?.summary;
  const remove = async () => {
    await fetch(`/api/transit/routes/${routeId}`, { method: 'DELETE' });
    setRouteId(null);
    loadRoutes();
  };

  const cell = (name, meters, minutes, tone) => (
    <TableCell sx={{ color: tone, minWidth: 130 }}>
      {name ? (
        <>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>{name}</Typography>
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontWeight: tone ? 700 : 400, color: tone || 'text.secondary' }}>{`${km(meters)} · ${minutes} min`}</Typography>
        </>
      ) : '—'}
    </TableCell>
  );

  const kpi = (label, value, detail, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 112, p: 1.25, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>{value ?? '—'}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Card>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
      <Paper square sx={{ width: { md: 300 }, display: 'flex', flexDirection: 'column', zIndex: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2, pb: 1 }}>
          <IconButton edge="start" onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{t('transitTitle')}</Typography>
          <Tooltip title={t('transitReport')}><IconButton onClick={() => navigate(`/reports/transit${routeId ? `?routeId=${routeId}` : ''}`)}><BarChartIcon /></IconButton></Tooltip>
        </Stack>
        {!readonly && <Button sx={{ mx: 2, mb: 1 }} variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>{t('transitNewLine')}</Button>}
        <Box sx={{ overflowY: 'auto', px: 1.5, pb: 1.5 }}>
          {!routes && <LinearProgress />}
          {routes && !routes.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('transitNoLines')}</Typography>}
          <Stack spacing={1}>
            {routes?.map((item) => (
              <Paper
                key={item.id}
                variant="outlined"
                onClick={() => setRouteId(item.id)}
                sx={{
                  p: 1.25, borderRadius: 3, cursor: 'pointer', borderLeft: `5px solid ${item.color || '#2563c9'}`, bgcolor: item.id === routeId ? alpha(item.color || '#2563c9', 0.08) : undefined,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  {item.code && <Chip size="small" label={item.code} sx={{ bgcolor: item.color, color: '#fff', fontWeight: 700 }} />}
                  <Typography variant="body2" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>{item.name}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {`${item.stops.length} ${t('transitStopsLower')} · ${item.deviceIds.length} ${t('transitUnitsLower')}${item.circular ? ` · ${t('transitCircularShort')}` : ''}`}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Paper>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
        {route && (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <DirectionsBusIcon sx={{ color: route.color }} />
              <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{`${route.code ? `${route.code} · ` : ''}${route.name}`}</Typography>
              {!readonly && <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setEditing(route)}>{t('sharedEdit')}</Button>}
              {!readonly && <IconButton onClick={remove}><DeleteIcon /></IconButton>}
            </Stack>
            {!live && <LinearProgress />}
            {summary && (
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {kpi(t('transitRunning'), `${summary.running} / ${summary.units}`, `${summary.lengthKm} km`, '#2563c9')}
                {kpi(t('transitFrequencyShort'), summary.plannedHeadwayMinutes ? `${summary.plannedHeadwayMinutes} min` : null, summary.plannedGapKm ? `≈ ${summary.plannedGapKm} km` : t('transitNoSchedule'))}
                {kpi(t('transitRealSpacing'), summary.averageGapKm != null ? `${summary.averageGapKm} km` : null, summary.minGapKm != null ? `${summary.minGapKm} – ${summary.maxGapKm} km` : null, '#2f9e5b')}
                {kpi(t('transitBunching'), summary.bunching, `< ${summary.bunchingKm} km`, summary.bunching ? '#d9534f' : undefined)}
                {kpi(t('transitGaps'), summary.gaps, summary.gapKm ? `> ${summary.gapKm} km` : null, summary.gaps ? '#e79a2b' : undefined)}
                {kpi(t('transitOffRoute'), summary.offRoute, null, summary.offRoute ? '#d9534f' : undefined)}
              </Stack>
            )}
            {live && (
              <Card variant="outlined" sx={{ borderRadius: 4, pt: 2, pb: 1, overflowX: 'auto' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ px: 2 }}>{t('transitLineView')}</Typography>
                <Box sx={{ minWidth: 640 }}>
                  <LineDiagram live={live} color={route.color} circular={route.circular} selectedId={selectedId} onSelect={setSelectedId} t={t} />
                </Box>
              </Card>
            )}
            <Card variant="outlined" sx={{ borderRadius: 4, height: 340, position: 'relative', overflow: 'hidden' }}>
              {live && (
                <MapView>
                  <TransitMap path={route.path} stops={live.stops} units={live.units} color={route.color} selectedId={selectedId} fitKey={route.id} />
                </MapView>
              )}
              <MapScale />
            </Card>
            {live && (
              <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('sharedDevice')}</TableCell>
                      <TableCell align="right">{t('transitProgress')}</TableCell>
                      <TableCell>{t('transitNextStop')}</TableCell>
                      <TableCell>{t('transitAhead')}</TableCell>
                      <TableCell>{t('transitBehind')}</TableCell>
                      <TableCell align="right">{t('transitDelay')}</TableCell>
                      <TableCell align="right">{t('transitLap')}</TableCell>
                      <TableCell align="right">km/h</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...live.units].sort((a, b) => (b.along ?? -1) - (a.along ?? -1)).map((unit) => {
                      let status = null;
                      if (!unit.active) status = <Chip size="small" label={t('transitInactive')} />;
                      else if (unit.offRoute) status = <Chip size="small" color="error" label={`${t('transitOffRoute')} ${unit.offset ?? ''} m`} />;
                      const gapColor = (meters) => {
                        if (meters === undefined) return undefined;
                        if (meters < summary.bunchingKm * 1000) return '#d9534f';
                        if (summary.gapKm && meters > summary.gapKm * 1000) return '#e79a2b';
                        return undefined;
                      };
                      return (
                        <TableRow key={unit.deviceId} hover selected={unit.deviceId === selectedId} onClick={() => setSelectedId(unit.deviceId)} sx={{ cursor: 'pointer' }}>
                          <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            <div>{unit.name}</div>
                            {status}
                          </TableCell>
                          <TableCell align="right">{unit.progress != null ? `${unit.progress}%` : '—'}</TableCell>
                          {cell(unit.nextStopName, unit.nextStopMeters, unit.nextStopMinutes)}
                          {cell(unit.aheadName, unit.aheadMeters, unit.aheadMinutes, gapColor(unit.aheadMeters))}
                          {cell(unit.behindName, unit.behindMeters, unit.behindMinutes, gapColor(unit.behindMeters))}
                          <TableCell align="right" sx={{ color: unit.delayMinutes > 3 ? '#d9534f' : undefined }}>{unit.delayMinutes != null ? `${unit.delayMinutes > 0 ? '+' : ''}${unit.delayMinutes} min` : '—'}</TableCell>
                          <TableCell align="right">{unit.lap || '—'}</TableCell>
                          <TableCell align="right">{unit.speed ?? '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </Stack>
        )}
      </Box>
      {editing && (
        <RouteDialog
          route={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); loadRoutes().then(() => setRouteId(saved.id)); }}
        />
      )}
    </Box>
  );
};

export default TransitPage;
