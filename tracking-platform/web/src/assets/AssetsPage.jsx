import { useEffect, useId, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Autocomplete, Box, Card, Chip, Container, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import BatteryAlertIcon from '@mui/icons-material/BatteryAlert';
import maplibregl from 'maplibre-gl';
import dayjs from 'dayjs';
import MapView, { map } from '../map/core/MapView';
import { findFonts } from '../map/core/mapUtil';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import AssetDialog from './AssetDialog';

const STATUS_COLORS = { sleeping: '#2f9e5b', late: '#d9534f', noData: '#8a93a3' };
const batteryColor = (value, low) => {
  if (value == null) return '#8a93a3';
  if (value < low) return '#d9534f';
  if (value < low * 2) return '#e79a2b';
  return '#2f9e5b';
};

const AssetsMap = ({ assets }) => {
  const id = useId();
  useEffect(() => {
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: `${id}-points`, type: 'circle', source: id, paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 },
    });
    map.addLayer({
      id: `${id}-labels`, type: 'symbol', source: id, layout: { 'text-field': ['get', 'name'], 'text-font': findFonts(map), 'text-size': 11, 'text-offset': [0, -1.5] }, paint: { 'text-color': '#232a38', 'text-halo-color': '#fff', 'text-halo-width': 2 },
    });
    return () => {
      [`${id}-labels`, `${id}-points`].forEach((layer) => map.getLayer(layer) && map.removeLayer(layer));
      if (map.getSource(id)) map.removeSource(id);
    };
  }, []);
  useEffect(() => {
    const located = assets.filter((asset) => asset.latitude != null);
    map.getSource(id)?.setData({
      type: 'FeatureCollection',
      features: located.map((asset) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [asset.longitude, asset.latitude] }, properties: { name: asset.name, color: STATUS_COLORS[asset.status] },
      })),
    });
    if (located.length) {
      const bounds = located.reduce((box, asset) => box.extend([asset.longitude, asset.latitude]), new maplibregl.LngLatBounds([located[0].longitude, located[0].latitude], [located[0].longitude, located[0].latitude]));
      setTimeout(() => { map.resize(); map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 }); }, 150);
    }
  }, [assets.map((asset) => asset.deviceId).join()]);
  return null;
};

// Battery powered assets: asleep until the next expected report or late, battery with its trend and days left
const AssetsPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [assets, setAssets] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => setAssets(await (await fetch('/api/assets')).json());
  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const late = assets?.filter((asset) => asset.status === 'late').length || 0;
  const low = assets?.filter((asset) => asset.battery != null && asset.battery < asset.batteryLow).length || 0;
  const relative = (date) => {
    const minutes = dayjs(date).diff(dayjs(), 'minute');
    const abs = Math.abs(minutes);
    const text = abs >= 1440 ? `${Math.round(abs / 1440)} d` : abs >= 60 ? `${Math.round(abs / 60)} h` : `${abs} min`;
    return minutes >= 0 ? `${t('assetsIn')} ${text}` : `${t('assetsAgo')} ${text}`;
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('assetsTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('assetsSubtitle')}</Typography>
        </Box>
        {assets && (
          <Stack direction="row" spacing={1}>
            <Chip label={`${assets.length} ${t('assetsCount')}`} />
            <Chip color={late ? 'error' : 'default'} label={`${late} ${t('assetsLate')}`} />
            <Chip color={low ? 'warning' : 'default'} icon={<BatteryAlertIcon />} label={`${low} ${t('assetsLowBattery')}`} />
          </Stack>
        )}
        {!readonly && (
          <Autocomplete
            size="small"
            sx={{ minWidth: 240 }}
            options={devices.filter((device) => !assets?.some((asset) => asset.deviceId === device.id))}
            getOptionLabel={(option) => option.name}
            onChange={(_, device) => device && setEditing({ device })}
            renderInput={(params) => <TextField {...params} label={t('assetsAdd')} />}
          />
        )}
      </Stack>
      {!assets && <LinearProgress />}
      {assets && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' } }}>
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('sharedDevice')}</TableCell>
                  <TableCell>{t('assetsStatus')}</TableCell>
                  <TableCell>{t('assetsLastReport')}</TableCell>
                  <TableCell>{t('assetsNextReport')}</TableCell>
                  <TableCell sx={{ minWidth: 150 }}>{t('assetsBattery')}</TableCell>
                  <TableCell align="right">{t('assetsDaysLeft')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.deviceId} hover sx={{ cursor: readonly ? 'default' : 'pointer' }} onClick={() => !readonly && setEditing({ device: { id: asset.deviceId, name: asset.name }, asset })}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{asset.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{`${t('assetsEvery')} ${asset.reportHours} h`}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" label={t(`assetsStatus${asset.status.charAt(0).toUpperCase()}${asset.status.slice(1)}`)} sx={{ bgcolor: `${STATUS_COLORS[asset.status]}22`, color: STATUS_COLORS[asset.status], fontWeight: 700 }} /></TableCell>
                    <TableCell>
                      {asset.lastReport ? (
                        <>
                          <Typography variant="body2">{dayjs(asset.lastReport).format('DD/MM HH:mm')}</Typography>
                          <Typography variant="caption" color="text.secondary">{relative(asset.lastReport)}</Typography>
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {asset.nextReport ? (
                        <>
                          <Typography variant="body2" sx={{ color: asset.status === 'late' ? '#d9534f' : undefined, fontWeight: asset.status === 'late' ? 700 : 400 }}>{dayjs(asset.nextReport).format('DD/MM HH:mm')}</Typography>
                          <Typography variant="caption" color="text.secondary">{relative(asset.nextReport)}</Typography>
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {asset.battery != null ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ flexGrow: 1 }}>
                            <LinearProgress variant="determinate" value={asset.battery} sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: batteryColor(asset.battery, asset.batteryLow) } }} />
                          </Box>
                          <Typography variant="body2" fontWeight={700} sx={{ width: 44, textAlign: 'right' }}>{`${Math.round(asset.battery)}%`}</Typography>
                        </Stack>
                      ) : '—'}
                      {asset.dropPerDay != null && <Typography variant="caption" color="text.secondary">{`−${asset.dropPerDay}% / ${t('assetsDay')}`}</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={700} sx={{ color: asset.daysLeft != null && asset.daysLeft < 15 ? '#d9534f' : undefined }}>{asset.daysLeft != null ? `${asset.daysLeft} d` : '—'}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {!assets.length && (
                  <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{t('assetsEmpty')}</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 4, height: { xs: 320, lg: 'auto' }, minHeight: 320, position: 'relative', overflow: 'hidden' }}>
            <MapView>
              <AssetsMap assets={assets} />
            </MapView>
          </Card>
        </Box>
      )}
      {editing && <AssetDialog device={editing.device} asset={editing.asset} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Container>
  );
};

export default AssetsPage;
