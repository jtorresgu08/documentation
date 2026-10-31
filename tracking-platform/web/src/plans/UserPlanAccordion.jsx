import { useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { moduleLabel } from '../common/util/modules';

// Plan of an account, chosen by a manager above it: inherit, one of the plans within the manager's own modules, or a
// custom selection of modules. What the account finally gets is always limited by the managers above it.
const UserPlanAccordion = ({ item, setItem }) => {
  const t = useTranslation();
  const [catalog, setCatalog] = useState(null);

  useEffectAsync(async () => {
    setCatalog(await (await fetchOrThrow('/api/plans')).json());
  }, []);

  if (!catalog) return null;
  const plan = item.attributes?.plan || '';
  const custom = (item.attributes?.modules || '').split(/[,;\s]+/).filter(Boolean);
  const setAttributes = (changes) => {
    const attributes = { ...item.attributes, ...changes };
    Object.keys(changes).forEach((key) => { if (changes[key] === undefined) delete attributes[key]; });
    setItem({ ...item, attributes });
  };
  const selected = catalog.plans.find((it) => it.id === plan);
  let granted = catalog.own;
  if (plan === 'custom') granted = custom;
  else if (selected) granted = selected.modules;
  const effective = catalog.modules.filter((module) => granted.includes(module) && catalog.own.includes(module));

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WorkspacePremiumIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1">{t('planTitle')}</Typography>
          {selected && <Chip size="small" label={selected.name} sx={{ bgcolor: selected.color, color: '#fff', fontWeight: 600 }} />}
          {plan === 'custom' && <Chip size="small" label={t('planCustom')} />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <TextField
            select
            label={t('planTitle')}
            value={plan}
            onChange={(event) => setAttributes(event.target.value === 'custom'
              ? { plan: 'custom', modules: effective.join(',') }
              : { plan: event.target.value || undefined, modules: undefined })}
          >
            <MenuItem value="">{t('planInherit')}</MenuItem>
            {catalog.plans.map((it) => (
              <MenuItem key={it.id} value={it.id} disabled={!catalog.assignable.includes(it.id)}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: it.color || 'primary.main', mr: 1.5 }} />
                <Box>
                  <Typography variant="body2" fontWeight={600}>{it.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {catalog.assignable.includes(it.id) ? it.description : t('planNotAssignable')}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
            <MenuItem value="custom">{t('planCustom')}</MenuItem>
          </TextField>
          {plan === 'custom' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {catalog.modules.filter((module) => catalog.own.includes(module)).map((module) => (
                <FormControlLabel
                  key={module}
                  control={(
                    <Checkbox
                      size="small"
                      checked={custom.includes(module)}
                      onChange={(event) => setAttributes({
                        modules: (event.target.checked ? [...custom, module] : custom.filter((it) => it !== module)).join(','),
                      })}
                    />
                  )}
                  label={moduleLabel(t, module)}
                />
              ))}
            </Box>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">{t('planEffective')}</Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
              {effective.length ? effective.map((module) => <Chip key={module} size="small" variant="outlined" color="primary" label={moduleLabel(t, module)} />)
                : <Typography variant="body2" color="text.secondary">{t('planBasicOnly')}</Typography>}
            </Stack>
          </Box>
          {!plan && <Alert severity="info" variant="outlined">{t('planInheritHelp')}</Alert>}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

export default UserPlanAccordion;
