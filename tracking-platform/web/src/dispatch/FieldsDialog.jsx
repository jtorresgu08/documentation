import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { useTranslation } from '../common/components/LocalizationProvider';
import { ORDER_TYPES, typeLabel } from './dispatchUtils';
import { FIELD_TYPES, slugify } from './customFields';

// Custom fields of the company: label, type (text, number, date, list, checkbox), when they are filled (with the
// order or by the driver at delivery), required, shown to the customer and order types; the branch inherits them
const FieldsDialog = ({ data, onClose, onSaved }) => {
  const t = useTranslation();
  const [fields, setFields] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFields(data.own.map((field) => ({ ...field, optionsText: (field.options || []).join(', '), saved: true })));
  }, [data]);

  const inherited = data.fields.filter((field) => !data.own.some((own) => own.key === field.key));
  const update = (index, changes) => setFields(fields.map((field, i) => (i === index ? { ...field, ...changes } : field)));

  const save = async () => {
    setError(null);
    const body = fields.map((field) => ({
      key: field.key, label: field.label, type: field.type, scope: field.scope, required: field.required, showToCustomer: field.showToCustomer, types: field.types || [],
      options: field.type === 'select' ? field.optionsText.split(',').map((item) => item.trim()).filter(Boolean) : [],
    }));
    const response = await fetch('/api/dispatch/fields', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.ok) onSaved();
    else setError((await response.text()).split('\n')[0]);
  };

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t('dispatchFieldsTitle')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('dispatchFieldsHelp')}</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {inherited.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">{t('dispatchFieldsInherited')}</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {inherited.map((field) => <Chip key={field.key} size="small" label={`${field.label} · ${t(`dispatchFieldScope${field.scope === 'order' ? 'Order' : 'Delivery'}`)}`} />)}
            </Stack>
          </Box>
        )}
        <Stack spacing={1.25}>
          {fields.map((field, index) => (
            <Box key={field.saved ? field.key : `new-${index}`} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'grid', gap: 1, alignItems: 'center', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr 1fr 1.2fr 1.6fr 80px' } }}>
                <TextField size="small" label={t('dispatchFieldLabel')} value={field.label} onChange={(event) => update(index, { label: event.target.value, ...(field.saved ? {} : { key: slugify(event.target.value) }) })} helperText={`${t('dispatchFieldKey')}: ${field.key}`} />
                <TextField size="small" select label={t('dispatchFieldType')} value={field.type} onChange={(event) => update(index, { type: event.target.value })}>
                  {FIELD_TYPES.map((type) => <MenuItem key={type} value={type}>{t(`dispatchFieldType${type.charAt(0).toUpperCase()}${type.slice(1)}`)}</MenuItem>)}
                </TextField>
                <TextField size="small" select label={t('dispatchFieldScope')} value={field.scope} onChange={(event) => update(index, { scope: event.target.value })}>
                  <MenuItem value="order">{t('dispatchFieldScopeOrder')}</MenuItem>
                  <MenuItem value="delivery">{t('dispatchFieldScopeDelivery')}</MenuItem>
                </TextField>
                {field.type === 'select' ? (
                  <TextField size="small" label={t('dispatchFieldOptions')} placeholder="Bueno, Dañado" value={field.optionsText} onChange={(event) => update(index, { optionsText: event.target.value })} />
                ) : <Box />}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {ORDER_TYPES.map((type) => {
                    const active = !field.types?.length || field.types.includes(type);
                    return (
                      <Chip
                        key={type}
                        size="small"
                        label={typeLabel(t, type)}
                        color={active ? 'primary' : 'default'}
                        variant={active ? 'filled' : 'outlined'}
                        onClick={() => {
                          const current = field.types?.length ? field.types : ORDER_TYPES;
                          const next = current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
                          update(index, { types: next.length === ORDER_TYPES.length ? [] : next });
                        }}
                      />
                    );
                  })}
                </Stack>
                <Stack direction="row">
                  <Tooltip title={t('sharedRemove')}><IconButton size="small" onClick={() => setFields(fields.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  {index > 0 && <IconButton size="small" onClick={() => { const list = [...fields]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; setFields(list); }}><ArrowUpwardIcon fontSize="small" /></IconButton>}
                </Stack>
              </Box>
              <Stack direction="row" spacing={2}>
                <FormControlLabel control={<Checkbox size="small" checked={!!field.required} onChange={(event) => update(index, { required: event.target.checked })} />} label={t('dispatchFieldRequired')} />
                <FormControlLabel control={<Checkbox size="small" checked={!!field.showToCustomer} onChange={(event) => update(index, { showToCustomer: event.target.checked })} />} label={t('dispatchFieldCustomer')} />
              </Stack>
            </Box>
          ))}
        </Stack>
        <Button startIcon={<AddIcon />} sx={{ mt: 1.5 }} onClick={() => setFields([...fields, {
          key: `campo_${fields.length + 1}`, label: '', type: 'text', scope: 'order', required: false, showToCustomer: false, types: [], optionsText: '',
        }])}
        >
          {t('dispatchFieldAdd')}
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FieldsDialog;
