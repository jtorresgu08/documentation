import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, InputAdornment, LinearProgress, Link, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { downloadCsv } from '../reports/reportPeriods';
import {
  CHECKLIST, ORDER_STATUSES, ORDER_TYPES, STATUS_COLORS, STOCK_STATUSES, STOCK_TYPES, TECHNICIAN_COLORS, capitalize,
  installerUrl, reportUrl, statusLabel, stockStatusLabel, stockTypeLabel, typeLabel, whatsappUrl,
} from './installationsUtils';

const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const StatusChip = ({ label, status }) => (
  <Chip size="small" label={label} sx={{ bgcolor: `${STATUS_COLORS[status] || '#8a94a6'}22`, color: STATUS_COLORS[status], fontWeight: 700 }} />
);

const OrderDialog = ({
  order, technicians, stock, clients, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [item, setItem] = useState(() => ({
    type: 'installation',
    duration: 60,
    ...order,
    scheduledAt: order.scheduledAt ? dayjs(order.scheduledAt).format('YYYY-MM-DDTHH:mm') : '',
    itemIds: (order.items || []).map((entry) => entry.id),
  }));
  const save = useCatch(async (status) => {
    const body = {
      ...item,
      ...(status ? { status } : {}),
      scheduledAt: item.scheduledAt ? dayjs(item.scheduledAt).toISOString() : null,
      duration: Number(item.duration) || 60,
    };
    await fetchOrThrow(item.id ? `/api/installations/orders/${item.id}` : '/api/installations/orders', { method: item.id ? 'PUT' : 'POST', ...json(body) });
    onSaved();
  });
  const remove = useCatch(async () => {
    if (window.confirm(t('sharedRemoveConfirm'))) {
      await fetchOrThrow(`/api/installations/orders/${item.id}`, { method: 'DELETE' });
      onSaved();
    }
  });
  const available = stock.filter((entry) => entry.status === 'stock' || entry.status === 'technician' || item.itemIds.includes(entry.id));
  const field = (key, label, props = {}) => (
    <TextField size="small" label={label} value={item[key] ?? ''} onChange={(event) => setItem({ ...item, [key]: event.target.value })} {...props} />
  );
  const locked = item.status === 'completed';
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{item.id ? `${t('instOrder')} #${item.id}` : t('instNewOrder')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select size="small" label={t('sharedType')} value={item.type} onChange={(event) => setItem({ ...item, type: event.target.value })} sx={{ minWidth: 170 }}>
              {ORDER_TYPES.map((type) => <MenuItem key={type} value={type}>{typeLabel(t, type)}</MenuItem>)}
            </TextField>
            <Autocomplete
              freeSolo
              size="small"
              sx={{ flex: 1 }}
              options={clients}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
              value={clients.find((client) => client.id === item.clientId) || item.clientName || ''}
              onChange={(_, value) => setItem({
                ...item, clientId: value?.id || 0, clientName: value?.name || value || '', contactPhone: item.contactPhone || value?.phone || '',
              })}
              onInputChange={(_, value, reason) => reason === 'input' && setItem({ ...item, clientName: value, clientId: 0 })}
              renderInput={(params) => <TextField {...params} label={t('instClient')} helperText={t('instClientHelp')} />}
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('contactName', t('instContact'), { sx: { flex: 1 } })}
            {field('contactPhone', t('instPhone'), { sx: { flex: 1 } })}
          </Stack>
          {field('address', t('instAddress'))}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select size="small" label={t('instTechnician')} value={item.technicianId || ''} onChange={(event) => setItem({ ...item, technicianId: Number(event.target.value) || 0 })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('instUnassigned')}</MenuItem>
              {technicians.filter((tech) => tech.active).map((tech) => <MenuItem key={tech.id} value={tech.id}>{tech.name}</MenuItem>)}
            </TextField>
            {field('scheduledAt', t('instScheduledAt'), { type: 'datetime-local', slotProps: { inputLabel: { shrink: true } }, sx: { flex: 1 } })}
            {field('duration', t('instDuration'), { type: 'number', sx: { width: 140 } })}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {field('plate', t('instPlate'), { sx: { width: { sm: 160 } } })}
            {field('vehicle', t('instVehicle'), { sx: { flex: 1 }, placeholder: 'Volvo FH 2020 blanco' })}
            {item.type !== 'installation' && field('uniqueId', 'IMEI', { sx: { flex: 1 } })}
          </Stack>
          <Autocomplete
            multiple
            size="small"
            options={available}
            value={available.filter((entry) => item.itemIds.includes(entry.id))}
            getOptionLabel={(option) => `${stockTypeLabel(t, option.type)} · ${option.model || ''} · ${option.serial}${option.technicianName ? ` (${option.technicianName})` : ''}`}
            onChange={(_, value) => setItem({ ...item, itemIds: value.map((entry) => entry.id) })}
            renderInput={(params) => <TextField {...params} label={t('instEquipment')} helperText={t('instEquipmentHelp')} />}
          />
          {field('notes', t('instNotes'), { multiline: true, minRows: 2 })}
          {locked && <Alert severity="info">{t('instCompletedLocked')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {item.id && !locked && <Button color="error" onClick={remove}>{t('sharedRemove')}</Button>}
        {item.id && !locked && item.status !== 'cancelled' && <Button color="warning" onClick={() => save('cancelled')}>{t('instCancelOrder')}</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        {!locked && <Button variant="contained" onClick={() => save(item.status === 'cancelled' ? 'scheduled' : null)} disabled={!item.clientName}>{t('sharedSave')}</Button>}
      </DialogActions>
    </Dialog>
  );
};

export const OrderReport = ({ order, photoUrl }) => {
  const t = useTranslation();
  const photos = (order.photos || []).filter((photo) => photo.kind === 'photo');
  const signature = (order.photos || []).find((photo) => photo.kind === 'signature');
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {CHECKLIST.map((key) => {
          const done = order.checklist?.[key];
          return (
            <Chip
              key={key}
              size="small"
              icon={done ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
              label={t(`instCheck${capitalize(key)}`)}
              color={done ? 'success' : 'default'}
              variant={done ? 'filled' : 'outlined'}
            />
          );
        })}
      </Stack>
      {photos.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1 }}>
          {photos.map((photo) => (
            <Box key={photo.id} component="a" href={photoUrl(photo)} target="_blank" rel="noopener" sx={{ position: 'relative', display: 'block' }}>
              <Box component="img" src={photoUrl(photo)} alt="" sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 2, bgcolor: 'action.hover' }} />
              <Chip size="small" label={t(`instPhoto${capitalize(photo.category)}`)} sx={{ position: 'absolute', left: 6, bottom: 6, bgcolor: 'rgba(0,0,0,.6)', color: '#fff' }} />
            </Box>
          ))}
        </Box>
      )}
      {signature && (
        <Box>
          <Typography variant="caption" color="text.secondary">{`${t('instSignature')}: ${order.signatureName}`}</Typography>
          <Box component="img" src={photoUrl(signature)} alt="" sx={{ display: 'block', maxHeight: 110, maxWidth: 280, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }} />
        </Box>
      )}
    </Stack>
  );
};

