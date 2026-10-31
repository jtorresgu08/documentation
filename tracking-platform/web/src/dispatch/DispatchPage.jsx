import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, ListItemIcon,
  ListItemText, Menu, MenuItem, Paper, Snackbar, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LinkIcon from '@mui/icons-material/Link';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BlockIcon from '@mui/icons-material/Block';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import UndoIcon from '@mui/icons-material/Undo';
import ScheduleIcon from '@mui/icons-material/Schedule';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BarChartIcon from '@mui/icons-material/BarChart';
import StarIcon from '@mui/icons-material/Star';
import WrongLocationIcon from '@mui/icons-material/WrongLocation';
import dayjs from 'dayjs';
import MapView from '../map/core/MapView';
import MapScale from '../map/MapScale';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import DispatchMap from './DispatchMap';
import TripDialog from './TripDialog';
import {
  FAILURE_REASONS, STOP_COLORS, TRIP_COLORS, formatHour, formatWindow, money, splitList, stopLabel, tripLabel, typeLabel,
} from './dispatchUtils';
import DispatchNav from './DispatchNav';

const REFRESH = 15000;

const whatsappLink = (phone, text) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;

// Dispatch panel: trips of the day with their progress, the selected trip on the map (stops by status, unit and
// pending route) and its stops with estimated arrival, delivery window, proof of delivery and actions
const DispatchPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const readonly = useRestriction('readonly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filter, setFilter] = useState('all');
  const [trips, setTrips] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [failing, setFailing] = useState(null);
  const [reason, setReason] = useState(FAILURE_REASONS[0]);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    const from = dayjs(date).startOf('day').toISOString();
    const to = dayjs(date).endOf('day').toISOString();
    const response = await fetch(`/api/dispatch/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (response.ok) setTrips(await response.json());
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH);
    return () => clearInterval(interval);
  }, [date]);

  const selected = trips?.find((trip) => trip.id === selectedId);
  const visible = (trips || []).filter((trip) => filter === 'all' || trip.status === filter);
  const totals = useMemo(() => (trips || []).reduce((sum, trip) => ({
    trips: sum.trips + 1,
    active: sum.active + (trip.status === 'inProgress' ? 1 : 0),
    stops: sum.stops + trip.progress.total,
    delivered: sum.delivered + trip.progress.delivered,
    failed: sum.failed + trip.progress.failed,
    late: sum.late + trip.progress.late,
  }), {
    trips: 0, active: 0, stops: 0, delivered: 0, failed: 0, late: 0,
  }), [trips]);

  const replace = (trip) => setTrips((list) => (list.some((item) => item.id === trip.id) ? list.map((item) => (item.id === trip.id ? trip : item)) : [...list, trip]));

  const tripAction = async (action) => {
    const response = await fetch(`/api/dispatch/trips/${selected.id}/${action}`, { method: 'POST' });
    if (response.ok) replace(await response.json());
  };

  const removeTrip = async () => {
    await fetch(`/api/dispatch/trips/${selected.id}`, { method: 'DELETE' });
    setSelectedId(null);
    load();
  };

  const setStatus = async (stop, status, extra = {}) => {
    setMenu(null);
    const response = await fetch(`/api/dispatch/stops/${stop.id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, ...extra }),
    });
    if (response.ok) replace(await response.json());
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard not available
    }
    setMessage(t('dispatchLinkCopied'));
  };

  const driverUrl = selected ? `${window.location.origin}/conductor/${selected.driverToken}` : '';
  const trackUrl = (stop) => `${window.location.origin}/entrega/${stop.trackingToken}`;

  const kpi = (label, value, color) => (
    <Box sx={{ flex: 1, minWidth: 0, p: 1, borderRadius: 2, bgcolor: alpha(color, 0.08) }}>
      <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    </Box>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: { xs: 'column-reverse', md: 'row' } }}>
      <Paper square sx={{ width: { md: 380 }, height: { xs: '50%', md: '100%' }, display: 'flex', flexDirection: 'column', zIndex: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.5 }}>
          <IconButton edge="start" onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{t('dispatchTitle')}</Typography>
          <Tooltip title={t('dispatchReport')}><IconButton onClick={() => navigate('/reports/dispatch')}><BarChartIcon /></IconButton></Tooltip>
          {!readonly && <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setEditing({})}>{t('dispatchNewTrip')}</Button>}
        </Stack>
        <Stack spacing={1.25} sx={{ p: 2, pb: 1 }}>
          <DispatchNav />
          <TextField size="small" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Stack direction="row" spacing={1}>
            {kpi(t('dispatchTrips'), totals.trips, theme.palette.primary.main)}
            {kpi(t('dispatchInProgress'), totals.active, '#e79a2b')}
            {kpi(t('dispatchDeliveries'), `${totals.delivered}/${totals.stops}`, '#2f9e5b')}
            {kpi(t('dispatchLate'), totals.late, '#d9534f')}
          </Stack>
        </Stack>
        <Tabs value={filter} onChange={(_, value) => setFilter(value)} variant="scrollable" sx={{ px: 1, minHeight: 40, '& .MuiTab-root': { minHeight: 40, px: 1.5 } }}>
          <Tab value="all" label={t('dispatchAll')} />
          <Tab value="planned" label={tripLabel(t, 'planned')} />
          <Tab value="inProgress" label={tripLabel(t, 'inProgress')} />
          <Tab value="completed" label={tripLabel(t, 'completed')} />
        </Tabs>
        <Divider />
        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1.5 }}>
          {!trips && <LinearProgress />}
          {trips && !visible.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>{t('dispatchNoTrips')}</Typography>}
          <Stack spacing={1}>
            {visible.map((trip) => {
              const done = trip.progress.delivered + trip.progress.failed + trip.progress.skipped;
              return (
                <Paper
                  key={trip.id}
                  variant="outlined"
                  onClick={() => setSelectedId(trip.id)}
                  sx={{
                    p: 1.5, borderRadius: 3, cursor: 'pointer', borderColor: trip.id === selectedId ? 'primary.main' : 'divider', bgcolor: trip.id === selectedId ? alpha(theme.palette.primary.main, 0.04) : undefined,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <LocalShippingIcon fontSize="small" color="action" />
                    <Typography variant="body2" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>{trip.name}</Typography>
                    {trip.progress.late > 0 && <Tooltip title={t('dispatchLate')}><WarningAmberIcon fontSize="small" sx={{ color: '#d9534f' }} /></Tooltip>}
                    <Chip size="small" color={TRIP_COLORS[trip.status]} variant={trip.status === 'planned' ? 'outlined' : 'filled'} label={tripLabel(t, trip.status)} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mt: 0.5 }}>
                    {[trip.deviceName, trip.driverName, formatHour(trip.plannedStart)].filter(Boolean).join(' · ')}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                    <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', display: 'flex', overflow: 'hidden' }}>
                      <Box sx={{ width: `${(trip.progress.delivered / trip.progress.total) * 100}%`, bgcolor: STOP_COLORS.delivered }} />
                      <Box sx={{ width: `${(trip.progress.failed / trip.progress.total) * 100}%`, bgcolor: STOP_COLORS.failed }} />
                      <Box sx={{ width: `${(trip.progress.skipped / trip.progress.total) * 100}%`, bgcolor: STOP_COLORS.skipped }} />
                    </Box>
                    <Typography variant="caption" fontWeight={600}>{`${done}/${trip.progress.total}`}</Typography>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Box>
      </Paper>

      <Box sx={{ flexGrow: 1, position: 'relative', height: { xs: '50%', md: '100%' } }}>
        <MapView>
          {selected && <DispatchMap stops={selected.stops} position={selected.position} fitKey={selected.id} padding={{ top: 60, bottom: 60, left: 60, right: 480 }} />}
        </MapView>
        <MapScale />
        {selected && (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute', top: 12, right: 12, bottom: 12, width: 420, maxWidth: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column', borderRadius: '18px',
              bgcolor: alpha(theme.palette.background.paper, 0.96), backdropFilter: 'blur(10px)', zIndex: 3,
            }}
          >
            <Box sx={{ p: 2, pb: 1 }}>
              <Stack direction="row" alignItems="flex-start" spacing={1}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700}>{selected.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{[selected.deviceName, selected.driverName].filter(Boolean).join(' · ')}</Typography>
                </Box>
                <Chip size="small" color={TRIP_COLORS[selected.status]} label={tripLabel(t, selected.status)} />
                <IconButton size="small" onClick={() => setSelectedId(null)}><CloseIcon fontSize="small" /></IconButton>
              </Stack>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {`${t('dispatchPlannedStart')}: ${dayjs(selected.plannedStart).format('DD/MM HH:mm')}`}
                {selected.startTime && ` · ${t('dispatchStarted')} ${formatHour(selected.startTime)}`}
                {selected.endTime && ` · ${t('dispatchFinished')} ${formatHour(selected.endTime)}`}
              </Typography>
              {!readonly && (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                  {selected.status === 'planned' && <Button size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={() => tripAction('start')}>{t('dispatchStart')}</Button>}
                  {selected.status !== 'cancelled' && <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing(selected)}>{t('sharedEdit')}</Button>}
                  <Button size="small" startIcon={<LinkIcon />} onClick={() => copy(driverUrl)}>{t('dispatchDriverLink')}</Button>
                  {selected.driverPhone && (
                    <IconButton size="small" color="success" component="a" target="_blank" rel="noreferrer" href={whatsappLink(selected.driverPhone, `${t('dispatchDriverMessage')} ${selected.name}: ${driverUrl}`)}>
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  )}
                  {(selected.status === 'planned' || selected.status === 'inProgress') && (
                    <Tooltip title={t('dispatchCancelTrip')}><IconButton size="small" onClick={() => tripAction('cancel')}><BlockIcon fontSize="small" /></IconButton></Tooltip>
                  )}
                  {selected.status !== 'inProgress' && <Tooltip title={t('sharedRemove')}><IconButton size="small" onClick={removeTrip}><DeleteIcon fontSize="small" /></IconButton></Tooltip>}
                </Stack>
              )}
            </Box>
            <Divider />
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1 }}>
              {selected.stops.map((stop, index) => {
                const last = index === selected.stops.length - 1;
                return (
                  <Stack key={stop.id} direction="row" spacing={1.5}>
                    <Stack alignItems="center">
                      <Badge overlap="circular" badgeContent={stop.late ? '!' : 0} color="error">
                        <Box sx={{
                          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 700, bgcolor: STOP_COLORS[stop.status],
                        }}
                        >
                          {stop.sequence}
                        </Box>
                      </Badge>
                      {!last && <Box sx={{ width: 2, flexGrow: 1, bgcolor: 'divider', my: 0.5 }} />}
                    </Stack>
                    <Box sx={{ flexGrow: 1, minWidth: 0, pb: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight={700} noWrap sx={{ flexGrow: 1 }}>{stop.name}</Typography>
                        <Typography variant="caption" sx={{ color: STOP_COLORS[stop.status], fontWeight: 700 }}>{stopLabel(t, stop.status)}</Typography>
                        {!readonly && <IconButton size="small" onClick={(event) => setMenu({ anchor: event.currentTarget, stop })}><MoreVertIcon fontSize="small" /></IconButton>}
                      </Stack>
                      {stop.address && <Typography variant="caption" color="text.secondary" component="div" noWrap>{stop.address}</Typography>}
                      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        {formatWindow(stop) && (
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <ScheduleIcon sx={{ fontSize: 14 }} color="action" />
                            <Typography variant="caption">{formatWindow(stop)}</Typography>
                          </Stack>
                        )}
                        {stop.eta && stop.status === 'pending' && (
                          <Typography variant="caption" fontWeight={700} sx={{ color: stop.atRisk ? '#d9534f' : 'primary.main' }}>
                            {`${t('dispatchEta')} ${formatHour(stop.eta)}${stop.atRisk ? ` · ${t('dispatchAtRisk')}` : ''}`}
                          </Typography>
                        )}
                        {stop.arrivalTime && <Typography variant="caption" color="text.secondary">{`${t('dispatchArrived')} ${formatHour(stop.arrivalTime)}`}</Typography>}
                        {stop.completedTime && stop.status !== 'arrived' && <Typography variant="caption" color="text.secondary">{`${stopLabel(t, stop.status)} ${formatHour(stop.completedTime)}`}</Typography>}
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        {stop.attributes?.type && stop.attributes.type !== 'delivery' && <Chip size="small" color="secondary" variant="outlined" label={typeLabel(t, stop.attributes.type)} />}
                        {stop.attributes?.codAmount > 0 && (
                          <Chip size="small" color={stop.attributes.codCollected >= stop.attributes.codAmount ? 'success' : 'warning'} variant="outlined" label={stop.attributes.codCollected !== undefined ? `${money(stop.attributes.codCollected)} / ${money(stop.attributes.codAmount)} · ${stop.attributes.codMethod || ''}` : `${t('dispatchCollect')} ${money(stop.attributes.codAmount)}`} />
                        )}
                        {stop.attributes?.packages && <Chip size="small" variant="outlined" label={`${t('dispatchPackages')} ${splitList(stop.attributes.scanned).length}/${splitList(stop.attributes.packages).length}`} />}
                        {stop.attributes?.checklist && <Chip size="small" variant="outlined" label={`${t('dispatchChecklist')} ${splitList(stop.attributes.checklistDone, /\n+/).length}/${splitList(stop.attributes.checklist, /\n+/).length}`} />}
                        {stop.attributes?.partial && <Chip size="small" color="warning" label={t('dispatchPartialShort')} />}
                        {stop.attributes?.outOfPoint && <Chip size="small" color="error" icon={<WrongLocationIcon />} label={`${t('dispatchOutOfPoint')} ${stop.attributes.proofDistance} m`} />}
                        {stop.attributes?.rating && <Chip size="small" icon={<StarIcon sx={{ color: '#f5b301 !important' }} />} label={`${stop.attributes.rating}/5${stop.attributes.ratingComment ? ` · ${stop.attributes.ratingComment}` : ''}`} />}
                      </Stack>
                      {stop.recipient && <Typography variant="caption" component="div">{`${t('dispatchRecipient')}: ${stop.recipient}`}</Typography>}
                      {stop.failureReason && <Typography variant="caption" component="div" sx={{ color: '#d9534f' }}>{`${t('dispatchReason')}: ${stop.failureReason}`}</Typography>}
                      {(stop.photo || stop.signature) && (
                        <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                          {stop.photo && <Box component="img" alt="" src={`/api/dispatch/stops/${stop.id}/photo`} onClick={() => setPreview(`/api/dispatch/stops/${stop.id}/photo`)} sx={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 1.5, cursor: 'zoom-in' }} />}
                          {splitList(stop.attributes?.photos).slice(1).map((path, index) => (
                            <Box key={path} component="img" alt="" src={`/api/dispatch/stops/${stop.id}/photos/${index + 1}`} onClick={() => setPreview(`/api/dispatch/stops/${stop.id}/photos/${index + 1}`)} sx={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 1.5, cursor: 'zoom-in' }} />
                          ))}
                          {stop.signature && <Box component="img" alt="" src={`/api/dispatch/stops/${stop.id}/signature`} onClick={() => setPreview(`/api/dispatch/stops/${stop.id}/signature`)} sx={{
 width: 96, height: 48, objectFit: 'contain', borderRadius: 1.5, bgcolor: '#fff', border: '1px solid', borderColor: 'divider', cursor: 'zoom-in' 
}} />}
                        </Stack>
                      )}
                    </Box>
                  </Stack>
                );
              })}
            </Box>
          </Paper>
        )}
        {!selected && trips?.length > 0 && (
          <Alert severity="info" sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 3 }}>{t('dispatchSelectTrip')}</Alert>
        )}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => setStatus(menu.stop, 'delivered')}><ListItemIcon><CheckCircleIcon fontSize="small" sx={{ color: STOP_COLORS.delivered }} /></ListItemIcon><ListItemText>{t('dispatchMarkDelivered')}</ListItemText></MenuItem>
        <MenuItem onClick={() => { setFailing(menu.stop); setMenu(null); }}><ListItemIcon><CancelIcon fontSize="small" sx={{ color: STOP_COLORS.failed }} /></ListItemIcon><ListItemText>{t('dispatchMarkFailed')}</ListItemText></MenuItem>
        <MenuItem onClick={() => setStatus(menu.stop, 'skipped')}><ListItemIcon><SkipNextIcon fontSize="small" /></ListItemIcon><ListItemText>{t('dispatchMarkSkipped')}</ListItemText></MenuItem>
        <MenuItem onClick={() => setStatus(menu.stop, 'pending')}><ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon><ListItemText>{t('dispatchMarkPending')}</ListItemText></MenuItem>
        <Divider />
        <MenuItem onClick={() => { copy(trackUrl(menu.stop)); setMenu(null); }}><ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon><ListItemText>{t('dispatchCustomerLink')}</ListItemText></MenuItem>
        {menu?.stop.phone && (
          <MenuItem component="a" target="_blank" rel="noreferrer" href={whatsappLink(menu.stop.phone, `${t('dispatchCustomerMessage')} ${trackUrl(menu.stop)}`)} onClick={() => setMenu(null)}>
            <ListItemIcon><WhatsAppIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>{t('dispatchSendCustomer')}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={!!failing} onClose={() => setFailing(null)}>
        <DialogTitle>{t('dispatchMarkFailed')}</DialogTitle>
        <DialogContent>
          <TextField select fullWidth size="small" sx={{ mt: 1, minWidth: 300 }} label={t('dispatchReason')} value={reason} onChange={(event) => setReason(event.target.value)}>
            {FAILURE_REASONS.map((key) => <MenuItem key={key} value={key}>{t(key)}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFailing(null)}>{t('sharedCancel')}</Button>
          <Button variant="contained" color="error" onClick={() => { setStatus(failing, 'failed', { failureReason: t(reason) }); setFailing(null); }}>{t('sharedSave')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md">
        {preview && <Box component="img" alt="" src={preview} sx={{ maxWidth: '100%', display: 'block' }} />}
      </Dialog>

      {editing && (
        <TripDialog
          trip={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(trip) => { setEditing(null); replace(trip); setSelectedId(trip.id); }}
        />
      )}
      <Snackbar open={!!message} autoHideDuration={2500} onClose={() => setMessage(null)} message={message} />
    </Box>
  );
};

export default DispatchPage;
