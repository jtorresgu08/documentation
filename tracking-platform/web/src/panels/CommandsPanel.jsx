import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Chip, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ErrorIcon from '@mui/icons-material/Error';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import { Section } from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { prefixString } from '../common/util/stringUtils';
import { updatePanel } from '../common/util/floatingPanels';
import EngineCutDialog from '../common/components/EngineCutDialog';

const QUICK = ['positionSingle', 'engineResume', 'rebootDevice', 'custom'];

// Quick commands to one or several units: saved commands or command types of the first unit's protocol, custom
// text, a confirmation step and the result per unit (sent, queued until it connects, failed). Engine stop always
// goes through the safe cut dialog, one unit at a time.
const CommandsPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const devices = useSelector((state) => state.devices.items);
  const limitCommands = useSelector((state) => state.session.user.limitCommands);
  const deviceIds = panel.props.deviceIds || [];
  const [types, setTypes] = useState(QUICK);
  const [saved, setSaved] = useState([]);
  const [choice, setChoice] = useState('positionSingle');
  const [data, setData] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]);
  const [engineDevice, setEngineDevice] = useState(null);

  useEffect(() => {
    const first = deviceIds[0];
    if (!first) return;
    fetchOrThrow(`/api/commands/types?deviceId=${first}`).then((response) => response.json())
      .then((items) => {
        const list = [...new Set([...QUICK.filter((type) => type === 'custom' || items.some((item) => item.type === type)), ...items.map((item) => item.type)])];
        setTypes(list);
        setChoice((current) => (list.includes(current) || String(current).startsWith('saved-') ? current : list[0]));
      })
      .catch(() => {});
    fetchOrThrow(`/api/commands/send?deviceId=${first}`).then((response) => response.json()).then(setSaved).catch(() => setSaved([]));
  }, [deviceIds[0]]);

  const label = (value) => {
    if (String(value).startsWith('saved-')) return saved.find((item) => `saved-${item.id}` === value)?.description || value;
    return t(prefixString('command', value));
  };

  const send = async () => {
    setSending(true);
    const time = dayjs().format('HH:mm:ss');
    const list = [];
    for (const deviceId of deviceIds) {
      let command;
      if (String(choice).startsWith('saved-')) {
        command = { ...saved.find((item) => `saved-${item.id}` === choice), deviceId };
      } else {
        command = { deviceId, type: choice, attributes: choice === 'custom' ? { data } : {} };
      }
      try {
        const response = await fetchOrThrow('/api/commands/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        list.push({ deviceId, time, command: label(choice), status: response.status === 202 ? 'queued' : 'sent' });
      } catch (error) {
        list.push({ deviceId, time, command: label(choice), status: 'error', message: error.message });
      }
    }
    setResults((current) => [...list, ...current].slice(0, 30));
    setConfirm(false);
    setSending(false);
  };

  const icons = {
    sent: <CheckCircleIcon fontSize="small" color="success" />,
    queued: <ScheduleIcon fontSize="small" color="warning" />,
    error: <ErrorIcon fontSize="small" color="error" />,
  };

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<SendIcon fontSize="small" />}
      title={t('panelCommands')}
      subtitle={`${deviceIds.length} ${t('panelUnitsSelected')}`}
      width={380}
    >
      <Autocomplete
        multiple
        size="small"
        limitTags={3}
        options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
        getOptionLabel={(option) => option.name}
        value={deviceIds.map((id) => devices[id]).filter(Boolean)}
        onChange={(_, value) => updatePanel(panel.id, { props: { ...panel.props, deviceIds: value.map((device) => device.id) } })}
        renderInput={(params) => <TextField {...params} placeholder={t('deviceTitle')} />}
      />
      <TextField select fullWidth size="small" label={t('sharedType')} value={choice} onChange={(event) => { setChoice(event.target.value); setConfirm(false); }} sx={{ mt: 1 }}>
        {saved.map((item) => <MenuItem key={item.id} value={`saved-${item.id}`}>{`★ ${item.description}`}</MenuItem>)}
        {types.filter((type) => !limitCommands && type !== 'engineStop').map((type) => <MenuItem key={type} value={type}>{label(type)}</MenuItem>)}
      </TextField>
      {choice === 'custom' && <TextField fullWidth size="small" label={t('commandData')} value={data} onChange={(event) => setData(event.target.value)} sx={{ mt: 1 }} />}
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
        {deviceIds.slice(0, 6).map((id) => (
          <Chip key={id} size="small" variant="outlined" color="error" label={`${t('commandEngineStop')}: ${devices[id]?.name}`} onClick={() => setEngineDevice(id)} sx={{ height: 22, fontSize: 11 }} />
        ))}
      </Stack>
      {!confirm ? (
        <Button fullWidth variant="contained" startIcon={<SendIcon />} sx={{ mt: 1 }} disabled={!deviceIds.length || (choice === 'custom' && !data)} onClick={() => setConfirm(true)}>
          {t('commandSend')}
        </Button>
      ) : (
        <Alert
          severity="warning"
          sx={{ mt: 1 }}
          action={(
            <Stack direction="row" spacing={0.5}>
              <Button color="inherit" size="small" onClick={() => setConfirm(false)}>{t('sharedCancel')}</Button>
              <Button color="warning" variant="contained" size="small" disabled={sending} onClick={send}>{t('panelConfirm')}</Button>
            </Stack>
          )}
        >
          {`${label(choice)} → ${deviceIds.length} ${t('panelUnitsSelected')}`}
        </Alert>
      )}
      <Section title={t('panelResults')}>
        {!results.length && <Typography variant="caption" color="text.secondary">{t('panelNoCommandsYet')}</Typography>}
        {results.map((result, index) => (
          <Stack key={`${result.deviceId}-${index}`} direction="row" spacing={1} alignItems="center" sx={{ py: 0.5, px: 0.75, borderRadius: '8px', bgcolor: index % 2 ? 'transparent' : alpha(theme.palette.primary.main, 0.04) }}>
            {icons[result.status]}
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{`${devices[result.deviceId]?.name} · ${result.command}`}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">{result.message || t(`panelCommand${result.status.charAt(0).toUpperCase()}${result.status.slice(1)}`)}</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">{result.time}</Typography>
          </Stack>
        ))}
      </Section>
      <EngineCutDialog deviceId={engineDevice} mode={engineDevice ? 'stop' : null} onClose={() => setEngineDevice(null)} />
    </FloatingPanel>
  );
};

export default CommandsPanel;
