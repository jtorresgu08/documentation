import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Menu, MenuItem,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import BuildIcon from '@mui/icons-material/Build';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { parseCsv } from '../other/geofenceFormats';
import DispatchNav from './DispatchNav';
import OrderDialog from './OrderDialog';
import {
  ORDER_STATUS_COLORS, formatWindow, money, orderStatusLabel, timeOnDate, typeLabel,
} from './dispatchUtils';

const TYPE_ICONS = { delivery: LocalShippingIcon, pickup: MoveToInboxIcon, service: BuildIcon };
const STATUSES = ['unassigned', 'assigned', 'delivered', 'failed', 'cancelled'];

const pick = (row, keys) => {
  const entry = Object.entries(row).find(([key]) => keys.includes(key.trim().toLowerCase()));
  return entry ? entry[1] : '';
};

const typeFromText = (text) => {
  const value = String(text || '').toLowerCase();
  if (value.startsWith('serv') || value.startsWith('inst') || value.startsWith('mant')) return 'service';
  if (value.startsWith('rec') || value.startsWith('pick') || value.startsWith('dev')) return 'pickup';
  return 'delivery';
};

// Order pool: deliveries, pickups and service orders waiting to be planned, imported from a CSV or created by hand;
// selected orders go to the automatic planner, failed ones can be rescheduled to another day
const OrdersPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const readonly = useRestriction('readonly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [status, setStatus] = useState('unassigned');
  const [orders, setOrders] = useState(null);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const [newDate, setNewDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [message, setMessage] = useState(null);

  const load = async () => {
    const from = dayjs(date).startOf('day').toISOString();
    const to = dayjs(date).endOf('day').toISOString();
    const response = await fetch(`/api/dispatch/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (response.ok) setOrders(await response.json());
  };

  useEffect(() => {
    load();
    setSelected([]);
  }, [date]);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((item) => [item, (orders || []).filter((order) => order.status === item).length])), [orders]);
  const visible = (orders || []).filter((order) => order.status === status);
  const totals = visible.reduce((sum, order) => ({ weight: sum.weight + order.weight, cod: sum.cod + order.codAmount }), { weight: 0, cod: 0 });

  const action = async (order, path, body) => {
    setMenu(null);
    const response = await fetch(`/api/dispatch/orders/${order.id}${path}`, {
      method: path ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) setMessage({ severity: 'error', text: (await response.text()).split('\n')[0] });
    load();
  };

  const importCsv = async (file) => {
    const rows = parseCsv(await file.text());
    const items = rows.map((row) => {
      const day = pick(row, ['fecha', 'date']) || date;
      return {
        code: pick(row, ['codigo', 'código', 'code', 'pedido', 'order']),
        type: typeFromText(pick(row, ['tipo', 'type'])),
        name: pick(row, ['nombre', 'name', 'cliente', 'customer']),
        address: pick(row, ['direccion', 'dirección', 'address']),
        contact: pick(row, ['contacto', 'contact']),
        phone: pick(row, ['telefono', 'teléfono', 'phone', 'celular']),
        latitude: Number(pick(row, ['latitud', 'latitude', 'lat'])),
        longitude: Number(pick(row, ['longitud', 'longitude', 'lon', 'lng'])),
        plannedDate: dayjs(day).hour(12).toISOString(),
        windowStart: timeOnDate(day, pick(row, ['desde', 'from'])),
        windowEnd: timeOnDate(day, pick(row, ['hasta', 'to'])),
        serviceMinutes: Number(pick(row, ['servicio_min', 'servicio', 'service', 'minutos'])) || 0,
        priority: Number(pick(row, ['prioridad', 'priority'])) || 0,
        weight: Number(String(pick(row, ['peso', 'weight', 'kg'])).replace(',', '.')) || 0,
        volume: Number(String(pick(row, ['volumen', 'volume', 'm3'])).replace(',', '.')) || 0,
        codAmount: Number(String(pick(row, ['cobro', 'cod', 'monto'])).replace(',', '.')) || 0,
        packages: pick(row, ['bultos', 'packages', 'paquetes']),
        checklist: String(pick(row, ['checklist', 'tareas', 'verificacion'])).split('|').join('\n'),
        notes: pick(row, ['notas', 'notes']),
      };
    }).filter((item) => item.name);
    const response = await fetch('/api/dispatch/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) });
    if (response.ok) setMessage({ severity: 'success', text: t('dispatchOrdersImported').replace('{0}', items.length) });
    else setMessage({ severity: 'error', text: (await response.text()).split('\n')[0] });
    load();
  };

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('dispatchOrders')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('dispatchOrdersSubtitle')}</Typography>
        </Box>
        <DispatchNav />
        <TextField size="small" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        {!readonly && (
          <>
            <Button startIcon={<UploadFileIcon />} component="label" variant="outlined">
              {t('dispatchImportCsv')}
              <input hidden type="file" accept=".csv,.txt" onChange={(event) => { if (event.target.files[0]) importCsv(event.target.files[0]); event.target.value = ''; }} />
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>{t('dispatchNewOrder')}</Button>
          </>
        )}
      </Stack>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <Stack direction="row" alignItems="center" sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={status} onChange={(_, value) => { setStatus(value); setSelected([]); }} variant="scrollable" sx={{ flexGrow: 1 }}>
          {STATUSES.map((item) => (
            <Tab
              key={item}
              value={item}
              label={(
                <Stack direction="row" spacing={1} alignItems="center">
                  <span>{orderStatusLabel(t, item)}</span>
                  <Chip size="small" label={counts[item]} sx={{ height: 20, bgcolor: alpha(ORDER_STATUS_COLORS[item], 0.15), color: ORDER_STATUS_COLORS[item], fontWeight: 700 }} />
                </Stack>
              )}
            />
          ))}
        </Tabs>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 2, display: { xs: 'none', md: 'block' } }}>
          {`${visible.length} ${t('dispatchOrdersLower')} · ${Math.round(totals.weight)} kg${totals.cod ? ` · ${money(totals.cod)}` : ''}`}
        </Typography>
        {status === 'unassigned' && !readonly && (
          <Button variant="contained" color="secondary" startIcon={<AltRouteIcon />} disabled={!visible.length} onClick={() => navigate('/dispatch/planner', { state: { orderIds: selected.length ? selected : visible.map((order) => order.id), date } })}>
            {selected.length ? t('dispatchPlanSelected').replace('{0}', selected.length) : t('dispatchPlanAll')}
          </Button>
        )}
      </Stack>
      {!orders && <LinearProgress />}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {status === 'unassigned' && (
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={!!visible.length && selected.length === visible.length} indeterminate={!!selected.length && selected.length < visible.length} onChange={(event) => setSelected(event.target.checked ? visible.map((order) => order.id) : [])} />
                </TableCell>
              )}
              <TableCell>{t('dispatchOrderCode')}</TableCell>
              <TableCell>{t('dispatchCustomer')}</TableCell>
              <TableCell>{t('dispatchOrderType')}</TableCell>
              <TableCell>{t('dispatchWindow')}</TableCell>
              <TableCell align="right">{t('dispatchWeight')}</TableCell>
              <TableCell align="right">{t('dispatchCod')}</TableCell>
              <TableCell>{t('dispatchDetails')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((order) => {
              const Icon = TYPE_ICONS[order.type] || LocalShippingIcon;
              return (
                <TableRow key={order.id} hover>
                  {status === 'unassigned' && (
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selected.includes(order.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, order.id] : selected.filter((id) => id !== order.id))} />
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {order.priority > 0 && <Tooltip title={t(order.priority > 1 ? 'dispatchPriorityUrgent' : 'dispatchPriorityHigh')}><PriorityHighIcon sx={{ fontSize: 16, color: '#d9534f', verticalAlign: 'middle' }} /></Tooltip>}
                    {order.code || `#${order.id}`}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{order.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{order.address}</Typography>
                  </TableCell>
                  <TableCell><Stack direction="row" spacing={0.75} alignItems="center"><Icon fontSize="small" color="action" /><span>{typeLabel(t, order.type)}</span></Stack></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatWindow(order) || '—'}</TableCell>
                  <TableCell align="right">{order.weight ? `${order.weight} kg` : '—'}</TableCell>
                  <TableCell align="right">{order.codAmount ? money(order.codAmount) : '—'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {order.packages && <Chip size="small" variant="outlined" label={`${order.packages.split(/[,;]/).filter(Boolean).length} ${t('dispatchPackagesLower')}`} />}
                      {order.checklist && <Chip size="small" variant="outlined" label={`${order.checklist.split('\n').filter(Boolean).length} ${t('dispatchTasksLower')}`} />}
                      {order.attributes?.attempts > 0 && <Chip size="small" color="warning" variant="outlined" label={`${t('dispatchAttempt')} ${order.attributes.attempts + 1}`} />}
                      {order.tripId > 0 && <Chip size="small" label={t('dispatchSeeTrip')} onClick={() => navigate('/dispatch')} />}
                    </Stack>
                  </TableCell>
                  <TableCell padding="checkbox">{!readonly && <IconButton size="small" onClick={(event) => setMenu({ anchor: event.currentTarget, order })}><MoreVertIcon fontSize="small" /></IconButton>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {orders && !visible.length && <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>{t('dispatchNoOrders')}</Typography>}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.order.status === 'unassigned' && <MenuItem onClick={() => { setEditing(menu.order); setMenu(null); }}>{t('sharedEdit')}</MenuItem>}
        {['failed', 'cancelled', 'unassigned'].includes(menu?.order.status) && <MenuItem onClick={() => { setRescheduling(menu.order); setMenu(null); }}>{t('dispatchReschedule')}</MenuItem>}
        {menu?.order.status === 'unassigned' && <MenuItem onClick={() => action(menu.order, '/cancel')}>{t('dispatchCancelOrder')}</MenuItem>}
        {menu?.order.status !== 'assigned' && <MenuItem onClick={() => action(menu.order, '')} sx={{ color: 'error.main' }}>{t('sharedRemove')}</MenuItem>}
      </Menu>

      <Dialog open={!!rescheduling} onClose={() => setRescheduling(null)}>
        <DialogTitle>{t('dispatchReschedule')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{rescheduling?.name}</Typography>
          <TextField fullWidth size="small" type="date" label={t('dispatchDeliveryDate')} value={newDate} onChange={(event) => setNewDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRescheduling(null)}>{t('sharedCancel')}</Button>
          <Button variant="contained" onClick={() => { action(rescheduling, '/reschedule', { plannedDate: dayjs(newDate).hour(12).toISOString() }); setRescheduling(null); }}>{t('sharedSave')}</Button>
        </DialogActions>
      </Dialog>

      {editing && <OrderDialog order={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Container>
  );
};

export default OrdersPage;
