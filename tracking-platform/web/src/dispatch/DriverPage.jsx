import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, LinearProgress, MenuItem,
  Stack, Switch, TextField, Typography,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PaymentsIcon from '@mui/icons-material/Payments';
import { alpha, useTheme } from '@mui/material/styles';
import PhoneIcon from '@mui/icons-material/Phone';
import NavigationIcon from '@mui/icons-material/Navigation';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PlaceIcon from '@mui/icons-material/Place';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useBrandAttribute } from '../common/util/brand';
import {
  FAILURE_REASONS, PAYMENT_METHODS, STOP_COLORS, compressImage, formatHour, formatWindow, money, splitList, stopLabel, tripLabel, typeLabel,
} from './dispatchUtils';
import SignaturePad from './SignaturePad';
import ScanDialog from './ScanDialog';

const locate = () => new Promise((resolve) => {
  if (!navigator.geolocation) {
    resolve({});
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (result) => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude }),
    () => resolve({}),
    { enableHighAccuracy: true, timeout: 5000 },
  );
});

// Driver page (link without account, made for the phone): the stops in order, call and navigate, and report the
// arrival, the delivery (recipient, photo, signature, location) or why it could not be delivered
const DriverPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const { token } = useParams();
  const brandLogo = useBrandAttribute('logo');
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [delivering, setDelivering] = useState(null);
  const [failing, setFailing] = useState(null);
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [checked, setChecked] = useState([]);
  const [scanned, setScanned] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [collected, setCollected] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [partial, setPartial] = useState(false);
  const [signature, setSignature] = useState(null);
  const [reason, setReason] = useState(FAILURE_REASONS[0]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/dispatch/driver/${token}`);
    if (response.ok) setTrip(await response.json());
    else setError(t('dispatchLinkInvalid'));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const post = async (path, body) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/dispatch/driver/${token}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
      });
      if (!response.ok) throw new Error(t('dispatchSendError'));
      setTrip(await response.json());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const report = async (stop, status, extra = {}) => post(`/stops/${stop.id}`, { status, ...(await locate()), ...extra });

  const openDelivery = (stop) => {
    setRecipient(stop.contact || '');
    setNotes('');
    setPhotos([]);
    setSignature(null);
    setChecked([]);
    setScanned([]);
    setCollected(stop.attributes?.codAmount ? String(stop.attributes.codAmount) : '');
    setMethod(PAYMENT_METHODS[0]);
    setPartial(false);
    setDelivering(stop);
  };

  if (!trip) {
    return <Box sx={{ p: 3 }}>{error ? <Alert severity="error">{error}</Alert> : <LinearProgress />}</Box>;
  }

  const done = trip.stops.filter((stop) => ['delivered', 'failed', 'skipped'].includes(stop.status)).length;
  const current = trip.stops.find((stop) => stop.status === 'pending' || stop.status === 'arrived');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f1f4f9', pb: 4 }}>
      <Box sx={{ background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`, color: '#fff', px: 2, pt: 2, pb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {brandLogo && <Box component="img" src={brandLogo} alt="" sx={{ height: 28, bgcolor: '#fff', borderRadius: 1, p: 0.25 }} />}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} noWrap>{trip.name}</Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>{[trip.deviceName, trip.driverName].filter(Boolean).join(' · ')}</Typography>
          </Box>
          <Chip size="small" label={tripLabel(t, trip.status)} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} />
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={(done / trip.stops.length) * 100} sx={{ flexGrow: 1, height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.25)', '& .MuiLinearProgress-bar': { bgcolor: '#9fe3e6' } }} />
          <Typography variant="body2" fontWeight={700}>{`${done}/${trip.stops.length}`}</Typography>
        </Stack>
      </Box>
      <Stack spacing={1.5} sx={{ px: 1.5, mt: -1.5, maxWidth: 560, mx: 'auto' }}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {trip.status === 'planned' && (
          <Button variant="contained" size="large" disabled={busy} onClick={() => post('/start')} sx={{ borderRadius: 3, py: 1.5 }}>{t('dispatchStartTrip')}</Button>
        )}
        {trip.status === 'completed' && <Alert severity="success">{t('dispatchTripDone')}</Alert>}
        {trip.stops.map((stop) => {
          const active = current && stop.id === current.id;
          const finished = ['delivered', 'failed', 'skipped'].includes(stop.status);
          return (
            <Card key={stop.id} sx={{ borderRadius: 4, p: 2, boxShadow: active ? `0 8px 24px ${alpha(theme.palette.primary.main, 0.18)}` : 'none', border: active ? `2px solid ${theme.palette.primary.main}` : '1px solid #e4e8ef', opacity: finished ? 0.75 : 1 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{
                  width: 32, height: 32, borderRadius: '50%', bgcolor: STOP_COLORS[stop.status], color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flexShrink: 0,
                }}
                >
                  {stop.sequence}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography fontWeight={700} sx={{ flexGrow: 1 }}>{stop.name}</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: STOP_COLORS[stop.status] }}>{stopLabel(t, stop.status)}</Typography>
                  </Stack>
                  {stop.address && <Typography variant="body2" color="text.secondary">{stop.address}</Typography>}
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {stop.attributes?.type && stop.attributes.type !== 'delivery' && <Chip size="small" color="secondary" label={typeLabel(t, stop.attributes.type)} />}
                    {stop.attributes?.codAmount > 0 && <Chip size="small" color="warning" icon={<PaymentsIcon />} label={`${t('dispatchCollect')} ${money(stop.attributes.codAmount)}`} />}
                    {stop.attributes?.packages && <Chip size="small" variant="outlined" label={`${splitList(stop.attributes.packages).length} ${t('dispatchPackagesLower')}`} />}
                  </Stack>
                  <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {formatWindow(stop) && (
                      <Stack direction="row" spacing={0.5} alignItems="center"><ScheduleIcon sx={{ fontSize: 15 }} color="action" /><Typography variant="caption">{formatWindow(stop)}</Typography></Stack>
                    )}
                    {stop.contact && <Typography variant="caption">{stop.contact}</Typography>}
                    {finished && stop.completedTime && <Typography variant="caption">{formatHour(stop.completedTime)}</Typography>}
                  </Stack>
                  {stop.notes && <Typography variant="caption" color="text.secondary" component="div">{stop.notes}</Typography>}
                  {active && trip.status !== 'cancelled' && (
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      <Stack direction="row" spacing={1}>
                        {stop.phone && <Button variant="outlined" startIcon={<PhoneIcon />} href={`tel:${stop.phone}`} sx={{ flex: 1, borderRadius: 2 }}>{t('dispatchCall')}</Button>}
                        <Button variant="outlined" startIcon={<NavigationIcon />} target="_blank" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`} sx={{ flex: 1, borderRadius: 2 }}>{t('dispatchNavigate')}</Button>
                      </Stack>
                      {stop.status === 'pending' && (
                        <Button variant="outlined" color="warning" startIcon={<PlaceIcon />} disabled={busy} onClick={() => report(stop, 'arrived')} sx={{ borderRadius: 2 }}>{t('dispatchIArrived')}</Button>
                      )}
                      <Stack direction="row" spacing={1}>
                        <Button variant="contained" color="success" startIcon={<CheckCircleIcon />} disabled={busy} onClick={() => openDelivery(stop)} sx={{ flex: 1, borderRadius: 2, py: 1.25, whiteSpace: 'nowrap' }}>{t(stop.attributes?.type === 'service' ? 'dispatchFinishService' : stop.attributes?.type === 'pickup' ? 'dispatchPickedUp' : 'dispatchDelivered')}</Button>
                        <Button variant="contained" color="error" startIcon={<CancelIcon />} disabled={busy} onClick={() => setFailing(stop)} sx={{ flex: 1, borderRadius: 2, whiteSpace: 'nowrap' }}>{t('dispatchNotDelivered')}</Button>
                      </Stack>
                    </Stack>
                  )}
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      <Dialog open={!!delivering} onClose={() => setDelivering(null)} fullWidth>
        <DialogTitle>{`${t('dispatchProofTitle')} · ${delivering?.name || ''}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label={t('dispatchRecipient')} value={recipient} onChange={(event) => setRecipient(event.target.value)} />
            {delivering?.attributes?.checklist && (
              <Box>
                <Typography variant="body2" fontWeight={600}>{`${t('dispatchChecklist')} (${checked.length}/${splitList(delivering.attributes.checklist, /\n+/).length})`}</Typography>
                {splitList(delivering.attributes.checklist, /\n+/).map((task) => (
                  <FormControlLabel key={task} sx={{ display: 'flex' }} control={<Checkbox checked={checked.includes(task)} onChange={(event) => setChecked(event.target.checked ? [...checked, task] : checked.filter((item) => item !== task))} />} label={task} />
                ))}
              </Box>
            )}
            {delivering?.attributes?.packages && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>{`${t('dispatchPackages')} (${scanned.length}/${splitList(delivering.attributes.packages).length})`}</Typography>
                  <Button size="small" startIcon={<QrCodeScannerIcon />} onClick={() => setScanning(true)}>{t('dispatchScan')}</Button>
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {splitList(delivering.attributes.packages).map((code) => <Chip key={code} size="small" label={code} color={scanned.includes(code) ? 'success' : 'default'} variant={scanned.includes(code) ? 'filled' : 'outlined'} onClick={() => setScanned(scanned.includes(code) ? scanned.filter((item) => item !== code) : [...scanned, code])} />)}
                </Stack>
              </Box>
            )}
            {delivering?.attributes?.codAmount > 0 && (
              <Stack direction="row" spacing={1}>
                <TextField type="number" label={`${t('dispatchCollected')} (${money(delivering.attributes.codAmount)})`} value={collected} onChange={(event) => setCollected(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start">S/</InputAdornment> } }} sx={{ flex: 1 }} />
                <TextField select label={t('dispatchPaymentMethod')} value={method} onChange={(event) => setMethod(event.target.value)} sx={{ width: 150 }}>
                  {PAYMENT_METHODS.map((key) => <MenuItem key={key} value={key}>{t(key)}</MenuItem>)}
                </TextField>
              </Stack>
            )}
            <Button variant="outlined" component="label" startIcon={<PhotoCameraIcon />} disabled={photos.length >= 3}>
              {`${t('dispatchTakePhoto')} (${photos.length}/3)`}
              <input hidden type="file" accept="image/*" capture="environment" onChange={async (event) => { if (event.target.files[0]) { const image = await compressImage(event.target.files[0]); setPhotos([...photos, image].slice(0, 3)); } event.target.value = ''; }} />
            </Button>
            {photos.length > 0 && (
              <Stack direction="row" spacing={1}>
                {photos.map((image) => <Box key={image.slice(-40)} component="img" src={image} alt="" onClick={() => setPhotos(photos.filter((item) => item !== image))} sx={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 1.5 }} />)}
              </Stack>
            )}
            <FormControlLabel control={<Switch checked={partial} onChange={(event) => setPartial(event.target.checked)} />} label={t('dispatchPartial')} />
            <Typography variant="body2" fontWeight={600}>{t('dispatchSignature')}</Typography>
            <SignaturePad onChange={setSignature} clearLabel={t('dispatchClear')} />
            <TextField label={t('dispatchNotes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelivering(null)}>{t('sharedCancel')}</Button>
          <Button
            variant="contained"
            color="success"
            disabled={busy}
            onClick={async () => {
              const packages = splitList(delivering.attributes?.packages);
              if (packages.length && scanned.length < packages.length && !partial && !window.confirm(t('dispatchMissingPackages'))) return;
              if (await report(delivering, 'delivered', {
                recipient,
                notes,
                photos,
                signature,
                partial,
                checklist: checked,
                scanned,
                ...(delivering.attributes?.codAmount > 0 ? { codCollected: Number(collected) || 0, codMethod: t(method) } : {}),
              })) setDelivering(null);
            }}
          >
            {t('dispatchConfirmDelivery')}
          </Button>
        </DialogActions>
      </Dialog>

      <ScanDialog
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(code) => setScanned((list) => (list.includes(code) ? list : [...list, code]))}
        labels={{
          title: t('dispatchScan'), unsupported: t('dispatchScanUnsupported'), manual: t('dispatchCodeManual'), add: t('sharedAdd'), done: t('sharedHide'),
        }}
      />

      <Dialog open={!!failing} onClose={() => setFailing(null)} fullWidth>
        <DialogTitle>{t('dispatchNotDelivered')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label={t('dispatchReason')} value={reason} onChange={(event) => setReason(event.target.value)}>
              {FAILURE_REASONS.map((key) => <MenuItem key={key} value={key}>{t(key)}</MenuItem>)}
            </TextField>
            <TextField label={t('dispatchNotes')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFailing(null)}>{t('sharedCancel')}</Button>
          <Button variant="contained" color="error" disabled={busy} onClick={async () => { if (await report(failing, 'failed', { failureReason: t(reason), notes })) setFailing(null); }}>{t('sharedSave')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DriverPage;
