import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Chip, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ChatIcon from '@mui/icons-material/Chat';
import SendIcon from '@mui/icons-material/Send';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import { usePolling } from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { updatePanel } from '../common/util/floatingPanels';

const QUICK_REPLIES = ['chatQuickWhere', 'chatQuickCall', 'chatQuickReturn', 'chatQuickStop'];

// WhatsApp chat with the driver of a unit: the conversation (operators' messages and the driver's replies), quick
// phrases and the delivery status; refreshes every 10 seconds
const ChatPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const theme = useTheme();
  const devices = useSelector((state) => state.devices.items);
  const readonly = useSelector((state) => state.session.user.readonly);
  const deviceId = panel.props.deviceId || null;
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);

  const load = async () => {
    if (!deviceId) return;
    try {
      setChat(await (await fetchOrThrow(`/api/chat?deviceId=${deviceId}`)).json());
    } catch (e) {
      setError(e.message);
    }
  };
  usePolling(load, 10000, [deviceId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat?.messages?.length]);

  const send = async (value) => {
    const message = (value ?? text).trim();
    if (!message) return;
    setSending(true);
    setError(null);
    try {
      await fetchOrThrow('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, text: message }),
      });
      setText('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const messages = chat?.messages || [];

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<ChatIcon fontSize="small" />}
      color="#25a244"
      title={deviceId && devices[deviceId] ? `${t('panelChat')} · ${devices[deviceId].name}` : t('panelChat')}
      subtitle={chat ? `${chat.driverName || t('chatNoDriver')}${chat.phone ? ` · +${chat.phone}` : ''}` : t('panelChooseUnit')}
      width={360}
      height={480}
      padding={false}
    >
      <Stack sx={{ height: '100%' }}>
        {!panel.props.fixed && (
          <Box sx={{ px: 1.5, pb: 1 }}>
            <Autocomplete
              size="small"
              options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
              getOptionLabel={(option) => option.name}
              value={devices[deviceId] || null}
              onChange={(_, value) => { setChat(null); updatePanel(panel.id, { props: { ...panel.props, deviceId: value?.id || null } }); }}
              renderInput={(params) => <TextField {...params} placeholder={t('reportDevice')} />}
            />
          </Box>
        )}
        {chat && !chat.configured && <Alert severity="warning" sx={{ mx: 1.5, mb: 1, py: 0 }}>{t('chatNotConfigured')}</Alert>}
        {chat && !chat.phone && <Alert severity="info" sx={{ mx: 1.5, mb: 1, py: 0 }}>{t('chatNoPhone')}</Alert>}
        <Box sx={{
          flex: 1, minHeight: 120, overflowY: 'auto', px: 1.5, py: 1, bgcolor: alpha('#25a244', 0.05),
        }}
        >
          {deviceId && !messages.length && <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: 'center', py: 3 }}>{t('chatEmpty')}</Typography>}
          {messages.map((message, index) => {
            const out = message.direction === 'out';
            const day = dayjs(message.time).format('DD/MM/YYYY');
            const showDay = !index || dayjs(messages[index - 1].time).format('DD/MM/YYYY') !== day;
            return (
              <Box key={message.id}>
                {showDay && <Typography variant="caption" color="text.secondary" component="div" sx={{ textAlign: 'center', my: 0.5 }}>{day}</Typography>}
                <Stack alignItems={out ? 'flex-end' : 'flex-start'} sx={{ mb: 0.75 }}>
                  <Box sx={{
                    maxWidth: '82%', px: 1.25, py: 0.75, borderRadius: out ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    bgcolor: out ? '#d9fdd3' : theme.palette.background.paper, color: '#111', boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }}
                  >
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.text}</Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                      <Typography variant="caption" sx={{ color: '#667' }}>{dayjs(message.time).format('HH:mm')}</Typography>
                      {out && (message.status === 'failed'
                        ? <ErrorOutlineIcon sx={{ fontSize: 14, color: theme.palette.error.main }} />
                        : <DoneAllIcon sx={{ fontSize: 14, color: '#34b7f1' }} />)}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          })}
          <div ref={bottom} />
        </Box>
        {error && <Alert severity="error" sx={{ mx: 1.5, mt: 1, py: 0 }} onClose={() => setError(null)}>{error}</Alert>}
        {!readonly && deviceId && (
          <Box sx={{ px: 1.5, pt: 1 }}>
            <Stack direction="row" spacing={0.5} sx={{ overflowX: 'auto', pb: 0.75 }}>
              {QUICK_REPLIES.map((key) => <Chip key={key} size="small" variant="outlined" label={t(key)} onClick={() => send(t(key))} sx={{ flexShrink: 0 }} />)}
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="flex-end">
              <TextField
                size="small"
                fullWidth
                multiline
                maxRows={3}
                placeholder={t('chatPlaceholder')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <IconButton color="success" disabled={sending || !text.trim()} onClick={() => send()} sx={{ bgcolor: alpha('#25a244', 0.12) }}><SendIcon fontSize="small" /></IconButton>
            </Stack>
          </Box>
        )}
      </Stack>
    </FloatingPanel>
  );
};

export default ChatPanel;
