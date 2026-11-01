import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Container, Grid, LinearProgress, Link, Stack, Table, TableBody, TableCell, TableRow,
  Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import useQuery from '../common/util/useQuery';
import { useBrandAttribute } from '../common/util/brand';
import { INFO_PREFIX } from '../common/util/sensors';
import FuelChart from './fuel/FuelChart';
import FuelEventsMap from './fuel/FuelEventsMap';

const WINDOW_BEFORE = 3 * 3600 * 1000;
const WINDOW_AFTER = 3 * 3600 * 1000;
const MEDIA_BEFORE = 15 * 60 * 1000;
const MEDIA_AFTER = 45 * 60 * 1000;

const Row = ({ label, value }) => (
  <TableRow>
    <TableCell sx={{ color: 'text.secondary', width: '42%', py: 0.75 }}>{label}</TableCell>
    <TableCell sx={{ fontWeight: 600, py: 0.75 }}>{value ?? '—'}</TableCell>
  </TableRow>
);

// Printable evidence of a fuel drain: unit, event details, level chart around it, place, dashcam photos and room
// for the reviewer's signature. Print or save as PDF from the browser.
const FuelEvidencePage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const query = useQuery();
  const brandName = useBrandAttribute('title');
  const brandLogo = useBrandAttribute('logo');
  const geocoderEnabled = useSelector((state) => state.session.server.geocoderEnabled);
  const user = useSelector((state) => state.session.user);

  const deviceId = Number(query.get('deviceId'));
  const time = Number(query.get('time'));
  const sensorId = query.get('sensorId');
  const device = useSelector((state) => state.devices.items[deviceId]);

  const [report, setReport] = useState(null);
  const [media, setMedia] = useState([]);
  const [address, setAddress] = useState(null);
  const [error, setError] = useState(null);

  const change = report?.changes?.find((item) => item.time === time);

  const load = useCatch(async () => {
    const params = new URLSearchParams({
      deviceId, from: new Date(time - WINDOW_BEFORE).toISOString(), to: new Date(time + WINDOW_AFTER).toISOString(),
    });
    if (sensorId) {
      params.append('sensorId', sensorId);
    }
    const result = await (await fetchOrThrow(`/api/sensors/fuel?${params}`)).json();
    setReport(result);
    const found = result.changes.find((item) => item.time === time);
    if (!found) {
      setError(t('evidenceNotFound'));
      return;
    }
    const mediaParams = new URLSearchParams({
      deviceId, type: 'media', from: new Date(time - MEDIA_BEFORE).toISOString(), to: new Date(found.endTime + MEDIA_AFTER).toISOString(),
    });
    const events = await (await fetchOrThrow(`/api/reports/events?${mediaParams}`, { headers: { Accept: 'application/json' } })).json();
    setMedia(events.filter((event) => event.attributes.file).map((event) => ({
      id: event.id, time: event.eventTime, type: event.attributes.media, file: event.attributes.file,
    })));
    if (geocoderEnabled) {
      const response = await fetch(`/api/server/geocode?latitude=${found.latitude}&longitude=${found.longitude}`);
      if (response.ok) {
        setAddress(await response.text());
      }
    }
  });

  useEffect(() => {
    if (deviceId && time) {
      load();
    }
  }, [deviceId, time]);

  const points = useMemo(() => report?.points || [], [report]);
  const events = useMemo(() => (change ? [{
    key: change.time, kind: change.type, latitude: change.latitude, longitude: change.longitude, title: `−${change.amount.toFixed(1)} ${report?.sensor?.unit || 'L'}`,
  }] : []), [change, report]);

  if (error) {
    return <Container sx={{ py: 3 }}><Alert severity="warning">{error}</Alert></Container>;
  }
  if (!report || !change || !device) {
    return <LinearProgress />;
  }

  const unit = report.sensor.unit || 'L';
  const info = (key) => device.attributes?.[INFO_PREFIX + key];
  const minutes = Math.max(1, Math.round((change.endTime - change.time) / 60000));
  const mediaUrl = (file) => `/api/media/${device.uniqueId}/${file}`;
  const images = media.filter((item) => item.type === 'image');
  const videos = media.filter((item) => item.type === 'video');
  const reference = `EV-${device.id}-${dayjs(change.time).format('YYYYMMDDHHmm')}`;

  return (
    <Container
      maxWidth="md"
      sx={{
        py: 3,
        '@media print': { py: 0, '& .no-print': { display: 'none !important' }, '& .MuiCard-root': { breakInside: 'avoid', boxShadow: 'none' } },
      }}
    >
      <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>{t('sharedBack')}</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>{t('evidencePrint')}</Button>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2, pb: 2, borderBottom: `3px solid ${theme.palette.error.main}` }}>
        {brandLogo && <Box component="img" src={brandLogo} alt="" sx={{ height: 44 }} />}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('evidenceTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{brandName}</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2" fontWeight={700}>{reference}</Typography>
          <Typography variant="caption" color="text.secondary">
            {`${t('evidenceGenerated')} ${dayjs().format('YYYY-MM-DD HH:mm')} · ${user?.name || ''}`}
          </Typography>
        </Box>
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2, bgcolor: alpha(theme.palette.error.main, 0.05), borderColor: alpha(theme.palette.error.main, 0.4) }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{
            width: 52, height: 52, borderRadius: 2, bgcolor: 'error.main', color: 'common.white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          >
            <ArrowDownwardIcon fontSize="large" />
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" fontWeight={800} color="error.main">{`−${change.amount.toFixed(1)} ${unit}`}</Typography>
            <Typography variant="body2">
              {`${dayjs(change.time).format('dddd DD MMM YYYY, HH:mm')} · ${minutes} min · ${t('evidenceStopped')}`}
            </Typography>
          </Box>
        </Stack>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="primary" sx={{ px: 2, pt: 1.5 }}>{t('unitInfoVehicle')}</Typography>
            <Table size="small">
              <TableBody>
                <Row label={t('sharedName')} value={device.name} />
                <Row label={t('unitInfoPlate')} value={info('plate')} />
                <Row label={t('unitInfoVin')} value={info('vin')} />
                <Row label={t('unitInfoVehicleModel')} value={[info('brand'), info('vehicleModel'), info('year')].filter(Boolean).join(' ') || null} />
                <Row label={t('deviceIdentifier')} value={device.uniqueId} />
                <Row label={t('fuelSensor')} value={report.sensor.name} />
              </TableBody>
            </Table>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="primary" sx={{ px: 2, pt: 1.5 }}>{t('evidenceEvent')}</Typography>
            <Table size="small">
              <TableBody>
                <Row label={t('reportStartTime')} value={dayjs(change.time).format('YYYY-MM-DD HH:mm:ss')} />
                <Row label={t('reportEndTime')} value={dayjs(change.endTime).format('YYYY-MM-DD HH:mm:ss')} />
                <Row label={t('fuelBefore')} value={`${change.before.toFixed(1)} ${unit}`} />
                <Row label={t('fuelAfter')} value={`${change.after.toFixed(1)} ${unit}`} />
                <Row label={t('fuelPlace')} value={address || `${change.latitude.toFixed(6)}, ${change.longitude.toFixed(6)}`} />
                <Row
                  label={t('evidenceCoordinates')}
                  value={(
                    <Link href={`https://www.google.com/maps?q=${change.latitude},${change.longitude}`} target="_blank" rel="noreferrer">
                      {`${change.latitude.toFixed(6)}, ${change.longitude.toFixed(6)}`}
                    </Link>
                  )}
                />
              </TableBody>
            </Table>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>{t('evidenceChart')}</Typography>
        <FuelChart points={points} changes={[change]} unit={unit} scale={1} reviews={{}} selected={change.time} height={260} />
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>{t('fuelEventsMap')}</Typography>
        <Box sx={{ height: 280, borderRadius: 1.5, overflow: 'hidden', position: 'relative' }}>
          <FuelEventsMap deviceId={deviceId} points={points} events={events} selected={change.time} />
        </Box>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 2, p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>{t('evidenceMedia')}</Typography>
        {images.length ? (
          <Grid container spacing={1.5}>
            {images.map((item) => (
              <Grid key={item.id} size={{ xs: 6, sm: 4 }}>
                <Box component="img" src={mediaUrl(item.file)} alt="" sx={{ width: '100%', borderRadius: 1, display: 'block', bgcolor: '#111' }} />
                <Typography variant="caption" color="text.secondary">{dayjs(item.time).format('YYYY-MM-DD HH:mm:ss')}</Typography>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography variant="body2" color="text.secondary">{t('evidenceNoMedia')}</Typography>
        )}
        {videos.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 1.5 }}>
            {videos.map((item) => (
              <Link key={item.id} href={mediaUrl(item.file)} target="_blank" rel="noreferrer">
                {`${t('evidenceVideo')} ${dayjs(item.time).format('HH:mm:ss')}`}
              </Link>
            ))}
          </Stack>
        )}
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
        <Typography variant="subtitle2" color="primary" gutterBottom>{t('evidenceReview')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>{t('evidenceNotes')}</Typography>
        <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}`, mb: 4 }} />
        <Grid container spacing={4}>
          {['evidenceReviewer', 'evidenceDriver'].map((key) => (
            <Grid key={key} size={6}>
              <Box sx={{ borderTop: `1px solid ${theme.palette.text.primary}`, pt: 0.5, mt: 5 }}>
                <Typography variant="caption">{t(key)}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Card>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>{t('evidenceDisclaimer')}</Typography>
    </Container>
  );
};

export default FuelEvidencePage;
