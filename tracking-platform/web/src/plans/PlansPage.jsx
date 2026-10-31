import { useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Container, Grid, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { moduleLabel } from '../common/util/modules';

const COLORS = ['#78909c', '#2563c9', '#8e44ad', '#1a9aa3', '#e67e22', '#2f9e5b', '#c0392b'];

// Plan catalog (administrator): name, description, monthly price per unit, color and modules of each plan. Accounts
// get a plan from the manager above them; a plan in use cannot be removed.
const PlansPage = () => {
  const t = useTranslation();
  const [catalog, setCatalog] = useState(null);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState({});
  const [message, setMessage] = useState(null);

  useEffectAsync(async () => {
    const data = await (await fetchOrThrow('/api/plans')).json();
    setCatalog(data);
    setPlans(data.plans);
    const summary = await fetch('/api/reseller/summary');
    if (summary.ok) setUsage((await summary.json()).plans || {});
  }, []);

  const update = (index, changes) => setPlans(plans.map((plan, i) => (i === index ? { ...plan, ...changes } : plan)));

  const save = async () => {
    setMessage(null);
    const response = await fetch('/api/plans', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plans) });
    if (response.ok) {
      setPlans(await response.json());
      setMessage({ severity: 'success', text: t('plansSaved') });
    } else {
      const text = await response.text();
      setMessage({ severity: 'error', text: text.includes('in use') ? t('plansInUse') : text.split('\n')[0] });
    }
  };

  if (!catalog) return null;
  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{t('plansTitle')}</Typography>
        <Button startIcon={<AddIcon />} onClick={() => setPlans([...plans, {
          id: `plan${plans.length + 1}`, name: t('plansNew'), description: '', price: 0, color: COLORS[plans.length % COLORS.length], modules: [],
        }])}
        >
          {t('plansAdd')}
        </Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('plansHelp')}</Typography>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <Grid container spacing={2}>
        {plans.map((plan, index) => (
          <Grid key={plan.id + index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card variant="outlined" sx={{ borderRadius: 3, height: '100%', borderTop: `4px solid ${plan.color || '#2563c9'}` }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <TextField variant="standard" value={plan.name} onChange={(event) => update(index, { name: event.target.value })} slotProps={{ input: { sx: { fontWeight: 700, fontSize: 18 } } }} sx={{ flexGrow: 1 }} />
                    <Tooltip title={t('sharedRemove')}>
                      <IconButton size="small" onClick={() => setPlans(plans.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={`${usage[plan.id] || 0} ${t('plansAccounts')}`} />
                    <Typography variant="caption" color="text.secondary">{`id: ${plan.id}`}</Typography>
                  </Stack>
                  <TextField size="small" multiline minRows={2} label={t('sharedDescription')} value={plan.description || ''} onChange={(event) => update(index, { description: event.target.value })} />
                  <TextField size="small" type="number" label={t('plansPrice')} value={plan.price ?? 0} onChange={(event) => update(index, { price: Number(event.target.value) })} slotProps={{ input: { startAdornment: <InputAdornment position="start">S/</InputAdornment> } }} />
                  <Stack direction="row" spacing={0.75}>
                    {COLORS.map((color) => (
                      <Box key={color} onClick={() => update(index, { color })} sx={{
 width: 22, height: 22, borderRadius: '50%', bgcolor: color, cursor: 'pointer', outline: plan.color === color ? '2px solid' : 'none', outlineOffset: 2, outlineColor: color 
}} />
                    ))}
                  </Stack>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{`${t('plansModules')} (${plan.modules.length}/${catalog.modules.length})`}</Typography>
                    {catalog.modules.map((module) => (
                      <Stack key={module} direction="row" alignItems="center" sx={{ ml: -1 }}>
                        <Checkbox size="small" checked={plan.modules.includes(module)} onChange={(event) => update(index, { modules: event.target.checked ? [...plan.modules, module] : plan.modules.filter((it) => it !== module) })} />
                        <Typography variant="body2">{moduleLabel(t, module)}</Typography>
                      </Stack>
                    ))}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default PlansPage;
