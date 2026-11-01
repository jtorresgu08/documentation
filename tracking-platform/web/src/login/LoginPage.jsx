import { useEffect, useState } from 'react';
import {
  Select, MenuItem, FormControl, Button, TextField, Link, Snackbar, IconButton, Tooltip, Box, InputAdornment,
  Typography, Checkbox, FormControlLabel, Divider,
} from '@mui/material';
import ReactCountryFlag from 'react-country-flag';
import { makeStyles } from 'tss-react/mui';
import CloseIcon from '@mui/icons-material/Close';
import VpnLockIcon from '@mui/icons-material/VpnLock';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { sessionActions } from '../store';
import { useLocalization, useTranslation } from '../common/components/LocalizationProvider';
import LoginLayout from './LoginLayout';
import usePersistedState from '../common/util/usePersistedState';
import {
  generateLoginToken, handleLoginTokenListeners, nativeEnvironment, nativePostMessage,
} from '../common/components/NativeInterface';
import { useBrandAttribute } from '../common/util/brand';
import { BRAND_LOGO, BRAND_NAME } from '../common/util/brandDefaults';
import { useCatch } from '../reactHelper';
import QrCodeDialog from '../common/components/QrCodeDialog';
import fetchOrThrow from '../common/util/fetchOrThrow';

const useStyles = makeStyles()((theme) => ({
  options: {
    position: 'absolute',
    top: theme.spacing(2),
    right: theme.spacing(2),
    display: 'flex',
    flexDirection: 'row',
    gap: theme.spacing(1),
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    '& .MuiOutlinedInput-root': {
      borderRadius: 10,
      background: '#f7f9fc',
    },
  },
  title: {
    fontWeight: 800,
    color: '#0a2453',
    textAlign: 'center',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(-1),
  },
  submit: {
    height: 50,
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '1rem',
    textTransform: 'none',
    background: 'linear-gradient(90deg, #163c7d 0%, #1f6fd1 60%, #0eabf1 100%)',
    boxShadow: '0 8px 20px rgba(22, 60, 125, 0.35)',
    transition: 'transform .15s ease, box-shadow .15s ease',
    '&:hover': {
      transform: 'translateY(-1px)',
      boxShadow: '0 12px 26px rgba(22, 60, 125, 0.45)',
    },
    '&.Mui-disabled': {
      color: 'rgba(255,255,255,0.85)',
      opacity: 0.6,
    },
  },
  google: {
    height: 48,
    borderRadius: 10,
    textTransform: 'none',
    fontWeight: 600,
    color: '#1b2540',
    borderColor: '#d7dce6',
  },
  note: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    color: '#7a8399',
    textAlign: 'center',
  },
  link: {
    cursor: 'pointer',
  },
}));

