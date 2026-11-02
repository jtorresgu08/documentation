import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, AppBar, Box, Button, Card, CardActionArea, Checkbox, Chip, CircularProgress, Container, Divider,
  FormControlLabel, IconButton, LinearProgress, MenuItem, Stack, TextField, Toolbar, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import NavigationIcon from '@mui/icons-material/Navigation';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import {
  CHECKLIST, PHOTO_CATEGORIES, STATUS_COLORS, capitalize, compressImage, currentPosition, mapsUrl, reportUrl,
  statusLabel, stockTypeLabel, typeLabel, whatsappUrl,
} from './installationsUtils';
import { BRAND_LOGO_WHITE } from '../common/util/brandDefaults';

const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const SignaturePad = ({ onChange }) => {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const element = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = element.offsetWidth * ratio;
    element.height = element.offsetHeight * ratio;
    const context = element.getContext('2d');
    context.scale(ratio, ratio);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, element.width, element.height);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.strokeStyle = '#0a2453';
  }, []);
  const point = (event) => {
    const rect = canvas.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const down = (event) => {
    drawing.current = true;
    canvas.current.setPointerCapture(event.pointerId);
    const context = canvas.current.getContext('2d');
    context.beginPath();
    context.moveTo(...point(event));
  };
  const move = (event) => {
    if (!drawing.current) return;
    const context = canvas.current.getContext('2d');
    context.lineTo(...point(event));
    context.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(canvas.current.toDataURL('image/png'));
  };
  const clear = () => {
    const context = canvas.current.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.current.width, canvas.current.height);
    setEmpty(true);
    onChange(null);
  };
  return (
    <Box>
      <Box
        component="canvas"
        ref={canvas}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        sx={{
          width: '100%', height: 170, border: '2px dashed', borderColor: empty ? 'divider' : 'primary.main', borderRadius: 2, touchAction: 'none', bgcolor: '#fff', display: 'block',
        }}
      />
      <Button size="small" onClick={clear}>Borrar firma</Button>
    </Box>
  );
};

const Section = ({ title, children, done }) => (
  <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
      <Typography fontWeight={700} sx={{ flexGrow: 1 }}>{title}</Typography>
      {done && <TaskAltIcon color="success" fontSize="small" />}
    </Stack>
    {children}
  </Card>
);

