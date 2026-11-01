import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Stack, Typography,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import { useTranslation } from '../common/components/LocalizationProvider';
import TwoFactorSetup from './TwoFactorSetup';

// When the company requires two-factor and the account has not set it up, the platform waits behind this screen
// (the server answers 403 to everything else meanwhile)
const TwoFactorGate = ({ children }) => {
  const t = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState(null);

  const load = async () => {
    const response = await fetch('/api/security');
    setState(response.ok ? await response.json() : { required: false });
  };
  useEffect(() => {
    load();
  }, []);

  if (!state) return null;
  if (!state.required || state.enabled) return children;
  return (
    <Box sx={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default',
    }}
    >
      <Card sx={{ maxWidth: 620, width: '100%', borderRadius: 4 }}>
        <CardContent sx={{ p: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <ShieldIcon color="primary" fontSize="large" />
            <Typography variant="h5" fontWeight={700}>{t('securityGateTitle')}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('securityGateHelp')}</Typography>
          <TwoFactorSetup onDone={() => window.location.reload()} />
          <Button sx={{ mt: 2 }} onClick={async () => { await fetch('/api/session', { method: 'DELETE' }); navigate('/login'); }}>{t('loginLogout')}</Button>
        </CardContent>
      </Card>
    </Box>
  );
};

export default TwoFactorGate;
