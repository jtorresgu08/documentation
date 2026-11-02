import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import EngineeringIcon from '@mui/icons-material/Engineering';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useManager, useModule } from '../common/util/permissions';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { capitalize, statusLabel } from './installationsUtils';

const STATUSES = ['open', 'inProgress', 'waiting', 'resolved', 'closed'];
const CATEGORIES = ['noSignal', 'damage', 'installation', 'app', 'billing', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const COLORS = {
  open: '#2563c9', inProgress: '#e0a100', waiting: '#8e44ad', resolved: '#2e9d5b', closed: '#8a94a6', low: '#8a94a6', normal: '#2563c9', high: '#e67e22', urgent: '#d9534f',
};
const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const Pill = ({ label, value }) => <Chip size="small" label={label} sx={{ bgcolor: `${COLORS[value]}22`, color: COLORS[value], fontWeight: 700 }} />;

const NewTicket = ({ onClose, onSaved }) => {
  const t = useTranslation();
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [ticket, setTicket] = useState({ category: 'noSignal', priority: 'normal', deviceId: '' });
  const save = useCatch(async () => {
    await fetchOrThrow('/api/support/tickets', { method: 'POST', ...json({ ...ticket, deviceId: Number(ticket.deviceId) || 0 }) });
    onSaved();
  });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('supportNew')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label={t('supportSubject')} value={ticket.subject || ''} onChange={(event) => setTicket({ ...ticket, subject: event.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField select size="small" label={t('supportCategory')} value={ticket.category} onChange={(event) => setTicket({ ...ticket, category: event.target.value })} sx={{ flex: 1 }}>
              {CATEGORIES.map((item) => <MenuItem key={item} value={item}>{t(`supportCategory${capitalize(item)}`)}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('supportPriority')} value={ticket.priority} onChange={(event) => setTicket({ ...ticket, priority: event.target.value })} sx={{ flex: 1 }}>
              {PRIORITIES.map((item) => <MenuItem key={item} value={item}>{t(`supportPriority${capitalize(item)}`)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField select size="small" label={t('supportDevice')} value={ticket.deviceId} onChange={(event) => setTicket({ ...ticket, deviceId: event.target.value })}>
            <MenuItem value="">{t('supportNoDevice')}</MenuItem>
            {devices.map((device) => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
          </TextField>
          <TextField multiline minRows={4} label={t('supportDescription')} value={ticket.description || ''} onChange={(event) => setTicket({ ...ticket, description: event.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save} disabled={!ticket.subject}>{t('supportSend')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const SendTechnician = ({ ticket, onClose, onSaved }) => {
  const t = useTranslation();
  const [technicians, setTechnicians] = useState([]);
  const [value, setValue] = useState({ technicianId: '', scheduledAt: dayjs().add(1, 'day').hour(9).minute(0).format('YYYY-MM-DDTHH:mm'), address: '' });
  useEffect(() => {
    fetch('/api/installations/technicians').then((response) => (response.ok ? response.json() : [])).then(setTechnicians);
  }, []);
  const save = useCatch(async () => {
    await fetchOrThrow(`/api/support/tickets/${ticket.id}/order`, {
      method: 'POST', ...json({ ...value, technicianId: Number(value.technicianId) || 0, scheduledAt: dayjs(value.scheduledAt).toISOString() }),
    });
    onSaved();
  });
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('supportSendTechnician')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select size="small" label={t('instTechnician')} value={value.technicianId} onChange={(event) => setValue({ ...value, technicianId: event.target.value })}>
            <MenuItem value="">{t('instUnassigned')}</MenuItem>
            {technicians.filter((tech) => tech.active).map((tech) => <MenuItem key={tech.id} value={tech.id}>{tech.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="datetime-local" label={t('instScheduledAt')} value={value.scheduledAt} onChange={(event) => setValue({ ...value, scheduledAt: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label={t('instAddress')} value={value.address} onChange={(event) => setValue({ ...value, address: event.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('supportCreateOrder')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const TicketDetail = ({
  ticketId, team, onChanged,
}) => {
  const t = useTranslation();
  const [ticket, setTicket] = useState(null);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const load = () => fetch(`/api/support/tickets/${ticketId}`).then((response) => response.json()).then(setTicket);
  useEffect(() => {
    load();
  }, [ticketId]);
  const send = useCatch(async () => {
    const response = await fetchOrThrow(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', ...json({ text, internal }) });
    setTicket(await response.json());
    setText('');
    onChanged();
  });
  const update = useCatch(async (changes) => {
    const response = await fetchOrThrow(`/api/support/tickets/${ticketId}`, { method: 'PUT', ...json(changes) });
    setTicket(await response.json());
    onChanged();
  });
  if (!ticket) return <LinearProgress />;
  const handler = team && ticket.canHandle;
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 480 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" fontWeight={700}>{`#${ticket.id} · ${ticket.subject}`}</Typography>
          <Typography variant="caption" color="text.secondary">
            {`${ticket.userName} · ${t(`supportCategory${capitalize(ticket.category)}`)}${ticket.deviceName ? ` · ${ticket.deviceName}` : ''} · ${dayjs(ticket.createdAt).format('DD/MM/YYYY HH:mm')}`}
          </Typography>
        </Box>
        {handler ? (
          <>
            <TextField select size="small" value={ticket.priority} onChange={(event) => update({ priority: event.target.value })} sx={{ minWidth: 110 }}>
              {PRIORITIES.map((item) => <MenuItem key={item} value={item}>{t(`supportPriority${capitalize(item)}`)}</MenuItem>)}
            </TextField>
            <TextField select size="small" value={ticket.status} onChange={(event) => update({ status: event.target.value })} sx={{ minWidth: 140 }}>
              {STATUSES.map((item) => <MenuItem key={item} value={item}>{t(`supportStatus${capitalize(item)}`)}</MenuItem>)}
            </TextField>
          </>
        ) : (
          <>
            <Pill label={t(`supportStatus${capitalize(ticket.status)}`)} value={ticket.status} />
            {ticket.status !== 'closed' && <Button size="small" onClick={() => update({ status: 'closed' })}>{t('supportClose')}</Button>}
          </>
        )}
      </Stack>
      {ticket.description && <Alert severity="info" icon={false} sx={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</Alert>}
      {ticket.deviceName && team && (
        <Typography variant="body2">{`${t('supportDeviceLastReport')}: ${ticket.deviceLastUpdate ? dayjs(ticket.deviceLastUpdate).fromNow() : '—'}`}</Typography>
      )}
      {ticket.workOrderId > 0 && (
        <Alert severity="success" icon={<EngineeringIcon />}>
          {`${t('supportVisit')} #${ticket.workOrderId} · ${statusLabel(t, ticket.workOrderStatus)}${ticket.workOrderScheduledAt ? ` · ${dayjs(ticket.workOrderScheduledAt).format('DD/MM HH:mm')}` : ''}`}
        </Alert>
      )}
      <Box sx={{
        flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', maxHeight: 420, py: 1,
      }}
      >
        {ticket.messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              alignSelf: message.mine ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              p: 1.25,
              borderRadius: 2,
              bgcolor: message.internal ? '#fff7e0' : message.mine ? 'primary.main' : 'action.hover',
              color: message.mine && !message.internal ? '#fff' : 'text.primary',
              border: message.internal ? '1px dashed #e0a100' : 'none',
            }}
          >
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'block' }}>
              {`${message.author || ''}${message.internal ? ` · ${t('supportInternal')}` : ''} · ${dayjs(message.time).format('DD/MM HH:mm')}`}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography>
          </Box>
        ))}
        {!ticket.messages.length && <Typography variant="body2" color="text.secondary">{t('supportNoMessages')}</Typography>}
      </Box>
      {ticket.status !== 'closed' && (
        <Stack spacing={1}>
          <TextField multiline minRows={2} size="small" placeholder={t('supportWrite')} value={text} onChange={(event) => setText(event.target.value)} />
          <Stack direction="row" spacing={1} alignItems="center">
            {handler && <FormControlLabel control={<Checkbox size="small" checked={internal} onChange={(event) => setInternal(event.target.checked)} />} label={t('supportInternalNote')} />}
            <Box sx={{ flexGrow: 1 }} />
            {handler && !ticket.workOrderId && <Button startIcon={<EngineeringIcon />} onClick={() => setSending(true)}>{t('supportSendTechnician')}</Button>}
            <Button variant="contained" endIcon={<SendIcon />} onClick={send} disabled={!text.trim()}>{t('supportSend')}</Button>
          </Stack>
        </Stack>
      )}
      {sending && <SendTechnician ticket={ticket} onClose={() => setSending(false)} onSaved={() => { setSending(false); load(); onChanged(); }} />}
    </Card>
  );
};

// Support: clients open tickets and follow them; the support team answers and sends technicians
const SupportPage = () => {
  const t = useTranslation();
  const admin = useAdministrator();
  const manager = useManager();
  const installations = useModule('installations');
  const team = admin || (manager && installations);
  const [tickets, setTickets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => fetch(`/api/support/tickets${status ? `?status=${status}` : ''}`).then((response) => response.json()).then((list) => {
    setTickets(list);
    setSelected((current) => current || list[0]?.id || null);
  });
  useEffect(() => {
    load();
  }, [status]);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('supportTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{team ? t('supportSubtitleTeam') : t('supportSubtitle')}</Typography>
        </Box>
        <Button variant="contained" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setCreating(true)}>{t('supportNew')}</Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={t('simAll')} color={!status ? 'primary' : 'default'} onClick={() => setStatus('')} />
        {STATUSES.map((item) => <Chip key={item} size="small" label={t(`supportStatus${capitalize(item)}`)} color={status === item ? 'primary' : 'default'} onClick={() => setStatus(item)} />)}
      </Stack>
      {!tickets && <LinearProgress />}
      {tickets && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, gap: 2 }}>
          <Stack spacing={1}>
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                variant="outlined"
                onClick={() => setSelected(ticket.id)}
                sx={{
                  p: 1.5, borderRadius: 3, cursor: 'pointer', borderColor: selected === ticket.id ? 'primary.main' : undefined, borderLeft: 4, borderLeftColor: COLORS[ticket.priority],
                }}
              >
                <Stack direction="row" spacing={1} justifyContent="space-between">
                  <Typography variant="body2" fontWeight={700} noWrap>{`#${ticket.id} · ${ticket.subject}`}</Typography>
                  <Pill label={t(`supportStatus${capitalize(ticket.status)}`)} value={ticket.status} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {`${team ? `${ticket.userName} · ` : ''}${t(`supportCategory${capitalize(ticket.category)}`)} · ${dayjs(ticket.updatedAt).fromNow()}`}
                </Typography>
              </Card>
            ))}
            {!tickets.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('supportEmpty')}</Typography>}
          </Stack>
          {selected && <TicketDetail key={selected} ticketId={selected} team={team} onChanged={load} />}
        </Box>
      )}
      {creating && <NewTicket onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setSelected(null); load(); }} />}
    </Container>
  );
};

export default SupportPage;
