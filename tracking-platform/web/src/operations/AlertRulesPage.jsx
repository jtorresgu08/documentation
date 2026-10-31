import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, Container, Grid, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Switch,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ScheduleIcon from '@mui/icons-material/Schedule';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useRestriction } from '../common/util/permissions';
import { SEVERITY_COLORS, capitalize } from './alertUtils';
import { RULE_TEMPLATES, emptyRule } from './alertRuleTypes';
import { RULE_ICONS } from './ruleIcons';
import RuleWizard from './RuleWizard';

const parse = (rule) => {
  try {
    return { ...rule, config: { ...emptyRule().config, ...JSON.parse(rule.config || '{}') } };
  } catch {
    return { ...rule, config: emptyRule().config };
  }
};

// Custom alerts, Wialon style: the user's rules with their kind, units, schedule, channels and alerts of the last 7
// days; enable or pause, edit, duplicate, delete, start from a template, and the history of triggered alerts
const AlertRulesPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => state.devices.items);
  const [rules, setRules] = useState(null);
  const [events, setEvents] = useState(null);
  const [tab, setTab] = useState('rules');
  const [editing, setEditing] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [rulesResponse, eventsResponse] = await Promise.all([
        fetchOrThrow('/api/alert-rules'),
        fetchOrThrow('/api/alert-rules/events?days=7'),
      ]);
      setRules((await rulesResponse.json()).map(parse));
      setEvents(await eventsResponse.json());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const persist = async (rule) => {
    await fetchOrThrow(`/api/alert-rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rule, config: JSON.stringify(rule.config) }),
    });
    load();
  };

  const remove = async (rule) => {
    await fetchOrThrow(`/api/alert-rules/${rule.id}`, { method: 'DELETE' });
    load();
  };

  const ruleNames = useMemo(() => Object.fromEntries((rules || []).map((rule) => [rule.id, rule.name])), [rules]);
  const visible = (rules || []).filter((rule) => rule.name.toLowerCase().includes(search.toLowerCase()));
  const active = (rules || []).filter((rule) => rule.enabled).length;
  const week = (rules || []).reduce((sum, rule) => sum + (rule.week || 0), 0);

  const units = (config) => {
    if (config.all) return `${t('ruleAllUnits')} (${Object.keys(devices).length})`;
    const parts = [];
    if (config.groupIds?.length) parts.push(`${config.groupIds.length} ${t('settingsGroups').toLowerCase()}`);
    if (config.deviceIds?.length) parts.push(config.deviceIds.length <= 2 ? config.deviceIds.map((id) => devices[id]?.name).join(', ') : `${config.deviceIds.length} ${t('quickVehicles')}`);
    return parts.join(' · ') || '—';
  };

  const scheduleText = (config) => {
    if (!config.schedule) return t('ruleAlways');
    const days = config.schedule.days.map((day) => t(`ruleDay${day}`)).join(' ');
    return `${config.schedule.invert ? `${t('ruleOutside')} ` : ''}${days} ${config.schedule.from}–${config.schedule.to}`;
  };

  const Kpi = ({ label, value, color }) => (
    <Card variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color }}>{value}</Typography>
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('ruleTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('ruleSubtitle')}</Typography>
        </Box>
        <Button variant="outlined" onClick={() => navigate('/alert-center')} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t('alertCenterTitle')}</Button>
        {!readonly && <Button variant="outlined" startIcon={<LibraryAddIcon />} onClick={(event) => setTemplates(event.currentTarget)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t('ruleTemplates')}</Button>}
        {!readonly && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(emptyRule())} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{t('ruleNew')}</Button>}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('ruleCount')} value={rules?.length ?? '—'} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('ruleActive')} value={active} color={theme.palette.success.main} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('ruleWeekAlerts')} value={week} color={SEVERITY_COLORS.high} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi label={t('ruleCritical')} value={(events || []).filter((event) => event.attributes?.severity === 'critical').length} color={SEVERITY_COLORS.critical} /></Grid>
      </Grid>
      <Card variant="outlined">
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} sx={{ px: 1.5 }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ flexGrow: 1 }}>
            <Tab value="rules" label={`${t('ruleTabRules')} (${rules?.length || 0})`} />
            <Tab value="history" label={`${t('ruleTabHistory')} (${events?.length || 0})`} />
          </Tabs>
          {tab === 'rules' && <TextField size="small" placeholder={t('sharedSearch')} value={search} onChange={(event) => setSearch(event.target.value)} sx={{ my: 1 }} />}
        </Stack>
        {tab === 'rules' && (
          <Box sx={{ overflowX: 'auto' }}>
            {rules && !rules.length && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body1" gutterBottom>{t('ruleEmpty')}</Typography>
                {!readonly && <Button variant="outlined" startIcon={<LibraryAddIcon />} onClick={(event) => setTemplates(event.currentTarget)}>{t('ruleStartTemplate')}</Button>}
              </Box>
            )}
            {visible.length > 0 && (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('ruleTitleColumn')}</TableCell>
                    <TableCell>{t('deviceTitle')}</TableCell>
                    <TableCell>{t('ruleSchedule')}</TableCell>
                    <TableCell>{t('ruleChannels')}</TableCell>
                    <TableCell align="right">{t('rule7days')}</TableCell>
                    <TableCell align="center">{t('ruleEnabled')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((rule) => {
                    const Icon = RULE_ICONS[rule.config.type] || RULE_ICONS.event;
                    const color = SEVERITY_COLORS[rule.config.severity] || SEVERITY_COLORS.medium;
                    return (
                      <TableRow key={rule.id} hover sx={{ opacity: rule.enabled ? 1 : 0.55 }}>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} alignItems="center">
                            <Box sx={{ width: 34, height: 34, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.12), color }}><Icon fontSize="small" /></Box>
                            <Box>
                              <Typography variant="body2" fontWeight={700}>{rule.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{`${t(`ruleType${capitalize(rule.config.type)}`)} · ${t(`alertSeverity${capitalize(rule.config.severity || 'medium')}`)}${rule.config.extra?.length ? ` · +${rule.config.extra.length} ${t('ruleConditions')}` : ''}${rule.config.command ? ` · ${t('ruleWithCommand')}` : ''}`}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell><Typography variant="body2">{units(rule.config)}</Typography></TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {rule.config.schedule && <ScheduleIcon sx={{ fontSize: 16 }} color="action" />}
                            <Typography variant="body2">{scheduleText(rule.config)}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                            {(rule.config.channels || []).map((channel) => <Chip key={channel} size="small" label={t(`notificator${capitalize(channel)}`)} sx={{ height: 20, fontSize: 11 }} />)}
                            {rule.config.phones && <Chip size="small" label="WhatsApp +" sx={{ height: 20, fontSize: 11 }} />}
                            {rule.config.emails && <Chip size="small" label="Email +" sx={{ height: 20, fontSize: 11 }} />}
                          </Stack>
                        </TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: rule.week ? color : 'text.secondary' }}>{rule.week || 0}</Typography></TableCell>
                        <TableCell align="center"><Switch size="small" checked={rule.enabled} disabled={readonly} onChange={(event) => persist({ ...rule, enabled: event.target.checked })} /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {!readonly && (
                            <>
                              <IconButton size="small" onClick={() => setEditing(rule)}><EditIcon fontSize="small" /></IconButton>
                              <Tooltip title={t('sharedDuplicate')}><IconButton size="small" onClick={() => setEditing({ ...rule, id: undefined, name: `${rule.name} (2)` })}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                              <IconButton size="small" onClick={() => remove(rule)}><DeleteIcon fontSize="small" /></IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
        {tab === 'history' && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('positionFixTime')}</TableCell>
                  <TableCell>{t('ruleTitleColumn')}</TableCell>
                  <TableCell>{t('reportDevice')}</TableCell>
                  <TableCell>{t('ruleMessage')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(events || []).map((event) => (
                  <TableRow key={event.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(event.eventTime).format('DD/MM HH:mm')}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SEVERITY_COLORS[event.attributes?.severity] || SEVERITY_COLORS.medium }} />
                        <span>{ruleNames[event.attributes?.ruleId] || event.attributes?.ruleName}</span>
                      </Stack>
                    </TableCell>
                    <TableCell>{devices[event.deviceId]?.name}</TableCell>
                    <TableCell>{event.attributes?.message}</TableCell>
                  </TableRow>
                ))}
                {events && !events.length && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">{t('ruleNoHistory')}</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>
      <Menu anchorEl={templates} open={Boolean(templates)} onClose={() => setTemplates(null)} slotProps={{ paper: { sx: { maxHeight: 480, width: 380 } } }}>
        {RULE_TEMPLATES.map((template) => {
          const Icon = RULE_ICONS[template.config.type];
          return (
            <MenuItem key={template.name} onClick={() => { setTemplates(null); setEditing({ ...emptyRule(), name: t(template.name), config: template.config }); }}>
              <ListItemIcon><Icon fontSize="small" sx={{ color: SEVERITY_COLORS[template.config.severity] }} /></ListItemIcon>
              <ListItemText primary={t(template.name)} secondary={t(`${template.name}Help`)} slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }} />
            </MenuItem>
          );
        })}
      </Menu>
      <RuleWizard open={Boolean(editing)} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </Container>
  );
};

export default AlertRulesPage;
