import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, TextField, Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import {
  ORDER_TYPES, formatHour, parseCoordinates, timeOnDate, typeLabel,
} from './dispatchUtils';
import { CustomFieldInput, fieldsFor, missingRequired } from './customFields';

// create or edit an order of the pool
const OrderDialog = ({
  order, fields, onClose, onSaved,
}) => {
  const t = useTranslation();
  const [form, setForm] = useState(() => ({
    code: '', type: 'delivery', name: '', address: '', contact: '', phone: '', coordinates: '', date: dayjs().format('YYYY-MM-DD'), from: '', to: '',
    serviceMinutes: '', priority: 0, weight: '', volume: '', codAmount: '', packages: '', checklist: '', notes: '',
    ...(order ? {
      ...order,
      coordinates: `${order.latitude}, ${order.longitude}`,
      date: dayjs(order.plannedDate).format('YYYY-MM-DD'),
      from: formatHour(order.windowStart),
      to: formatHour(order.windowEnd),
      weight: order.weight || '',
      volume: order.volume || '',
      codAmount: order.codAmount || '',
    } : {}),
  }));
  const [custom, setCustom] = useState(() => Object.fromEntries(Object.entries(order?.attributes || {})
    .filter(([key]) => key.startsWith('custom.')).map(([key, value]) => [key.slice(7), value])));
  const [error, setError] = useState(null);
  const orderFields = fieldsFor(fields, 'order', form.type);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const save = async () => {
    const point = parseCoordinates(form.coordinates);
    if (!form.name.trim() || !point) {
      setError(t('dispatchInvalidStop'));
      return;
    }
    const missing = missingRequired(orderFields, custom);
    if (missing.length) {
      setError(`${t('dispatchFieldMissing')}: ${missing.map((field) => field.label).join(', ')}`);
      return;
    }
    const body = {
      code: form.code,
      type: form.type,
      name: form.name.trim(),
      address: form.address,
      contact: form.contact,
      phone: form.phone,
      ...point,
      plannedDate: dayjs(form.date).hour(12).toISOString(),
      windowStart: timeOnDate(form.date, form.from),
      windowEnd: timeOnDate(form.date, form.to),
      serviceMinutes: Number(form.serviceMinutes) || 0,
      priority: Number(form.priority) || 0,
      weight: Number(form.weight) || 0,
      volume: Number(form.volume) || 0,
      codAmount: Number(form.codAmount) || 0,
      packages: form.packages,
      checklist: form.checklist,
      notes: form.notes,
      custom,
      attributes: Object.fromEntries(Object.entries(order?.attributes || {}).filter(([key]) => !key.startsWith('custom.'))),
    };
    const response = await fetch(order ? `/api/dispatch/orders/${order.id}` : '/api/dispatch/orders', {
      method: order ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (response.ok) onSaved();
    else setError((await response.text()).split('\n')[0]);
  };

  const grid = { display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' } };
  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{order ? t('dispatchEditOrder') : t('dispatchNewOrder')}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        <Box sx={grid}>
          <TextField size="small" label={t('dispatchOrderCode')} value={form.code || ''} onChange={set('code')} />
          <TextField size="small" select label={t('dispatchOrderType')} value={form.type} onChange={set('type')}>
            {ORDER_TYPES.map((type) => <MenuItem key={type} value={type}>{typeLabel(t, type)}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('dispatchCustomer')} value={form.name} onChange={set('name')} sx={{ gridColumn: { sm: 'span 2' } }} />
          <TextField size="small" label={t('positionAddress')} value={form.address || ''} onChange={set('address')} sx={{ gridColumn: { sm: 'span 2' } }} />
          <TextField size="small" label={t('dispatchCoordinates')} placeholder="-12.0464, -77.0428" value={form.coordinates} error={!!form.coordinates && !parseCoordinates(form.coordinates)} onChange={set('coordinates')} sx={{ gridColumn: { sm: 'span 2' } }} />
          <TextField size="small" label={t('dispatchContact')} value={form.contact || ''} onChange={set('contact')} />
          <TextField size="small" label={t('sharedPhone')} value={form.phone || ''} onChange={set('phone')} />
          <TextField size="small" type="date" label={t('dispatchDeliveryDate')} value={form.date} onChange={set('date')} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" select label={t('dispatchPriority')} value={form.priority} onChange={set('priority')}>
            <MenuItem value={0}>{t('dispatchPriorityNormal')}</MenuItem>
            <MenuItem value={1}>{t('dispatchPriorityHigh')}</MenuItem>
            <MenuItem value={2}>{t('dispatchPriorityUrgent')}</MenuItem>
          </TextField>
          <TextField size="small" type="time" label={t('dispatchFrom')} value={form.from} onChange={set('from')} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="time" label={t('dispatchTo')} value={form.to} onChange={set('to')} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="number" label={t('dispatchServiceMinutes')} value={form.serviceMinutes} onChange={set('serviceMinutes')} slotProps={{ input: { endAdornment: <InputAdornment position="end">min</InputAdornment> } }} />
          <TextField size="small" type="number" label={t('dispatchWeight')} value={form.weight} onChange={set('weight')} slotProps={{ input: { endAdornment: <InputAdornment position="end">kg</InputAdornment> } }} />
          <TextField size="small" type="number" label={t('dispatchVolume')} value={form.volume} onChange={set('volume')} slotProps={{ input: { endAdornment: <InputAdornment position="end">m³</InputAdornment> } }} />
          <TextField size="small" type="number" label={t('dispatchCod')} value={form.codAmount} onChange={set('codAmount')} slotProps={{ input: { startAdornment: <InputAdornment position="start">S/</InputAdornment> } }} />
          <TextField size="small" label={t('dispatchPackages')} placeholder="PK-001, PK-002" value={form.packages || ''} onChange={set('packages')} sx={{ gridColumn: { sm: 'span 2' } }} />
          <TextField size="small" multiline minRows={2} label={t('dispatchChecklist')} placeholder={t('dispatchChecklistExample')} value={form.checklist || ''} onChange={set('checklist')} sx={{ gridColumn: { sm: 'span 2' } }} />
          <TextField size="small" multiline minRows={2} label={t('dispatchNotes')} value={form.notes || ''} onChange={set('notes')} sx={{ gridColumn: { sm: 'span 4' } }} />
        </Box>
        {orderFields.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2, mb: 1 }}>{t('dispatchFieldsTitle')}</Typography>
            <Box sx={grid}>
              {orderFields.map((field) => (
                <Box key={field.key}>
                  <CustomFieldInput field={field} value={custom[field.key]} onChange={(value) => setCustom({ ...custom, [field.key]: value })} t={t} />
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderDialog;
