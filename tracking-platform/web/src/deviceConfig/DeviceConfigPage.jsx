import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReplayIcon from '@mui/icons-material/Replay';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import useCommandAttributes from '../common/attributes/useCommandAttributes';
import { prefixString } from '../common/util/stringUtils';

const FORBIDDEN = ['engineStop', 'engineResume'];
const STATUS_COLORS = {
  queued: '#e79a2b', sent: '#2563c9', answered: '#2f9e5b', failed: '#d9534f',
};

// Remote configuration of many devices at once: choose devices (search, group, model), the commands (by hand or from
// a template of the account or the distributor) and send; each job shows per device queued, sent, answered or failed
const DeviceConfigPage = () => {
  const t = useTranslation();
  const devices = useSelector((state) => Object.values(state.devices.items).sort((a, b) => a.name.localeCompare(b.name)));
  const groups = useSelector((state) => state.groups.items);
  const textEnabled = useSelector((state) => state.session.server.textEnabled);
  const commandAttributes = useCommandAttributes(t);
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState(null);
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [model, setModel] = useState('');
  const [selected, setSelected] = useState([]);
  const [commands, setCommands] = useState([{ type: 'custom', textChannel: false, attributes: { data: '' } }]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  const loadJobs = async () => setJobs(await (await fetch('/api/device-config/jobs')).json());
  const loadTemplates = async () => setTemplates(await (await fetch('/api/device-config/templates')).json());
  useEffect(() => {
    fetch('/api/commands/types').then((response) => response.json()).then((items) => setTypes(items.map((item) => item.type).filter((type) => !FORBIDDEN.includes(type))));
    loadTemplates();
    loadJobs();
  }, []);
  useEffect(() => {
    if (!jobs?.some((job) => job.counts.queued || job.counts.sent)) return undefined;
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  const models = useMemo(() => [...new Set(devices.map((device) => device.model).filter(Boolean))].sort(), [devices]);
  const filtered = devices.filter((device) => (!search || `${device.name} ${device.uniqueId}`.toLowerCase().includes(search.toLowerCase()))
    && (!groupId || device.groupId === groupId) && (!model || device.model === model));
  const allSelected = filtered.length > 0 && filtered.every((device) => selected.includes(device.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !filtered.some((device) => device.id === id)) : [...new Set([...selected, ...filtered.map((device) => device.id)])]);

  const setCommand = (index, changes) => setCommands(commands.map((command, i) => (i === index ? { ...command, ...changes } : command)));
  const setType = (index, type) => {
    const defaults = {};
    (commandAttributes[type] || []).forEach((attribute) => {
      defaults[attribute.key] = attribute.type === 'boolean' ? false : attribute.type === 'number' ? 0 : '';
    });
    setCommand(index, { type, attributes: defaults });
  };

  const send = async () => {
    setError(null);
    const response = await fetch('/api/device-config/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name || t('deviceConfigJob'), deviceIds: selected, commands }),
    });
    if (response.ok) {
      setSelected([]);
      loadJobs();
    } else {
      setError((await response.text()).split('\n')[0]);
    }
  };
  const retry = async (job) => {
    await fetch(`/api/device-config/jobs/${job.id}/retry`, { method: 'POST' });
    loadJobs();
  };
  const saveTemplate = async () => {
    const own = templates.filter((template) => template.own);
    const response = await fetch('/api/device-config/templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([...own, { name: saving.name, description: saving.description, commands }]),
    });
    if (response.ok) {
      setTemplates(await response.json());
      setSaving(null);
    } else {
      setError((await response.text()).split('\n')[0]);
    }
  };
  const removeTemplate = async (template) => {
    const response = await fetch('/api/device-config/templates', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(templates.filter((item) => item.own && item.id !== template.id)),
    });
    if (response.ok) setTemplates(await response.json());
  };
  const statusLabel = (status) => t(`deviceConfigStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>{t('deviceConfigTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('deviceConfigSubtitle')}</Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, alignItems: 'start' }}>
        <Card variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{`1. ${t('deviceConfigDevices')}`}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
            <TextField size="small" label={t('sharedSearch')} value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flexGrow: 1 }} />
            <TextField select size="small" label={t('groupParent')} value={groupId} onChange={(event) => setGroupId(event.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">{t('deviceConfigAll')}</MenuItem>
              {Object.values(groups).map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('deviceModel')} value={model} onChange={(event) => setModel(event.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">{t('deviceConfigAll')}</MenuItem>
              {models.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </TextField>
          </Stack>
          <Box sx={{ maxHeight: 360, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox"><Checkbox checked={allSelected} indeterminate={!allSelected && filtered.some((device) => selected.includes(device.id))} onChange={toggleAll} /></TableCell>
                  <TableCell>{t('sharedDevice')}</TableCell>
                  <TableCell>{t('deviceIdentifier')}</TableCell>
                  <TableCell>{t('deviceModel')}</TableCell>
                  <TableCell>{t('deviceStatus')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((device) => (
                  <TableRow key={device.id} hover onClick={() => setSelected(selected.includes(device.id) ? selected.filter((id) => id !== device.id) : [...selected, device.id])} sx={{ cursor: 'pointer' }}>
                    <TableCell padding="checkbox"><Checkbox checked={selected.includes(device.id)} /></TableCell>
                    <TableCell>{device.name}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{device.uniqueId}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{device.model || '—'}</TableCell>
                    <TableCell><Chip size="small" label={t(prefixString('deviceStatus', device.status || 'unknown'))} color={device.status === 'online' ? 'success' : 'default'} variant="outlined" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="body2" sx={{ mt: 1 }} fontWeight={600}>{t('deviceConfigSelected').replace('{0}', selected.length)}</Typography>
        </Card>
        <Card variant="outlined" sx={{ borderRadius: 4, p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{`2. ${t('deviceConfigCommands')}`}</Typography>
          <Autocomplete
            size="small"
            options={templates}
            groupBy={(option) => (option.own ? t('deviceConfigMine') : `${t('deviceConfigFrom')} ${option.owner}`)}
            getOptionLabel={(option) => option.name}
            renderOption={(props, option) => (
              <li {...props} key={`${option.owner}-${option.id}`}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{option.commands.map((command) => t(prefixString('command', command.type))).join(' · ')}</Typography>
                </Box>
                {option.own && <IconButton size="small" onClick={(event) => { event.stopPropagation(); removeTemplate(option); }}><DeleteIcon fontSize="small" /></IconButton>}
              </li>
            )}
            onChange={(_, template) => template && (setCommands(template.commands.map((command) => ({ ...command, attributes: { ...command.attributes } }))), setName(template.name))}
            renderInput={(params) => <TextField {...params} label={t('deviceConfigTemplate')} />}
            sx={{ mb: 2 }}
          />
          <Stack spacing={1.5}>
            {commands.map((command, index) => (
              <Card key={`command-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip size="small" label={index + 1} />
                  <TextField select size="small" label={t('sharedType')} value={types.includes(command.type) ? command.type : ''} onChange={(event) => setType(index, event.target.value)} sx={{ flexGrow: 1 }}>
                    {types.map((type) => <MenuItem key={type} value={type}>{t(prefixString('command', type))}</MenuItem>)}
                  </TextField>
                  {commands.length > 1 && <IconButton size="small" onClick={() => setCommands(commands.filter((_, i) => i !== index))}><DeleteIcon fontSize="small" /></IconButton>}
                </Stack>
                <Stack spacing={1}>
                  {(commandAttributes[command.type] || []).map((attribute) => (attribute.type === 'boolean' ? (
                    <FormControlLabel key={attribute.key} control={<Checkbox checked={Boolean(command.attributes[attribute.key])} onChange={(event) => setCommand(index, { attributes: { ...command.attributes, [attribute.key]: event.target.checked } })} />} label={attribute.name} />
                  ) : (
                    <TextField
                      key={attribute.key}
                      size="small"
                      type={attribute.type === 'number' ? 'number' : 'text'}
                      label={attribute.name}
                      value={command.attributes[attribute.key] ?? ''}
                      onChange={(event) => setCommand(index, { attributes: { ...command.attributes, [attribute.key]: attribute.type === 'number' ? Number(event.target.value) : event.target.value } })}
                    />
                  )))}
                  {textEnabled && <FormControlLabel control={<Checkbox checked={command.textChannel} onChange={(event) => setCommand(index, { textChannel: event.target.checked })} />} label={t('commandSendSms')} />}
                </Stack>
              </Card>
            ))}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<AddIcon />} disabled={commands.length >= 20} onClick={() => setCommands([...commands, { type: 'custom', textChannel: false, attributes: { data: '' } }])}>{t('deviceConfigAddCommand')}</Button>
            <Button size="small" startIcon={<SaveIcon />} onClick={() => setSaving({ name, description: '' })}>{t('deviceConfigSaveTemplate')}</Button>
          </Stack>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2, mb: 1 }}>{`3. ${t('deviceConfigSend')}`}</Typography>
          {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" label={t('deviceConfigJobName')} value={name} onChange={(event) => setName(event.target.value)} sx={{ flexGrow: 1 }} />
            <Button variant="contained" startIcon={<SendIcon />} disabled={!selected.length} onClick={send}>{t('deviceConfigSendTo').replace('{0}', selected.length)}</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>{t('deviceConfigHelp')}</Typography>
        </Card>
      </Box>
      <Typography variant="h6" fontWeight={700} sx={{ mt: 3, mb: 1 }}>{t('deviceConfigJobs')}</Typography>
      {!jobs && <LinearProgress />}
      {jobs && !jobs.length && <Typography variant="body2" color="text.secondary">{t('deviceConfigNoJobs')}</Typography>}
      {jobs?.map((job) => {
        const total = job.results.length;
        const done = (job.counts.sent || 0) + (job.counts.answered || 0);
        return (
          <Accordion key={job.id} disableGutters variant="outlined" sx={{ borderRadius: 3, mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ width: '100%', pr: 1 }}>
                <Box sx={{ minWidth: 220 }}>
                  <Typography fontWeight={700}>{job.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{`${dayjs(job.created).format('DD/MM HH:mm')} · ${job.commands.map((command) => t(prefixString('command', command.type))).join(' · ')}`}</Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }}>
                  <LinearProgress variant="determinate" value={(done / total) * 100} sx={{ height: 8, borderRadius: 4 }} />
                </Box>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {Object.entries(job.counts).map(([status, count]) => (
                    <Chip key={status} size="small" label={`${statusLabel(status)} ${count}`} sx={{ bgcolor: `${STATUS_COLORS[status]}22`, color: STATUS_COLORS[status], fontWeight: 700 }} />
                  ))}
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {job.counts.failed > 0 && <Button size="small" startIcon={<ReplayIcon />} onClick={() => retry(job)} sx={{ mb: 1 }}>{t('deviceConfigRetry')}</Button>}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('sharedDevice')}</TableCell>
                    <TableCell>{t('deviceStatus')}</TableCell>
                    <TableCell>{t('deviceConfigReply')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {job.results.map((result) => (
                    <TableRow key={result.deviceId}>
                      <TableCell>{result.name}</TableCell>
                      <TableCell><Chip size="small" label={statusLabel(result.status)} sx={{ bgcolor: `${STATUS_COLORS[result.status]}22`, color: STATUS_COLORS[result.status], fontWeight: 700 }} /></TableCell>
                      <TableCell sx={{ color: result.error ? '#d9534f' : 'text.secondary' }}>{result.reply || result.error || (result.status === 'queued' ? t('deviceConfigWaiting') : '—')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionDetails>
          </Accordion>
        );
      })}
      {saving && (
        <Dialog open onClose={() => setSaving(null)} fullWidth maxWidth="xs">
          <DialogTitle>{t('deviceConfigSaveTemplate')}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField label={t('sharedName')} value={saving.name} onChange={(event) => setSaving({ ...saving, name: event.target.value })} />
              <TextField label={t('sharedDescription')} value={saving.description} onChange={(event) => setSaving({ ...saving, description: event.target.value })} />
              <Typography variant="caption" color="text.secondary">{t('deviceConfigTemplateHelp')}</Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSaving(null)}>{t('sharedCancel')}</Button>
            <Button variant="contained" disabled={!saving.name} onClick={saveTemplate}>{t('sharedSave')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Container>
  );
};

export default DeviceConfigPage;
