import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, CardContent, Container, Stack, TextField, Typography,
} from '@mui/material';
import { MuiFileInput } from 'mui-file-input';
import { useCatch, useEffectAsync } from '../reactHelper';
import { sessionActions } from '../store';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';

const MAX_LOGO_SIZE = 200 * 1024;
const BRAND_PREFIX = 'brand.';
const FIELDS = ['title', 'logo', 'logoInverted', 'colorPrimary', 'colorSecondary'];
const COLOR_PATTERN = /^#([0-9A-Fa-f]{3}){1,2}$/;

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const LogoField = ({
  label, value, onChange, t,
}) => {
  const [error, setError] = useState(null);
  return (
    <Stack spacing={1}>
      <TextField
        label={label}
        value={value?.startsWith('data:') ? t('brandEmbeddedImage') : value || ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={value?.startsWith('data:')}
        placeholder="https://"
        fullWidth
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <MuiFileInput
          size="small"
          placeholder={t('sharedSelectFile')}
          inputProps={{ accept: 'image/png,image/svg+xml,image/jpeg,image/webp' }}
          value={null}
          onChange={async (file) => {
            if (!file) return;
            if (file.size > MAX_LOGO_SIZE) {
              setError(t('brandLogoTooLarge'));
              return;
            }
            setError(null);
            onChange(await readFile(file));
          }}
        />
        {value && (
          <Button color="error" onClick={() => onChange('')}>{t('sharedRemove')}</Button>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {value && (
        <Box sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1, width: 'fit-content' }}>
          <img src={value} alt="" style={{ maxHeight: 60, maxWidth: 240 }} />
        </Box>
      )}
    </Stack>
  );
};

const ColorField = ({ label, value, onChange }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    <input
      type="color"
      value={COLOR_PATTERN.test(value || '') ? value : '#1a237e'}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: 48, height: 40, border: 'none', background: 'none', padding: 0,
      }}
    />
    <TextField
      label={label}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      error={!!value && !COLOR_PATTERN.test(value)}
      placeholder="#1a237e"
      fullWidth
    />
  </Stack>
);

// Administrators edit the global defaults (server attributes), managers their own white label which every
// user below them in the hierarchy inherits.
const BrandingPage = () => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const admin = useAdministrator();

  const user = useSelector((state) => state.session.user);
  const server = useSelector((state) => state.session.server);

  const [values, setValues] = useState({});
  const [domains, setDomains] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const source = admin ? server.attributes : user.attributes;
    const prefix = admin ? '' : BRAND_PREFIX;
    setValues(Object.fromEntries(FIELDS.map((key) => [key, source[prefix + key] || ''])));
    setDomains(server.attributes.brandDomains || '');
  }, [admin, server, user]);

  const [managedUsers, setManagedUsers] = useState([]);
  useEffectAsync(async () => {
    if (admin) {
      const response = await fetchOrThrow('/api/users');
      setManagedUsers(await response.json());
    }
  }, [admin]);

  const setValue = (key) => (value) => {
    setSaved(false);
    setValues({ ...values, [key]: value });
  };

  const apply = (attributes, prefix) => {
    const result = { ...attributes };
    FIELDS.forEach((key) => {
      if (values[key]) {
        result[prefix + key] = values[key];
      } else {
        delete result[prefix + key];
      }
    });
    return result;
  };

  const handleSave = useCatch(async () => {
    if (admin) {
      const attributes = apply(server.attributes, '');
      if (domains) {
        attributes.brandDomains = domains;
      } else {
        delete attributes.brandDomains;
      }
      const response = await fetchOrThrow('/api/server', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...server, attributes }),
      });
      dispatch(sessionActions.updateServer(await response.json()));
    } else {
      const response = await fetchOrThrow(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, attributes: apply(user.attributes, BRAND_PREFIX) }),
      });
      dispatch(sessionActions.updateUser(await response.json()));
    }
    const brand = await fetch(`/api/hierarchy/brand?host=${encodeURIComponent(window.location.hostname)}`);
    if (brand.ok) {
      dispatch(sessionActions.updateBrand(await brand.json()));
    }
    setSaved(true);
  });

  const invalidColor = ['colorPrimary', 'colorSecondary'].some((key) => values[key] && !COLOR_PATTERN.test(values[key]));

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>{t('navAppearance')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {admin ? t('brandAdminHint') : t('brandManagerHint')}
      </Typography>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={3}>
            <TextField
              label={t('brandTitle')}
              value={values.title || ''}
              onChange={(event) => setValue('title')(event.target.value)}
              fullWidth
            />
            <LogoField label={t('brandLogo')} value={values.logo} onChange={setValue('logo')} t={t} />
            <LogoField label={t('brandLogoInverted')} value={values.logoInverted} onChange={setValue('logoInverted')} t={t} />
            <ColorField label={t('brandColorPrimary')} value={values.colorPrimary} onChange={setValue('colorPrimary')} />
            <ColorField label={t('brandColorSecondary')} value={values.colorSecondary} onChange={setValue('colorSecondary')} />
            {admin && (
              <TextField
                label={t('brandDomains')}
                helperText={(
                  <>
                    {t('brandDomainsHint')}
                    {managedUsers.length > 0 && ` ${t('brandDomainsExample')}: rastreo.cliente.com=${managedUsers[0].id}`}
                  </>
                )}
                value={domains}
                onChange={(event) => {
                  setSaved(false);
                  setDomains(event.target.value);
                }}
                multiline
                minRows={2}
                fullWidth
              />
            )}
            {saved && <Alert severity="success">{t('brandSaved')}</Alert>}
            <Box>
              <Button variant="contained" onClick={handleSave} disabled={invalidColor}>{t('sharedSave')}</Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
};

export default BrandingPage;
