import { useEffect, useState } from 'react';
import {
  Checkbox, FormControlLabel, MenuItem, TextField,
} from '@mui/material';

export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'];

// fields that apply to an order type and scope (order: filled when creating the order; delivery: by the driver)
export const fieldsFor = (fields, scope, type) => (fields || []).filter((field) => field.scope === scope
  && (!field.types?.length || field.types.includes(type || 'delivery')));

export const customValue = (item, field) => item?.attributes?.[`custom.${field.key}`];

export const formatCustom = (field, value, t) => {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'checkbox') return value ? t('sharedYes') : t('sharedNo');
  return String(value);
};

export const missingRequired = (fields, values) => fields.filter((field) => field.required
  && (field.type === 'checkbox' ? !values[field.key] : !String(values[field.key] ?? '').trim()));

export const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/^([0-9])/, 'c$1')
  .slice(0, 32) || 'campo';

// custom fields of the user's company (its own and the inherited ones)
export const useDispatchFields = () => {
  const [state, setState] = useState({ fields: [], own: [], editable: false });
  const load = async () => {
    const response = await fetch('/api/dispatch/fields');
    if (response.ok) setState(await response.json());
  };
  useEffect(() => {
    load();
  }, []);
  return { ...state, reload: load };
};

// one input per field type
export const CustomFieldInput = ({
  field, value, onChange, t,
}) => {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  switch (field.type) {
    case 'checkbox':
      return <FormControlLabel control={<Checkbox checked={!!value} onChange={(event) => onChange(event.target.checked)} />} label={label} />;
    case 'select':
      return (
        <TextField size="small" select fullWidth label={label} value={value || ''} onChange={(event) => onChange(event.target.value)}>
          <MenuItem value="">{t('sharedNone')}</MenuItem>
          {field.options.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </TextField>
      );
    case 'date':
      return <TextField size="small" fullWidth type="date" label={label} value={value || ''} onChange={(event) => onChange(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />;
    case 'number':
      return <TextField size="small" fullWidth type="number" label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
    default:
      return <TextField size="small" fullWidth label={label} value={value || ''} onChange={(event) => onChange(event.target.value)} />;
  }
};
