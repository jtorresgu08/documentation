import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { deviceFuelUnit } from '../common/util/fuelUnits';
import {
  Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, MenuItem, TextField,
} from '@mui/material';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';

export const EXPENSE_TYPES = ['fuel', 'toll', 'maintenance', 'repair', 'tires', 'insurance', 'fine', 'parking', 'wash', 'other'];

export const expenseLabelKey = (type) => `expenseType${type.charAt(0).toUpperCase()}${type.slice(1)}`;

// Add or edit an expense of a unit; the odometer starts from the unit's current reading
const ExpenseDialog = ({
  open, expense, currency, onClose, onSaved, maintenances = [],
}) => {
  const t = useTranslation();
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const [item, setItem] = useState(null);

  useEffect(() => {
    if (open) {
      setItem({
        type: 'fuel', amount: '', quantity: '', odometer: '', vendor: '', reference: '', description: '', maintenanceId: 0,
        ...expense,
        expenseTime: dayjs(expense?.expenseTime || undefined).format('YYYY-MM-DDTHH:mm'),
      });
    }
  }, [open, expense]);

  if (!item) {
    return null;
  }

  const update = (changes) => setItem({ ...item, ...changes });
  const selectDevice = (device) => {
    const total = positions[device?.id]?.attributes?.totalDistance;
    update({ deviceId: device?.id, odometer: item.odometer || (total ? Math.round(total / 1000) : '') });
  };

  const save = useCatch(async () => {
    const body = {
      ...item,
      amount: Number(item.amount),
      quantity: Number(item.quantity) || 0,
      odometer: Number(item.odometer) || 0,
      maintenanceId: Number(item.maintenanceId) || 0,
      expenseTime: dayjs(item.expenseTime).toISOString(),
      attributes: item.attributes || {},
    };
    await fetchOrThrow(item.id ? `/api/expenses/${item.id}` : '/api/expenses', {
      method: item.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onSaved();
  });

  const valid = item.deviceId && item.type && item.amount !== '' && Number(item.amount) >= 0 && item.expenseTime;
  const unitMaintenances = maintenances.filter((entry) => entry.deviceId === item.deviceId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t(item.id ? 'expenseEdit' : 'expenseAdd')}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid size={12}>
            <Autocomplete
              options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
              getOptionLabel={(option) => option.name}
              value={devices[item.deviceId] || null}
              onChange={(_, value) => selectDevice(value)}
              renderInput={(params) => <TextField {...params} label={t('reportDevice')} />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select fullWidth label={t('sharedType')} value={item.type} onChange={(event) => update({ type: event.target.value })}>
              {EXPENSE_TYPES.map((type) => <MenuItem key={type} value={type}>{t(expenseLabelKey(type))}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth type="datetime-local" label={t('expenseDate')} value={item.expenseTime} onChange={(event) => update({ expenseTime: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={t('expenseAmount')}
              value={item.amount}
              onChange={(event) => update({ amount: event.target.value })}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{currency}</InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={item.type === 'fuel' ? `${t('expenseFuelQuantity')} (${deviceFuelUnit(devices[item.deviceId])})` : t('expenseQuantity')}
              value={item.quantity}
              onChange={(event) => update({ quantity: event.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={t('expenseOdometer')}
              value={item.odometer}
              onChange={(event) => update({ odometer: event.target.value })}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label={t('expenseVendor')} value={item.vendor || ''} onChange={(event) => update({ vendor: event.target.value })} />
          </Grid>
          {(item.type === 'maintenance' || item.type === 'repair') && unitMaintenances.length > 0 && (
            <Grid size={12}>
              <TextField select fullWidth label={t('expenseMaintenance')} value={item.maintenanceId || 0} onChange={(event) => update({ maintenanceId: event.target.value })}>
                <MenuItem value={0}>—</MenuItem>
                {unitMaintenances.map((entry) => <MenuItem key={entry.maintenanceId} value={entry.maintenanceId}>{entry.name}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label={t('expenseReference')} value={item.reference || ''} onChange={(event) => update({ reference: event.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label={t('sharedDescription')} value={item.description || ''} onChange={(event) => update({ description: event.target.value })} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!valid}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseDialog;