const OrderView = ({ orderId, onClose, onEdit }) => {
  const t = useTranslation();
  const [order, setOrder] = useState(null);
  useEffect(() => {
    fetch(`/api/installations/orders/${orderId}`).then((response) => response.json()).then(setOrder);
  }, [orderId]);
  if (!order) return null;
  const row = (label, value) => value && (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130 }}>{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{value}</Typography>
    </Stack>
  );
  const timeline = [['instCreated', order.createdAt], ['instStatusEnRoute', order.enRouteAt], ['instStarted', order.startedAt], ['instStatusCompleted', order.completedAt]];
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <span>{`${t('instOrder')} #${order.id} · ${typeLabel(t, order.type)}`}</span>
          <StatusChip label={statusLabel(t, order.status)} status={order.status} />
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={0.75}>
          {row(t('instClient'), order.clientName)}
          {row(t('instContact'), [order.contactName, order.contactPhone].filter(Boolean).join(' · '))}
          {row(t('instAddress'), order.address)}
          {row(t('instTechnician'), order.technicianName)}
          {row(t('instScheduledAt'), order.scheduledAt && dayjs(order.scheduledAt).format('DD/MM/YYYY HH:mm'))}
          {row(t('instVehicle'), [order.plate, order.vehicle].filter(Boolean).join(' · '))}
          {row('IMEI / ICCID', [order.uniqueId, order.iccid].filter(Boolean).join(' · '))}
          {row(t('instOdometer'), order.odometer)}
          {row(t('instEquipment'), order.items.map((entry) => `${stockTypeLabel(t, entry.type)} ${entry.model || ''} (${entry.serial})`).join(', '))}
          {row(t('instNotes'), order.notes)}
          {row(t('instTechNotes'), order.techNotes)}
        </Stack>
        <Stack direction="row" spacing={2} sx={{ my: 2 }} flexWrap="wrap" useFlexGap>
          {timeline.filter(([, time]) => time).map(([key, time]) => (
            <Box key={key}>
              <Typography variant="caption" color="text.secondary">{t(key)}</Typography>
              <Typography variant="body2" fontWeight={600}>{dayjs(time).format('DD/MM HH:mm')}</Typography>
            </Box>
          ))}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        <OrderReport order={order} photoUrl={(photo) => `/api/installations/orders/${order.id}/photos/${photo.id}`} />
      </DialogContent>
      <DialogActions>
        {order.status === 'completed' && (
          <>
            <Button startIcon={<OpenInNewIcon />} href={reportUrl(order.token)} target="_blank">{t('instReport')}</Button>
            {order.contactPhone && (
              <Button startIcon={<WhatsAppIcon />} href={whatsappUrl(order.contactPhone, `${t('instReportMessage')} ${reportUrl(order.token)}`)} target="_blank">
                {t('instSendReport')}
              </Button>
            )}
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {order.status !== 'completed' && <Button onClick={() => onEdit(order)}>{t('sharedEdit')}</Button>}
        <Button variant="contained" onClick={onClose}>{t('sharedHide')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const Agenda = ({
  orders, technicians, week, setWeek, onOpen, onCreate,
}) => {
  const t = useTranslation();
  const days = [...Array(7).keys()].map((index) => week.add(index, 'day'));
  const rows = [...technicians.filter((tech) => tech.active), { id: 0, name: t('instUnassigned'), color: '#8a94a6' }];
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}>
        <IconButton size="small" onClick={() => setWeek(week.subtract(7, 'day'))}><ChevronLeftIcon /></IconButton>
        <Typography fontWeight={700} sx={{ minWidth: 230, textAlign: 'center' }}>{`${days[0].format('DD MMM')} – ${days[6].format('DD MMM YYYY')}`}</Typography>
        <IconButton size="small" onClick={() => setWeek(week.add(7, 'day'))}><ChevronRightIcon /></IconButton>
        <Chip size="small" label={t('instThisWeek')} onClick={() => setWeek(dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day'))} />
      </Stack>
      <Box sx={{
        display: 'grid', gridTemplateColumns: `180px repeat(7, minmax(130px, 1fr))`, minWidth: 1100, borderTop: 1, borderColor: 'divider',
      }}
      >
        <Box sx={{ p: 1, borderRight: 1, borderColor: 'divider' }} />
        {days.map((day) => (
          <Box key={day.format()} sx={{ p: 1, textAlign: 'center', borderRight: 1, borderColor: 'divider', bgcolor: day.isSame(dayjs(), 'day') ? 'primary.main' : 'transparent', color: day.isSame(dayjs(), 'day') ? '#fff' : undefined }}>
            <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{day.format('ddd')}</Typography>
            <Typography fontWeight={700}>{day.format('DD')}</Typography>
          </Box>
        ))}
        {rows.map((tech) => (
          <Box key={tech.id} sx={{ display: 'contents' }}>
            <Box sx={{
              p: 1, borderTop: 1, borderRight: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1,
            }}
            >
              <Box sx={{
                width: 10, height: 10, borderRadius: '50%', bgcolor: tech.color || '#2563c9', flexShrink: 0,
              }}
              />
              <Typography variant="body2" fontWeight={600} noWrap>{tech.name}</Typography>
            </Box>
            {days.map((day) => {
              const cell = orders.filter((order) => (order.technicianId || 0) === tech.id && order.scheduledAt && dayjs(order.scheduledAt).isSame(day, 'day'));
              return (
                <Box
                  key={day.format()}
                  onDoubleClick={() => onCreate({ technicianId: tech.id, scheduledAt: day.hour(9).minute(0).toISOString() })}
                  sx={{
                    p: 0.5, borderTop: 1, borderRight: 1, borderColor: 'divider', minHeight: 72, display: 'flex', flexDirection: 'column', gap: 0.5,
                  }}
                >
                  {cell.map((order) => (
                    <Box
                      key={order.id}
                      onClick={() => onOpen(order)}
                      sx={{
                        cursor: 'pointer', p: 0.75, borderRadius: 1.5, borderLeft: 4, borderColor: STATUS_COLORS[order.status], bgcolor: `${STATUS_COLORS[order.status]}14`, '&:hover': { bgcolor: `${STATUS_COLORS[order.status]}2a` },
                      }}
                    >
                      <Typography variant="caption" fontWeight={700} sx={{ display: 'block' }}>{`${dayjs(order.scheduledAt).format('HH:mm')} · ${typeLabel(t, order.type)}`}</Typography>
                      <Typography variant="caption" noWrap sx={{ display: 'block' }}>{order.plate || order.clientName}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{order.clientName}</Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1.5 }}>{t('instAgendaHelp')}</Typography>
    </Card>
  );
};

const StockDialog = ({
  item, technicians, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [value, setValue] = useState({ type: 'gps', ...item });
  const save = useCatch(async () => {
    await fetchOrThrow(value.id ? `/api/installations/stock/${value.id}` : '/api/installations/stock', { method: value.id ? 'PUT' : 'POST', ...json(value) });
    onSaved();
  });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{value.id ? t('instEditEquipment') : t('instAddEquipment')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t('sharedType')} value={value.type} onChange={(event) => setValue({ ...value, type: event.target.value })} sx={{ minWidth: 160 }}>
              {STOCK_TYPES.map((type) => <MenuItem key={type} value={type}>{stockTypeLabel(t, type)}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('instModel')} value={value.model || ''} onChange={(event) => setValue({ ...value, model: event.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <TextField size="small" label={t('instSerial')} helperText={t('instSerialHelp')} value={value.serial || ''} onChange={(event) => setValue({ ...value, serial: event.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t('instTechnician')} value={value.technicianId || ''} onChange={(event) => setValue({ ...value, technicianId: Number(event.target.value) || 0 })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('instWarehouse')}</MenuItem>
              {technicians.map((tech) => <MenuItem key={tech.id} value={tech.id}>{tech.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('simStatusLabel')} value={value.status || ''} onChange={(event) => setValue({ ...value, status: event.target.value })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('instAutomatic')}</MenuItem>
              {STOCK_STATUSES.map((status) => <MenuItem key={status} value={status}>{stockStatusLabel(t, status)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField size="small" label={t('instNotes')} value={value.notes || ''} onChange={(event) => setValue({ ...value, notes: event.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!value.serial}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const TechnicianDialog = ({ technician, onClose, onSaved }) => {
  const t = useTranslation();
  const [value, setValue] = useState({ active: true, color: TECHNICIAN_COLORS[0], ...technician });
  const save = useCatch(async (extra = {}) => {
    await fetchOrThrow(value.id ? `/api/installations/technicians/${value.id}` : '/api/installations/technicians', { method: value.id ? 'PUT' : 'POST', ...json({ ...value, ...extra }) });
    onSaved();
  });
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{value.id ? t('instEditTechnician') : t('instAddTechnician')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label={t('sharedName')} value={value.name || ''} onChange={(event) => setValue({ ...value, name: event.target.value })} />
          <TextField size="small" label={t('instPhone')} helperText={t('instPhoneHelp')} value={value.phone || ''} onChange={(event) => setValue({ ...value, phone: event.target.value })} />
          <TextField size="small" label={t('userEmail')} value={value.email || ''} onChange={(event) => setValue({ ...value, email: event.target.value })} />
          <Stack direction="row" spacing={1}>
            {TECHNICIAN_COLORS.map((color) => (
              <Box
                key={color}
                onClick={() => setValue({ ...value, color })}
                sx={{
                  width: 26, height: 26, borderRadius: '50%', bgcolor: color, cursor: 'pointer', outline: value.color === color ? '3px solid' : 'none', outlineColor: 'text.primary', outlineOffset: 2,
                }}
              />
            ))}
          </Stack>
          <TextField select size="small" label={t('simStatusLabel')} value={value.active ? 'yes' : 'no'} onChange={(event) => setValue({ ...value, active: event.target.value === 'yes' })}>
            <MenuItem value="yes">{t('instActive')}</MenuItem>
            <MenuItem value="no">{t('instInactive')}</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        {value.id && <Button color="warning" onClick={() => window.confirm(t('instNewLinkConfirm')) && save({ newToken: true })}>{t('instNewLink')}</Button>}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={() => save()} disabled={!value.name}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const ImportStock = ({ open, onClose, onDone }) => {
  const t = useTranslation();
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const run = useCatch(async () => {
    const response = await fetchOrThrow('/api/installations/stock/import', { method: 'POST', ...json({ csv }) });
    setResult(await response.json());
    onDone();
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('instImportStock')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">{t('instImportStockHelp')}</Typography>
        <Box component="pre" sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, fontSize: 12 }}>{'tipo;modelo;serie\ngps;Teltonika FMC130;864636060000001\nrelay;Relé 12V;RL-0001'}</Box>
        <Button component="label" variant="outlined" size="small" sx={{ mb: 1 }}>
          {t('simChooseFile')}
          <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(event) => event.target.files[0]?.text().then(setCsv)} />
        </Button>
        <TextField multiline minRows={5} fullWidth value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={t('simPasteCsv')} />
        {result && (
          <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mt: 2 }}>
            {`${t('simImportCreated')}: ${result.created}`}
            {result.errors.map((error) => <div key={error}>{error}</div>)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
        <Button variant="contained" onClick={run} disabled={!csv.trim()}>{t('simImportRun')}</Button>
      </DialogActions>
    </Dialog>
  );
};

// Installations and field service: technician schedule, work orders, equipment inventory and technicians
const InstallationsPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const [tab, setTab] = useState('agenda');
  const [week, setWeek] = useState(dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day'));
  const [orders, setOrders] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [stock, setStock] = useState([]);
  const [clients, setClients] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingTech, setEditingTech] = useState(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    const responses = await Promise.all(['/api/installations/orders', '/api/installations/technicians', '/api/installations/stock', '/api/installations/summary', '/api/users'].map((url) => fetch(url)));
    const [list, techs, items, totals, users] = await Promise.all(responses.map((response) => (response.ok ? response.json() : null)));
    setOrders(list || []);
    setTechnicians(techs || []);
    setStock(items || []);
    setSummary(totals);
    setClients((users || []).filter((user) => !user.administrator));
  };
  useEffect(() => {
    load();
  }, []);

  const open = (order) => (order.status === 'completed' ? setViewing(order.id) : setEditing(order));
  const saved = () => {
    setEditing(null);
    setEditingItem(null);
    setEditingTech(null);
    load();
  };
  const removeItem = useCatch(async (item) => {
    if (window.confirm(t('sharedRemoveConfirm'))) {
      await fetchOrThrow(`/api/installations/stock/${item.id}`, { method: 'DELETE' });
      load();
    }
  });
  const removeTech = useCatch(async (tech) => {
    if (window.confirm(t('sharedRemoveConfirm'))) {
      await fetchOrThrow(`/api/installations/technicians/${tech.id}`, { method: 'DELETE' });
      load();
    }
  });

  const filteredOrders = useMemo(() => (orders || []).filter((order) => (!status || order.status === status)
    && `${order.clientName} ${order.plate || ''} ${order.technicianName || ''} ${order.address || ''}`.toLowerCase().includes(search.toLowerCase())), [orders, status, search]);
  const filteredStock = useMemo(() => stock.filter((item) => (!stockFilter || item.status === stockFilter)
    && `${item.serial} ${item.model || ''} ${item.technicianName || ''}`.toLowerCase().includes(search.toLowerCase())), [stock, stockFilter, search]);

  const kpi = (label, value, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 130, p: 1.5, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('instTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('instSubtitle')}</Typography>
        </Box>
        {(tab === 'orders' || tab === 'stock') && (
          <TextField
            size="small"
            placeholder={t('sharedSearch')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
        )}
        {!readonly && tab === 'stock' && <Button variant="outlined" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setImporting(true)}>{t('instImportStock')}</Button>}
        {!readonly && tab === 'stock' && <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditingItem({})}>{t('instAddEquipment')}</Button>}
        {!readonly && tab === 'technicians' && <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditingTech({})}>{t('instAddTechnician')}</Button>}
        {!readonly && (tab === 'agenda' || tab === 'orders') && <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setEditing({})}>{t('instNewOrder')}</Button>}
      </Stack>
      {summary && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {kpi(t('instToday'), summary.today, '#163c7d')}
          {kpi(t('instStatusScheduled'), summary.orders.scheduled, STATUS_COLORS.scheduled)}
          {kpi(t('instInField'), summary.orders.enRoute + summary.orders.inProgress, STATUS_COLORS.inProgress)}
          {kpi(t('instStatusCompleted'), summary.orders.completed, STATUS_COLORS.completed)}
          {kpi(t('instStockAvailable'), summary.stock.stock + summary.stock.technician, STATUS_COLORS.stock)}
          {kpi(t('instKpiInstalled'), summary.stock.installed, STATUS_COLORS.installed)}
        </Stack>
      )}
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }} variant="scrollable">
        <Tab value="agenda" label={t('instAgenda')} />
        <Tab value="orders" label={t('instOrders')} />
        <Tab value="stock" label={t('instInventory')} />
        <Tab value="technicians" label={t('instTechnicians')} />
      </Tabs>
      {!orders && <LinearProgress />}
      {orders && tab === 'agenda' && (
        <Agenda orders={orders} technicians={technicians} week={week} setWeek={setWeek} onOpen={open} onCreate={(base) => !readonly && setEditing(base)} />
      )}
      {orders && tab === 'orders' && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={t('simAll')} color={!status ? 'primary' : 'default'} onClick={() => setStatus('')} />
            {ORDER_STATUSES.map((item) => <Chip key={item} size="small" label={statusLabel(t, item)} color={status === item ? 'primary' : 'default'} onClick={() => setStatus(item)} />)}
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              size="small"
              variant="outlined"
              label="CSV"
              onClick={() => downloadCsv('ordenes', ['#', t('sharedType'), t('instClient'), t('instPlate'), t('instTechnician'), t('instScheduledAt'), t('simStatusLabel'), 'IMEI', t('instCompletedAt')],
                filteredOrders.map((order) => [order.id, typeLabel(t, order.type), order.clientName, order.plate, order.technicianName, order.scheduledAt && dayjs(order.scheduledAt).format('DD/MM/YYYY HH:mm'), statusLabel(t, order.status), order.uniqueId, order.completedAt && dayjs(order.completedAt).format('DD/MM/YYYY HH:mm')]))}
            />
          </Stack>
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>{t('instScheduledAt')}</TableCell>
                  <TableCell>{t('sharedType')}</TableCell>
                  <TableCell>{t('instClient')}</TableCell>
                  <TableCell>{t('instVehicle')}</TableCell>
                  <TableCell>{t('instTechnician')}</TableCell>
                  <TableCell>{t('simStatusLabel')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => setViewing(order.id)}>
                    <TableCell>{order.id}</TableCell>
                    <TableCell>{order.scheduledAt ? dayjs(order.scheduledAt).format('DD/MM HH:mm') : '—'}</TableCell>
                    <TableCell>{typeLabel(t, order.type)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{order.clientName}</Typography>
                      <Typography variant="caption" color="text.secondary">{order.address}</Typography>
                    </TableCell>
                    <TableCell>{[order.plate, order.vehicle].filter(Boolean).join(' · ') || '—'}</TableCell>
                    <TableCell>{order.technicianName || <Typography variant="caption" color="error">{t('instUnassigned')}</Typography>}</TableCell>
                    <TableCell><StatusChip label={statusLabel(t, order.status)} status={order.status} /></TableCell>
                    <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                      {order.status !== 'completed' && !readonly && <IconButton size="small" onClick={() => setEditing(order)}><EditIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredOrders.length && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('instNoOrders')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
      {tab === 'stock' && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={t('simAll')} color={!stockFilter ? 'primary' : 'default'} onClick={() => setStockFilter('')} />
            {STOCK_STATUSES.map((item) => <Chip key={item} size="small" label={`${stockStatusLabel(t, item)} ${summary?.stock[item] ?? ''}`} color={stockFilter === item ? 'primary' : 'default'} onClick={() => setStockFilter(item)} />)}
          </Stack>
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('sharedType')}</TableCell>
                  <TableCell>{t('instModel')}</TableCell>
                  <TableCell>{t('instSerial')}</TableCell>
                  <TableCell>{t('simStatusLabel')}</TableCell>
                  <TableCell>{t('instLocation')}</TableCell>
                  <TableCell>{t('instUpdated')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStock.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>{stockTypeLabel(t, item.type)}</TableCell>
                    <TableCell>{item.model || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{item.serial}</TableCell>
                    <TableCell><StatusChip label={stockStatusLabel(t, item.status)} status={item.status} /></TableCell>
                    <TableCell>
                      {item.workOrderId ? <Link component="button" variant="body2" onClick={() => setViewing(item.workOrderId)}>{`${t('instOrder')} #${item.workOrderId}`}</Link> : item.technicianName || t('instWarehouse')}
                    </TableCell>
                    <TableCell>{item.updatedAt ? dayjs(item.updatedAt).format('DD/MM/YYYY') : '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!readonly && <IconButton size="small" onClick={() => setEditingItem(item)}><EditIcon fontSize="small" /></IconButton>}
                      {!readonly && <IconButton size="small" onClick={() => removeItem(item)}><DeleteIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredStock.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('instNoStock')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
      {tab === 'technicians' && (
        <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('instPhone')}</TableCell>
                <TableCell align="right">{t('instOpenOrders')}</TableCell>
                <TableCell align="right">{t('instEquipmentWith')}</TableCell>
                <TableCell>{t('instPanelLink')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {technicians.map((tech) => (
                <TableRow key={tech.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{
                        width: 12, height: 12, borderRadius: '50%', bgcolor: tech.color || '#2563c9',
                      }}
                      />
                      <Typography variant="body2" fontWeight={700}>{tech.name}</Typography>
                      {!tech.active && <Chip size="small" label={t('instInactive')} />}
                    </Stack>
                  </TableCell>
                  <TableCell>{tech.phone || '—'}</TableCell>
                  <TableCell align="right">{(orders || []).filter((order) => order.technicianId === tech.id && !['completed', 'cancelled'].includes(order.status)).length}</TableCell>
                  <TableCell align="right">{stock.filter((item) => item.technicianId === tech.id && ['technician', 'reserved'].includes(item.status)).length}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title={t('instCopyLink')}><IconButton size="small" onClick={() => navigator.clipboard?.writeText(installerUrl(tech.token))}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title={t('instOpenPanel')}><IconButton size="small" href={installerUrl(tech.token)} target="_blank"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                      {tech.phone && (
                        <Tooltip title={t('instSendLink')}>
                          <IconButton size="small" href={whatsappUrl(tech.phone, `${t('instLinkMessage')} ${installerUrl(tech.token)}`)} target="_blank"><WhatsAppIcon fontSize="small" sx={{ color: '#25d366' }} /></IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {!readonly && <IconButton size="small" onClick={() => setEditingTech(tech)}><EditIcon fontSize="small" /></IconButton>}
                    {!readonly && <IconButton size="small" onClick={() => removeTech(tech)}><DeleteIcon fontSize="small" /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
              {!technicians.length && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('instNoTechnicians')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && <OrderDialog order={editing} technicians={technicians} stock={stock} clients={clients} onClose={() => setEditing(null)} onSaved={saved} />}
      {viewing && <OrderView orderId={viewing} onClose={() => setViewing(null)} onEdit={(order) => { setViewing(null); setEditing(order); }} />}
      {editingItem && <StockDialog item={editingItem} technicians={technicians} onClose={() => setEditingItem(null)} onSaved={saved} />}
      {editingTech && <TechnicianDialog technician={editingTech} onClose={() => setEditingTech(null)} onSaved={saved} />}
      <ImportStock open={importing} onClose={() => setImporting(false)} onDone={load} />
    </Container>
  );
};

export default InstallationsPage;
