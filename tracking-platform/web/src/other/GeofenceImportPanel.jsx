import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Alert, Box, Button, Checkbox, Chip, IconButton, InputAdornment, LinearProgress, List, ListItem, ListItemIcon, ListItemText,
  Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import maplibregl from 'maplibre-gl';
import { map } from '../map/core/MapView';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { geofencesActions } from '../store';
import { IMPORT_ACCEPT, readGeofenceFile } from './geofenceFormats';

const SOURCE = 'geofence-import-preview';

const TYPE_COLORS = { circle: '#1a9aa3', polygon: '#2563c9', line: '#e67e22' };

// Panel over the geofences map to import geofences from GeoJSON, KML/KMZ, Shapefile, GPX, CSV or WKT files: shows
// what was found on the map and in a list (type, simplified shapes, problems), lets the user choose which to import
// and the defaults for points (circle radius) and lines (corridor width), then creates them
const GeofenceImportPanel = ({ onClose }) => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const [file, setFile] = useState(null);
  const [pointRadius, setPointRadius] = useState(100);
  const [corridor, setCorridor] = useState(50);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${SOURCE}-fill`, type: 'fill', source: SOURCE, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'selected'], 0.18, 0.04] },
    });
    map.addLayer({
      id: `${SOURCE}-line`,
      type: 'line',
      source: SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 3, 1.5], 'line-opacity': ['case', ['get', 'selected'], 1, 0.4], 'line-dasharray': [2, 1] },
    });
    return () => {
      [`${SOURCE}-line`, `${SOURCE}-fill`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, []);

  const errorMessage = (code) => ({
    projection: t('geofenceImportProjection'),
    csvColumns: t('geofenceImportCsvColumns'),
    noShp: t('geofenceImportNoShp'),
    format: t('geofenceImportFormat'),
  }[code] || `${t('geofenceImportFormat')} (${code})`);

  useEffect(() => {
    if (!file) return;
    (async () => {
      try {
        setError(null);
        setResult(null);
        const found = await readGeofenceFile(file, { pointRadius: Number(pointRadius) || 100, corridor: Number(corridor) || 50, namePrefix: file.name.replace(/\.[^.]+$/, '') });
        setItems(found);
        setSelected((previous) => (found.length === items.length && Object.keys(previous).length ? previous
          : Object.fromEntries(found.map((item, index) => [index, !item.warnings.includes('projection')]))));
        if (!found.length) setError(t('geofenceImportEmpty'));
      } catch (exception) {
        setItems([]);
        setError(errorMessage(exception.message));
      }
    })();
  }, [file, pointRadius, corridor]);

  useEffect(() => {
    const features = items.filter((item) => !item.warnings.includes('projection')).map((item, index) => ({
      type: 'Feature', geometry: item.preview, properties: { color: TYPE_COLORS[item.type], selected: !!selected[items.indexOf(item)], index },
    }));
    map.getSource(SOURCE)?.setData({ type: 'FeatureCollection', features });
  }, [items, selected]);

  // fit the map to what was found when a file is read
  useEffect(() => {
    const points = items.filter((item) => !item.warnings.includes('projection'))
      .flatMap((item) => (item.preview.type === 'Polygon' ? item.preview.coordinates[0] : item.preview.coordinates));
    if (points.length) {
      const bounds = points.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 480 }, maxZoom: 16, duration: 0 });
    }
  }, [file, items.length]);

  const counts = useMemo(() => items.reduce((result, item) => ({ ...result, [item.type]: (result[item.type] || 0) + 1 }), {}), [items]);
  const chosen = items.filter((_, index) => selected[index]);

  const handleImport = async () => {
    setProgress(0);
    let created = 0;
    const failed = [];
    for (let i = 0; i < chosen.length; i += 1) {
      const item = chosen[i];
      try {
        await fetchOrThrow('/api/geofences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: item.name.slice(0, 128), description: item.description, area: item.area, attributes: item.attributes,
          }),
        });
        created += 1;
      } catch (exception) {
        failed.push(`${item.name}: ${exception.message}`);
      }
      setProgress(((i + 1) / chosen.length) * 100);
    }
    const response = await fetchOrThrow('/api/geofences');
    dispatch(geofencesActions.refresh(await response.json()));
    setProgress(null);
    setResult({ created, failed });
    setItems([]);
    setFile(null);
  };

  const typeLabel = (type) => ({ circle: t('geofenceCircle'), polygon: t('geofenceTypePolygon'), line: t('geofenceRoute') }[type]);
  const warningLabel = (warning) => ({ simplified: t('geofenceImportSimplified'), holes: t('geofenceImportHoles'), projection: t('geofenceImportProjectionShort') }[warning]);

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'absolute', top: 12, right: 56, width: 400, maxWidth: 'calc(100% - 80px)', maxHeight: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column', zIndex: 5, borderRadius: '18px',
        bgcolor: alpha(theme.palette.background.paper, 0.96), backdropFilter: 'blur(10px)',
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <UploadFileIcon color="primary" sx={{ mr: 1 }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>{t('geofenceImport')}</Typography>
        <IconButton size="small" aria-label={t('sharedHide')} onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack spacing={1.5} sx={{ px: 2, pb: 2, overflowY: 'auto' }}>
        {result && (
          <Alert severity={result.failed.length ? 'warning' : 'success'} onClose={() => setResult(null)}>
            {t('geofenceImportDone').replace('{0}', result.created)}
            {result.failed.map((line) => <Box key={line} sx={{ fontSize: 12 }}>{line}</Box>)}
          </Alert>
        )}
        <Box
          component="label"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]);
          }}
          sx={{
            border: `2px dashed ${alpha(theme.palette.primary.main, 0.35)}`, borderRadius: '14px', p: 2, textAlign: 'center', cursor: 'pointer', bgcolor: alpha(theme.palette.primary.main, 0.04), '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
          }}
        >
          <input hidden type="file" accept={IMPORT_ACCEPT} data-testid="geofence-import-file" onChange={(event) => { if (event.target.files[0]) setFile(event.target.files[0]); event.target.value = ''; }} />
          <Typography variant="body2" fontWeight={600} color="primary">{file ? file.name : t('geofenceImportChoose')}</Typography>
          <Typography variant="caption" color="text.secondary">GeoJSON · KML · KMZ · Shapefile (.zip) · GPX · CSV · WKT</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="number" label={t('geofenceImportPointRadius')} value={pointRadius} onChange={(event) => setPointRadius(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} />
          <TextField size="small" type="number" label={t('geofenceCorridor')} value={corridor} onChange={(event) => setCorridor(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }} />
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {items.length > 0 && (
          <>
            <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" fontWeight={700} sx={{ mr: 0.5 }}>{t('geofenceImportFound').replace('{0}', items.length)}</Typography>
              {Object.entries(counts).map(([type, count]) => (
                <Chip key={type} size="small" label={`${typeLabel(type)} ${count}`} sx={{ bgcolor: alpha(TYPE_COLORS[type], 0.12), color: TYPE_COLORS[type], fontWeight: 600 }} />
              ))}
              <Box sx={{ flexGrow: 1 }} />
              <Button size="small" onClick={() => setSelected(Object.fromEntries(items.map((item, index) => [index, chosen.length < items.length && !item.warnings.includes('projection')])))}>
                {chosen.length < items.length ? t('geofenceImportAll') : t('geofenceImportNone')}
              </Button>
            </Stack>
            <List dense disablePadding sx={{ maxHeight: 280, overflowY: 'auto', borderRadius: '12px', border: `1px solid ${theme.palette.divider}` }}>
              {items.map((item, index) => (
                <ListItem key={index} disablePadding sx={{ px: 1 }} divider={index < items.length - 1}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox size="small" edge="start" disabled={item.warnings.includes('projection')} checked={!!selected[index]} onChange={(event) => setSelected({ ...selected, [index]: event.target.checked })} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    secondary={[
                      typeLabel(item.type),
                      item.attributes.speedLimitKmh ? `${item.attributes.speedLimitKmh} km/h` : null,
                      item.type === 'line' ? `${t('geofenceCorridor')} ${item.attributes.polylineDistance} m` : null,
                    ].filter(Boolean).join(' · ')}
                    slotProps={{ primary: { noWrap: true, fontWeight: 600 } }}
                  />
                  {item.warnings.map((warning) => (
                    <Tooltip key={warning} title={warningLabel(warning)}>
                      <Chip size="small" variant="outlined" color={warning === 'projection' ? 'error' : 'warning'} label={warningLabel(warning)} sx={{ ml: 0.5, maxWidth: 110 }} />
                    </Tooltip>
                  ))}
                </ListItem>
              ))}
            </List>
            {progress !== null && <LinearProgress variant="determinate" value={progress} />}
            <Button variant="contained" disabled={!chosen.length || progress !== null} onClick={handleImport}>
              {t('geofenceImportCreate').replace('{0}', chosen.length)}
            </Button>
          </>
        )}
        {!items.length && !error && (
          <Typography variant="caption" color="text.secondary">{t('geofenceImportHelp')}</Typography>
        )}
      </Stack>
    </Paper>
  );
};

export default GeofenceImportPanel;