const OrderScreen = ({
  token, orderId, checklistKeys, onBack,
}) => {
  const t = useTranslation();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const [category, setCategory] = useState('vehicle');
  const [signal, setSignal] = useState(null);
  const [signature, setSignature] = useState(null);
  const [signatureName, setSignatureName] = useState('');
  const base = `/api/installer/${token}/orders/${orderId}`;

  const apply = (data) => {
    setOrder(data);
    setForm({
      uniqueId: data.uniqueId || '', iccid: data.iccid || '', odometer: data.odometer || '', techNotes: data.techNotes || '', checklist: data.checklist || {},
    });
    setSignatureName((current) => current || data.contactName || '');
  };
  const call = async (path, options) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.split('\n')[0].replace(/^[\w.]+Exception: /, '') || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (failure) {
      setError(failure.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    call(base).then((data) => data && apply(data));
  }, [orderId]);

  if (!order) return error ? <Alert severity="error">{error}</Alert> : <LinearProgress />;
  const open = order.status !== 'completed' && order.status !== 'cancelled';
  const started = order.status === 'inProgress';
  const photos = order.photos.filter((photo) => photo.kind === 'photo');

  const advance = async (status) => {
    const position = await currentPosition();
    const data = await call(`${base}/status`, { method: 'POST', ...json({ status, ...position }) });
    if (data) apply(data);
  };
  const saveForm = async (extra = {}) => {
    const data = await call(base, { method: 'PUT', ...json({ ...form, ...extra }) });
    if (data) apply(data);
  };
  const toggle = (key) => {
    const checklist = { ...form.checklist, [key]: !form.checklist[key] };
    setForm({ ...form, checklist });
    saveForm({ checklist });
  };
  const upload = async (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    const position = await currentPosition();
    for (const file of files) {
      const data = await compressImage(file);
      const result = await call(`${base}/photos`, { method: 'POST', ...json({ category, data, ...position }) });
      if (result) apply(result);
    }
  };
  const removePhoto = async (photo) => {
    if (!window.confirm(t('instRemovePhoto'))) return;
    const data = await call(`${base}/photos/${photo.id}`, { method: 'DELETE' });
    if (data) apply(data);
  };
  const testSignal = async () => {
    await saveForm();
    const data = await call(`${base}/signal`);
    if (data) setSignal(data);
  };
  const complete = async () => {
    const position = await currentPosition();
    const data = await call(`${base}/complete`, {
      method: 'POST', ...json({
        ...form, signature, signatureName, ...position,
      }),
    });
    if (data) apply(data);
  };

  const checklistDone = checklistKeys.filter((key) => form.checklist?.[key]).length;
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2}>{`${typeLabel(t, order.type)} · ${order.plate || order.clientName}`}</Typography>
          <Typography variant="caption" color="text.secondary">{`#${order.id} · ${order.scheduledAt ? dayjs(order.scheduledAt).format('DD/MM HH:mm') : ''}`}</Typography>
        </Box>
        <Chip size="small" label={statusLabel(t, order.status)} sx={{ bgcolor: STATUS_COLORS[order.status], color: '#fff', fontWeight: 700 }} />
      </Stack>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {busy && <LinearProgress />}

      <Section title={order.clientName}>
        <Stack spacing={0.5}>
          {order.contactName && <Typography variant="body2">{order.contactName}</Typography>}
          {order.address && <Typography variant="body2" color="text.secondary">{order.address}</Typography>}
          {order.vehicle && <Typography variant="body2">{`${t('instVehicle')}: ${order.vehicle}`}</Typography>}
          {order.notes && <Alert severity="info" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{order.notes}</Alert>}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          {order.contactPhone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${order.contactPhone}`}>{t('instCall')}</Button>}
          {order.contactPhone && <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={whatsappUrl(order.contactPhone, t('instOnTheWayMessage'))} target="_blank">WhatsApp</Button>}
          {(order.address || order.latitude) && <Button size="small" variant="outlined" startIcon={<NavigationIcon />} href={mapsUrl(order)} target="_blank">{t('instNavigate')}</Button>}
        </Stack>
      </Section>

      {open && !started && (
        <Stack direction="row" spacing={1}>
          {order.status === 'scheduled' && <Button fullWidth size="large" variant="outlined" startIcon={<DirectionsCarIcon />} onClick={() => advance('enRoute')}>{t('instGoing')}</Button>}
          <Button fullWidth size="large" variant="contained" startIcon={<PlayArrowIcon />} onClick={() => advance('inProgress')}>{t('instStart')}</Button>
        </Stack>
      )}

      {order.items.length > 0 && (
        <Section title={t('instEquipment')}>
          {order.items.map((item) => (
            <Typography key={item.id} variant="body2">{`• ${stockTypeLabel(t, item.type)} ${item.model || ''} — ${item.serial}`}</Typography>
          ))}
        </Section>
      )}

      {(started || !open) && (
        <>
          <Section title={t('instDeviceData')} done={Boolean(form.uniqueId)}>
            <Stack spacing={1.5}>
              <TextField size="small" label="IMEI" value={form.uniqueId} disabled={!open} onChange={(event) => setForm({ ...form, uniqueId: event.target.value })} onBlur={() => open && saveForm()} slotProps={{ htmlInput: { inputMode: 'numeric' } }} helperText={order.type === 'installation' ? t('instImeiHelp') : ''} />
              <TextField size="small" label="ICCID (SIM)" value={form.iccid} disabled={!open} onChange={(event) => setForm({ ...form, iccid: event.target.value })} onBlur={() => open && saveForm()} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
              <TextField size="small" label={t('instOdometer')} value={form.odometer} disabled={!open} onChange={(event) => setForm({ ...form, odometer: event.target.value })} onBlur={() => open && saveForm()} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            </Stack>
          </Section>

          <Section title={`${t('instChecklist')} (${checklistDone}/${checklistKeys.length})`} done={checklistDone === checklistKeys.length}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              {checklistKeys.map((key) => (
                <FormControlLabel key={key} disabled={!open} control={<Checkbox checked={Boolean(form.checklist?.[key])} onChange={() => toggle(key)} />} label={t(`instCheck${capitalize(key)}`)} />
              ))}
            </Box>
          </Section>

          <Section title={`${t('instPhotos')} (${photos.length})`} done={photos.length >= 3}>
            {open && (
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <TextField select size="small" label={t('instPhotoOf')} value={category} onChange={(event) => setCategory(event.target.value)} sx={{ flex: 1 }}>
                  {PHOTO_CATEGORIES.map((item) => <MenuItem key={item} value={item}>{t(`instPhoto${capitalize(item)}`)}</MenuItem>)}
                </TextField>
                <Button component="label" variant="contained" startIcon={<PhotoCameraIcon />}>
                  {t('instTakePhoto')}
                  <input type="file" accept="image/*" capture="environment" multiple hidden onChange={upload} />
                </Button>
              </Stack>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {photos.map((photo) => (
                <Box key={photo.id} sx={{ position: 'relative' }}>
                  <Box component="img" src={`${base}/photos/${photo.id}`} alt="" sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1.5, bgcolor: 'action.hover' }} />
                  <Typography variant="caption" sx={{
                    position: 'absolute', left: 4, bottom: 4, px: 0.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff',
                  }}
                  >
                    {t(`instPhoto${capitalize(photo.category)}`)}
                  </Typography>
                  {open && (
                    <IconButton size="small" onClick={() => removePhoto(photo)} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(255,255,255,.85)' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
            {!photos.length && <Typography variant="body2" color="text.secondary">{t('instPhotosHelp')}</Typography>}
          </Section>

          {open && order.type !== 'removal' && (
            <Section title={t('instSignalTest')} done={signal?.reporting}>
              <Button variant="outlined" startIcon={<SatelliteAltIcon />} endIcon={signal ? <RefreshIcon /> : null} onClick={testSignal} disabled={!form.uniqueId && !order.deviceId}>{t('instTestNow')}</Button>
              {signal && (
                <Alert severity={signal.reporting ? 'success' : 'warning'} sx={{ mt: 1.5 }}>
                  {signal.reporting ? t('instSignalOk') : signal.known ? t('instSignalLate') : t('instSignalUnknown')}
                  {signal.position && (
                    <Typography variant="caption" component="div">
                      {`${dayjs(signal.position.fixTime).format('HH:mm:ss')} · ${signal.position.valid ? 'GPS OK' : 'GPS sin fijar'} · ${signal.position.satellites ?? '—'} sat · ${signal.position.ignition ? t('instIgnitionOn') : t('instIgnitionOff')}${signal.position.power ? ` · ${Number(signal.position.power).toFixed(1)} V` : ''}`}
                    </Typography>
                  )}
                </Alert>
              )}
            </Section>
          )}

          <Section title={t('instTechNotes')}>
            <TextField multiline minRows={3} fullWidth value={form.techNotes} disabled={!open} onChange={(event) => setForm({ ...form, techNotes: event.target.value })} onBlur={() => open && saveForm()} placeholder={t('instTechNotesHelp')} />
          </Section>

          {open ? (
            <Section title={t('instClientSignature')} done={Boolean(signature && signatureName)}>
              <Stack spacing={1}>
                <TextField size="small" label={t('instSignatureName')} value={signatureName} onChange={(event) => setSignatureName(event.target.value)} />
                <SignaturePad onChange={setSignature} />
                <Typography variant="caption" color="text.secondary">{t('instSignatureHelp')}</Typography>
                <Button size="large" variant="contained" color="success" onClick={complete} disabled={busy || !signature || !signatureName}>{t('instComplete')}</Button>
              </Stack>
            </Section>
          ) : (
            <Alert severity="success" action={order.status === 'completed' && <Button color="inherit" href={reportUrl(order.token)} target="_blank">{t('instReport')}</Button>}>
              {order.status === 'completed' ? `${t('instDone')} ${dayjs(order.completedAt).format('DD/MM HH:mm')}` : statusLabel(t, order.status)}
            </Alert>
          )}
          {order.status === 'completed' && order.contactPhone && (
            <Button variant="outlined" startIcon={<WhatsAppIcon />} href={whatsappUrl(order.contactPhone, `${t('instReportMessage')} ${reportUrl(order.token)}`)} target="_blank">
              {t('instSendReport')}
            </Button>
          )}
        </>
      )}
      <Divider />
    </Stack>
  );
};

// Field panel of the installer, opened with his private link: agenda, visit details and all the evidence
const InstallerPage = () => {
  const t = useTranslation();
  const { token } = useParams();
  const [agenda, setAgenda] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = () => fetch(`/api/installer/${token}`).then((response) => {
    if (!response.ok) throw new Error();
    return response.json();
  }).then(setAgenda).catch(() => setFailed(true));
  useEffect(() => {
    load();
  }, [token]);

  const today = (agenda?.orders || []).filter((order) => order.scheduledAt && dayjs(order.scheduledAt).isSame(dayjs(), 'day'));
  const later = (agenda?.orders || []).filter((order) => !today.includes(order));
  const card = (order) => (
    <Card key={order.id} variant="outlined" sx={{ borderRadius: 3, borderLeft: 5, borderLeftColor: STATUS_COLORS[order.status] }}>
      <CardActionArea onClick={() => setSelected(order.id)} sx={{ p: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography fontWeight={700}>{`${order.scheduledAt ? dayjs(order.scheduledAt).format('HH:mm') : '--:--'} · ${typeLabel(t, order.type)}`}</Typography>
            <Typography variant="body2">{[order.plate, order.vehicle].filter(Boolean).join(' · ') || order.clientName}</Typography>
            <Typography variant="caption" color="text.secondary">{`${order.clientName}${order.address ? ` · ${order.address}` : ''}`}</Typography>
          </Box>
          <Stack alignItems="flex-end" spacing={0.5}>
            <Chip size="small" label={statusLabel(t, order.status)} sx={{ bgcolor: `${STATUS_COLORS[order.status]}22`, color: STATUS_COLORS[order.status], fontWeight: 700 }} />
            {order.scheduledAt && !dayjs(order.scheduledAt).isSame(dayjs(), 'day') && <Typography variant="caption">{dayjs(order.scheduledAt).format('ddd DD/MM')}</Typography>}
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#f3f6fb' }}>
      <AppBar position="sticky" elevation={0} sx={{ background: 'linear-gradient(90deg, #0a2453, #163c7d)' }}>
        <Toolbar>
          <Box component="img" src={BRAND_LOGO_WHITE} alt="" sx={{ height: 34, mr: 1.5 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', lineHeight: 1 }}>{t('instInstallerPanel')}</Typography>
            <Typography fontWeight={700}>{agenda?.name || ''}</Typography>
          </Box>
          {!selected && <IconButton color="inherit" onClick={load}><RefreshIcon /></IconButton>}
        </Toolbar>
      </AppBar>
      <Container maxWidth="sm" sx={{ py: 2 }}>
        {failed && <Alert severity="error">{t('instInvalidLink')}</Alert>}
        {!agenda && !failed && <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>}
        {agenda && selected && (
          <OrderScreen token={token} orderId={selected} checklistKeys={agenda.checklist || CHECKLIST} onBack={() => { setSelected(null); load(); }} />
        )}
        {agenda && !selected && (
          <Stack spacing={1.5}>
            <Typography variant="overline" fontWeight={700}>{`${t('instToday')} · ${dayjs().format('dddd DD/MM')}`}</Typography>
            {today.length ? today.map(card) : <Typography variant="body2" color="text.secondary">{t('instNothingToday')}</Typography>}
            {later.length > 0 && <Typography variant="overline" fontWeight={700}>{t('instUpcoming')}</Typography>}
            {later.map(card)}
            {agenda.stock.length > 0 && (
              <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography fontWeight={700} sx={{ mb: 1 }}>{`${t('instMyStock')} (${agenda.stock.length})`}</Typography>
                {agenda.stock.map((item) => (
                  <Typography key={item.id} variant="body2" sx={{ fontFamily: 'monospace' }}>{`${stockTypeLabel(t, item.type)} · ${item.model || ''} · ${item.serial}`}</Typography>
                ))}
              </Card>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default InstallerPage;
