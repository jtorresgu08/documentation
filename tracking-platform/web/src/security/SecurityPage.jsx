import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Button, Card, CardContent, Chip, Container, FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import { useTranslation } from '../common/components/LocalizationProvider';
import TwoFactorSetup from './TwoFactorSetup';

// Security of the own account: two-factor on or off, new recovery codes and, for managers, requiring it for the
// accounts they manage
const SecurityPage = () => {
  const t = useTranslation();
  const user = useSelector((state) => state.session.user);
  const manager = useSelector((state) => state.session.user.administrator || state.session.user.userLimit !== 0);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [recovery, setRecovery] = useState(null);

  const load = async () => setStatus(await (await fetch('/api/security')).json());
  useEffect(() => {
    load();
  }, []);

  const withCode = async (path) => {
    setError(null);
    const response = await fetch(`/api/security/totp/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.replace(/\s/g, '') }),
    });
    if (response.ok) {
      const result = await response.json();
      setRecovery(result.recoveryCodes || null);
      setMode(null);
      setCode('');
      setStatus(result);
    } else {
      setError((await response.text()).includes('required') ? t('securityRequiredNoDisable') : t('securityWrongCode'));
    }
  };

  const requireOthers = async (required) => {
    await fetch(`/api/security/required/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ required }),
    });
    load();
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <ShieldIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>{t('securityTitle')}</Typography>
      </Stack>
      {status && (
        <Stack spacing={2}>
          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{t('securityTwoFactor')}</Typography>
                <Chip color={status.enabled ? 'success' : 'default'} label={status.enabled ? t('securityOn') : t('securityOff')} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('securityTwoFactorHelp')}</Typography>
              {status.required && !status.enabled && <Alert severity="warning" sx={{ mb: 2 }}>{t('securityRequiredByCompany')}</Alert>}
              {recovery && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {t('securityRecoveryHelp')}
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, mt: 1 }}>{recovery.join('  ·  ')}</Typography>
                </Alert>
              )}
              {!status.enabled && mode !== 'setup' && <Button variant="contained" onClick={() => setMode('setup')}>{t('securityActivate')}</Button>}
              {mode === 'setup' && <TwoFactorSetup onDone={() => { setMode(null); load(); }} />}
              {status.enabled && (
                <Stack spacing={1.5}>
                  <Typography variant="body2">{t('securityRecoveryLeft').replace('{0}', status.recoveryLeft)}</Typography>
                  {mode ? (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                      <TextField size="small" label={t('securityCodeOrRecovery')} value={code} onChange={(event) => setCode(event.target.value)} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
                      <Button variant="contained" color={mode === 'disable' ? 'error' : 'primary'} onClick={() => withCode(mode)}>
                        {mode === 'disable' ? t('securityDeactivate') : t('securityNewRecovery')}
                      </Button>
                      <Button onClick={() => { setMode(null); setError(null); }}>{t('sharedCancel')}</Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" onClick={() => setMode('recovery')}>{t('securityNewRecovery')}</Button>
                      {!status.required && <Button color="error" onClick={() => setMode('disable')}>{t('securityDeactivate')}</Button>}
                    </Stack>
                  )}
                  {error && <Alert severity="error">{error}</Alert>}
                </Stack>
              )}
            </CardContent>
          </Card>
          {manager && (
            <Card variant="outlined" sx={{ borderRadius: 4 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={700}>{t('securityCompany')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('securityCompanyHelp')}</Typography>
                <FormControlLabel control={<Switch checked={status.requiredForOthers} onChange={(event) => requireOthers(event.target.checked)} />} label={t('securityRequireOthers')} />
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Container>
  );
};

export default SecurityPage;
