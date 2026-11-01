import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Stack, TextField, Typography,
} from '@mui/material';
import QRCode from 'react-qr-code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTranslation } from '../common/components/LocalizationProvider';

const codeText = (code) => `${String(code).slice(0, 3)} ${String(code).slice(3, 6)} ${String(code).slice(6)}`;

// Turning on two-factor: QR for the authenticator app (or the key typed by hand), a code from the app to confirm,
// then the recovery codes shown once to keep in a safe place
const TwoFactorSetup = ({ onDone }) => {
  const t = useTranslation();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState(null);

  useEffect(() => {
    fetch('/api/security/totp/setup', { method: 'POST' }).then((response) => response.json()).then(setSetup);
  }, []);

  const confirm = async () => {
    setError(null);
    const response = await fetch('/api/security/totp/enable', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: setup.key, code: code.replace(/\s/g, '') }),
    });
    if (response.ok) setRecovery((await response.json()).recoveryCodes);
    else setError(t('securityWrongCode'));
  };

  if (recovery) {
    return (
      <Stack spacing={2}>
        <Alert severity="success">{t('securityEnabled')}</Alert>
        <Typography variant="body2">{t('securityRecoveryHelp')}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {recovery.map((item) => <Chip key={item} label={codeText(item)} sx={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700 }} />)}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<ContentCopyIcon />} onClick={() => navigator.clipboard?.writeText(recovery.map(codeText).join('\n'))}>{t('transitCopy')}</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" onClick={onDone}>{t('securitySaved')}</Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2">{t('securitySetupHelp')}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems="center">
        <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 2, border: '1px solid', borderColor: 'divider', lineHeight: 0 }}>
          {setup ? <QRCode value={setup.uri} size={176} /> : <Box sx={{ width: 176, height: 176 }} />}
        </Box>
        <Stack spacing={1.5} sx={{ flexGrow: 1, width: '100%' }}>
          <Typography variant="caption" color="text.secondary">{t('securityManualKey')}</Typography>
          <Typography sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontWeight: 700 }}>{setup?.key.replace(/(.{4})/g, '$1 ').trim()}</Typography>
          <TextField
            label={t('securityCode')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123 456"
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' } }}
            onKeyDown={(event) => event.key === 'Enter' && confirm()}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" disabled={!setup || code.replace(/\s/g, '').length !== 6} onClick={confirm}>{t('securityActivate')}</Button>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default TwoFactorSetup;
