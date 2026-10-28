import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Stack,
  Typography,
} from '@mui/material';
import PowerOffIcon from '@mui/icons-material/PowerOff';
import PowerIcon from '@mui/icons-material/Power';
import dayjs from 'dayjs';
import { useTranslation } from './LocalizationProvider';
import { useCatch } from '../../reactHelper';
import fetchOrThrow from '../util/fetchOrThrow';

// Safe engine stop: shows the current speed against the allowed limit, refuses the cut while the unit moves too
// fast (or keeps it until the unit stops) and asks for an explicit confirmation. Also restores the engine.
const EngineCutDialog = ({ deviceId, mode, onClose }) => {
  const t = useTranslation();
  const device = useSelector((state) => state.devices.items[deviceId]);

  const [state, setState] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCatch(async () => {
    const response = await fetchOrThrow(`/api/safety/engine/${deviceId}`);
    setState(await response.json());
  });

  useEffect(() => {
    if (deviceId) {
      setConfirmed(false);
      setResult(null);
      load();
    }
  }, [deviceId, mode]);

  const send = useCatch(async (type, whenStopped) => {
    setSending(true);
    try {
      const response = await fetch('/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, type, attributes: whenStopped ? { whenStopped: true } : {} }),
      });
      if (response.status === 409) {
        setResult({ severity: 'warning', text: t('engineCutMoving') });
      } else if (!response.ok) {
        throw new Error(await response.text());
      } else {
        const body = await response.json().catch(() => ({}));
        if (body.pending) {
          setResult({ severity: 'info', text: t('engineCutPendingSet') });
        } else {
          setResult({ severity: 'success', text: t(type === 'engineStop' ? 'engineCutSent' : 'engineResumeSent') });
        }
      }
      await load();
    } finally {
      setSending(false);
    }
  });

  const cancelPending = useCatch(async () => {
    await fetchOrThrow(`/api/safety/engine/${deviceId}/pending`, { method: 'DELETE' });
    setResult({ severity: 'info', text: t('engineCutPendingCancelled') });
    await load();
  });

  const stop = mode === 'stop';
  const moving = state && !state.allowed;

  return (
    <Dialog open={Boolean(deviceId)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {stop ? <PowerOffIcon color="error" /> : <PowerIcon color="success" />}
        {`${t(stop ? 'engineCutTitle' : 'engineResumeTitle')} · ${device?.name || ''}`}
      </DialogTitle>
      <DialogContent dividers>
        {!state && <LinearProgress />}
        {state && (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between">
              <Typography color="text.secondary">{t('positionSpeed')}</Typography>
              <Typography fontWeight={700} color={moving ? 'error.main' : 'success.main'}>{`${state.speed} km/h`}</Typography>
            </Stack>
            {stop && (
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">{t('engineCutLimit')}</Typography>
                <Typography fontWeight={700}>{state.limit > 0 ? `${state.limit} km/h` : t('engineCutNoLimit')}</Typography>
              </Stack>
            )}
            {state.pending && (
              <Alert
                severity="info"
                action={<Button color="inherit" size="small" onClick={cancelPending}>{t('sharedCancel')}</Button>}
              >
                {t('engineCutPendingSince').replace('{time}', dayjs(state.pending.time).format('DD MMM HH:mm'))}
              </Alert>
            )}
            {stop && moving && !state.pending && <Alert severity="warning">{t('engineCutMovingHelp')}</Alert>}
            {stop && !moving && !state.pending && <Alert severity="error">{t('engineCutWarning')}</Alert>}
            {!state.pending && (
              <FormControlLabel
                control={<Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />}
                label={t(stop ? 'engineCutConfirm' : 'engineResumeConfirm')}
              />
            )}
            {result && <Alert severity={result.severity}>{result.text}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('unitInfoClose')}</Button>
        {state && !state.pending && stop && moving && (
          <Button variant="contained" color="warning" disabled={!confirmed || sending} onClick={() => send('engineStop', true)}>
            {t('engineCutWhenStopped')}
          </Button>
        )}
        {state && !state.pending && stop && !moving && (
          <Button variant="contained" color="error" disabled={!confirmed || sending} onClick={() => send('engineStop')}>
            {t('engineCutNow')}
          </Button>
        )}
        {state && !stop && (
          <Button variant="contained" color="success" disabled={!confirmed || sending} onClick={() => send('engineResume')}>
            {t('engineResumeNow')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default EngineCutDialog;