const LoginPage = () => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const { languages, language, setLocalLanguage } = useLocalization();
  const languageList = Object.entries(languages).map((values) => ({ code: values[0], country: values[1].country, name: values[1].name }));

  const [failed, setFailed] = useState(false);

  const [email, setEmail] = usePersistedState('loginEmail', '');
  const [remember, setRemember] = usePersistedState('loginRemember', true);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showServerTooltip, setShowServerTooltip] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const registrationEnabled = useSelector((state) => state.session.server.registration);
  const languageEnabled = useSelector((state) => {
    const attributes = state.session.server.attributes;
    return !attributes.language && !attributes['ui.disableLoginLanguage'];
  });
  const changeEnabled = useSelector((state) => !state.session.server.attributes.disableChange);
  const emailEnabled = useSelector((state) => state.session.server.emailEnabled);
  const openIdEnabled = useSelector((state) => state.session.server.openIdEnabled);
  const openIdForced = useSelector((state) => state.session.server.openIdEnabled && state.session.server.openIdForce);
  const [codeEnabled, setCodeEnabled] = useState(false);

  const logo = useBrandAttribute('logo');
  const openIdLabel = useBrandAttribute('loginOpenIdLabel');

  const [announcementShown, setAnnouncementShown] = useState(false);
  const announcement = useSelector((state) => state.session.server.announcement);

  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setFailed(false);
    try {
      const query = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
      const response = await fetch('/api/session', {
        method: 'POST',
        body: new URLSearchParams(code.length ? `${query}&code=${code}` : query),
      });
      if (response.ok) {
        const user = await response.json();
        generateLoginToken();
        if (!remember) {
          window.localStorage.removeItem('loginEmail');
        }
        dispatch(sessionActions.updateUser(user));
        const target = window.sessionStorage.getItem('postLogin') || '/';
        window.sessionStorage.removeItem('postLogin');
        navigate(target, { replace: true });
      } else if (response.status === 401 && response.headers.get('WWW-Authenticate') === 'TOTP') {
        setCodeEnabled(true);
      } else {
        throw Error(await response.text());
      }
    } catch {
      setFailed(true);
      setPassword('');
    }
  };

  const handleTokenLogin = useCatch(async (token) => {
    const response = await fetchOrThrow(`/api/session?token=${encodeURIComponent(token)}`);
    const user = await response.json();
    dispatch(sessionActions.updateUser(user));
    navigate('/');
  });

  const startAdornment = (icon) => ({
    input: { startAdornment: <InputAdornment position="start">{icon}</InputAdornment> },
  });

  const handleOpenIdLogin = () => {
    document.location = '/api/session/openid/auth';
  };

  useEffect(() => nativePostMessage('authentication'), []);

  useEffect(() => {
    const listener = (token) => handleTokenLogin(token);
    handleLoginTokenListeners.add(listener);
    return () => handleLoginTokenListeners.delete(listener);
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem('hostname') !== window.location.hostname) {
      window.localStorage.setItem('hostname', window.location.hostname);
      setShowServerTooltip(true);
    }
  }, []);

  return (
    <LoginLayout>
      <div className={classes.options}>
        {nativeEnvironment && changeEnabled && (
          <IconButton color="primary" sx={{ color: { xs: '#fff', md: 'primary.main' } }} onClick={() => navigate('/change-server')}>
            <Tooltip
              title={`${t('settingsServer')}: ${window.location.hostname}`}
              open={showServerTooltip}
              arrow
            >
              <VpnLockIcon />
            </Tooltip>
          </IconButton>
        )}
        {!nativeEnvironment && (
          <IconButton color="primary" sx={{ color: { xs: '#fff', md: 'primary.main' } }} onClick={() => setShowQr(true)}>
            <QrCode2Icon />
          </IconButton>
        )}
        {languageEnabled && (
          <FormControl>
            <Select size="small" value={language} onChange={(e) => setLocalLanguage(e.target.value)}>
              {languageList.map((it) => (
                <MenuItem key={it.code} value={it.code}>
                  <Box component="span" sx={{ mr: 1 }}>
                    <ReactCountryFlag countryCode={it.country} svg />
                  </Box>
                  {it.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </div>
      <div className={classes.container}>
        <img src={logo || BRAND_LOGO} alt={BRAND_NAME} style={{ alignSelf: 'center', maxWidth: 220, maxHeight: 90 }} />
        <Box sx={{ mb: 1 }}>
          <Typography variant="h4" className={classes.title}>{t('loginLogin')}</Typography>
          <Typography variant="body2" sx={{ color: '#7a8399', textAlign: 'center', mt: 0.5 }}>
            {t('loginSubtitle')}
          </Typography>
        </Box>
        {!openIdForced && (
          <>
            <TextField
              required
              error={failed}
              label={t('userEmail')}
              placeholder="usuario@empresa.com"
              name="email"
              value={email}
              autoComplete="email"
              autoFocus={!email}
              onChange={(e) => setEmail(e.target.value)}
              helperText={failed && t('loginFailed')}
              slotProps={startAdornment(<MailOutlineIcon color="action" />)}
            />
            <TextField
              required
              error={failed}
              label={t('userPassword')}
              name="password"
              value={password}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoFocus={!!email}
              onChange={(e) => setPassword(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon color="action" /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            {codeEnabled && (
              <TextField
                required
                error={failed}
                label={t('loginTotpCode')}
                name="code"
                value={code}
                type="number"
                autoFocus
                onChange={(e) => setCode(e.target.value)}
                slotProps={startAdornment(<PinOutlinedIcon color="action" />)}
              />
            )}
            <div className={classes.row}>
              <FormControlLabel
                control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
                label={<Typography variant="body2">{t('loginRemember')}</Typography>}
              />
              {emailEnabled && (
                <Link
                  onClick={() => navigate('/reset-password')}
                  className={classes.link}
                  underline="hover"
                  variant="body2"
                >
                  {t('loginForgot')}
                </Link>
              )}
            </div>
            <Button
              onClick={handlePasswordLogin}
              type="submit"
              variant="contained"
              className={classes.submit}
              endIcon={<ArrowForwardIcon />}
              disabled={!email || !password || (codeEnabled && !code)}
            >
              {t('loginLogin')}
            </Button>
          </>
        )}
        {openIdEnabled && (
          <>
            {!openIdForced && <Divider><Typography variant="body2" color="textSecondary">{t('loginOr')}</Typography></Divider>}
            <Button
              onClick={() => handleOpenIdLogin()}
              variant="outlined"
              className={classes.google}
              startIcon={(
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
              )}
            >
              {openIdLabel || t('loginOpenIdGoogle')}
            </Button>
          </>
        )}
        {!openIdForced && registrationEnabled && (
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            {`${t('loginNoAccount')} `}
            <Link onClick={() => navigate('/register')} className={classes.link} underline="hover">
              {t('loginRegister')}
            </Link>
          </Typography>
        )}
        <Typography variant="caption" className={classes.note}>
          <ShieldOutlinedIcon fontSize="small" />
          {t('loginProtected')}
        </Typography>
      </div>
      <QrCodeDialog open={showQr} onClose={() => setShowQr(false)} />
      <Snackbar
        open={!!announcement && !announcementShown}
        message={announcement}
        action={(
          <IconButton size="small" color="inherit" onClick={() => setAnnouncementShown(true)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      />
    </LoginLayout>
  );
};

export default LoginPage;
