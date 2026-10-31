import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, Grid, IconButton, LinearProgress, MenuItem, Skeleton, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import PeopleIcon from '@mui/icons-material/People';
import StorefrontIcon from '@mui/icons-material/Storefront';
import NavigationIcon from '@mui/icons-material/Navigation';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import LanguageIcon from '@mui/icons-material/Language';
import DeleteIcon from '@mui/icons-material/Delete';
import LockIcon from '@mui/icons-material/Lock';
import dayjs from 'dayjs';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useModule } from '../common/util/permissions';

const Stat = ({
  icon, title, value, detail, color,
}) => {
  const theme = useTheme();
  const main = theme.palette[color]?.main || color;
  return (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 4 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(main, 0.12), color: main, flexShrink: 0,
        }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>{title}</Typography>
          <Typography variant="h5" fontWeight={700}>{value ?? <Skeleton width={48} />}</Typography>
          {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
        </Box>
      </CardContent>
    </Card>
  );
};

const Quota = ({ label, used, limit }) => {
  const t = useTranslation();
  const unlimited = !limit || limit < 0;
  const percent = unlimited ? 0 : Math.min(100, (used / limit) * 100);
  let color = 'primary';
  if (percent >= 95) color = 'error';
  else if (percent >= 80) color = 'warning';
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{unlimited ? `${used} · ${t('resellerUnlimited')}` : `${used} / ${limit}`}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={unlimited ? 0 : percent} color={color} sx={{ height: 8, borderRadius: 4, mt: 0.75 }} />
    </Box>
  );
};

const DOMAIN_STATUS = {
  ok: ['success', 'resellerDnsOk'], wrong: ['error', 'resellerDnsWrong'], unresolved: ['warning', 'resellerDnsPending'], unknown: ['default', 'resellerDnsUnknown'],
};

// Distributor dashboard: accounts and units of the branch, quota use, plans, direct accounts, what expires soon and
// the white label domains (HTTPS certificate issued automatically once the DNS points to the platform)
const ResellerDashboardPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.session.user);
  const whitelabel = useModule('whitelabel');
  const [summary, setSummary] = useState(null);
  const [plans, setPlans] = useState({});
  const [domains, setDomains] = useState([]);
  const [domain, setDomain] = useState('');
  const [domainUser, setDomainUser] = useState(currentUser.id);
  const [domainError, setDomainError] = useState(null);

  const loadDomains = async () => {
    const response = await fetch('/api/hierarchy/domains');
    if (response.ok) setDomains(await response.json());
  };

  useEffectAsync(async () => {
    setSummary(await (await fetchOrThrow('/api/reseller/summary')).json());
    const catalog = await (await fetchOrThrow('/api/plans')).json();
    setPlans(Object.fromEntries(catalog.plans.map((plan) => [plan.id, plan])));
    if (whitelabel) await loadDomains();
  }, [whitelabel]);

  const addDomain = async () => {
    setDomainError(null);
    const response = await fetch('/api/hierarchy/domains', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, userId: domainUser }),
    });
    if (response.ok) {
      setDomain('');
      await loadDomains();
    } else {
      const text = await response.text();
      if (text.includes('already assigned')) setDomainError(t('resellerDomainTaken'));
      else if (text.includes('main domain')) setDomainError(t('resellerDomainMain'));
      else setDomainError(t('resellerDomainInvalid'));
    }
  };

  const removeDomain = async (name) => {
    await fetch(`/api/hierarchy/domains?domain=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadDomains();
  };

  const planChip = (plan, name) => {
    if (!plan) return <Chip size="small" variant="outlined" label={t('planInherit')} />;
    if (plan === 'custom') return <Chip size="small" label={t('planCustom')} />;
    const item = plans[plan];
    return <Chip size="small" label={item?.name || name || plan} sx={{ bgcolor: item?.color, color: item?.color ? '#fff' : undefined, fontWeight: 600 }} />;
  };

  const devices = summary?.devices;
  const accounts = summary?.accounts;
  const expected = domains[0]?.expected || [];

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('resellerTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{currentUser.name}</Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate('/settings/user')}>{t('resellerNewAccount')}</Button>
      </Stack>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Stat icon={<PeopleIcon />} color="primary" title={t('resellerClients')} value={accounts?.clients} detail={accounts && `${accounts.total} ${t('resellerAccountsTotal')} · ${accounts.disabled} ${t('resellerDisabled')}`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Stat icon={<StorefrontIcon />} color="#8e44ad" title={t('resellerSubdistributors')} value={accounts?.managers} detail={accounts && `${accounts.expired} ${t('resellerExpired')}`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Stat icon={<WifiIcon />} color="success" title={t('resellerOnline')} value={devices && `${devices.online} / ${devices.total}`} detail={devices && `${devices.disabled} ${t('resellerDisabled')}`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Stat icon={<WifiOffIcon />} color="warning" title={t('resellerOffline24h')} value={devices?.offline24h} detail={devices && `${devices.expired} ${t('resellerExpired')}`} />
        </Grid>

        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('resellerQuota')}</Typography>
              {summary ? (
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                  <Quota label={t('deviceTitle')} used={summary.quota.devices} limit={summary.quota.deviceLimit} />
                  <Quota label={t('settingsUsers')} used={summary.quota.users} limit={summary.quota.userLimit} />
                </Stack>
              ) : <Skeleton height={80} />}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('resellerPlans')}</Typography>
              {summary && Object.entries(summary.plans).sort((a, b) => b[1] - a[1]).map(([plan, count]) => {
                const item = plans[plan];
                const percent = accounts.total ? (count / accounts.total) * 100 : 0;
                let label = item?.name || plan;
                if (plan === 'inherit') label = t('planInherit');
                else if (plan === 'custom') label = t('planCustom');
                return (
                  <Box key={plan} sx={{ mb: 1.25 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">{label}</Typography>
                      <Typography variant="body2" fontWeight={600}>{count}</Typography>
                    </Stack>
                    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
                      <Box sx={{ width: `${percent}%`, height: '100%', borderRadius: 3, bgcolor: item?.color || 'text.disabled' }} />
                    </Box>
                  </Box>
                );
              })}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <EventBusyIcon color="warning" fontSize="small" />
                <Typography variant="subtitle1" fontWeight={700}>{t('resellerExpiring')}</Typography>
              </Stack>
              {summary && !summary.expiring.length && <Typography variant="body2" color="text.secondary">{t('resellerNothingExpiring')}</Typography>}
              {summary?.expiring.slice(0, 6).map((item) => {
                const expired = dayjs(item.time).isBefore(dayjs());
                return (
                  <Stack
                    key={`${item.type}-${item.id}`}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ py: 0.75, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider' }}
                    onClick={() => navigate(item.type === 'user' ? `/settings/user/${item.id}` : `/settings/device/${item.id}`)}
                  >
                    {item.type === 'user' ? <PeopleIcon fontSize="small" color="action" /> : <NavigationIcon fontSize="small" color="action" />}
                    <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{item.name}</Typography>
                    <Chip size="small" color={expired ? 'error' : 'warning'} variant="outlined" label={expired ? t('resellerExpiredOn') : dayjs(item.time).format('DD/MM/YYYY')} />
                  </Stack>
                );
              })}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: whitelabel ? 8 : 12 }}>
          <Card variant="outlined" sx={{ borderRadius: 4 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>{t('resellerAccounts')}</Typography>
            </CardContent>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('sharedName')}</TableCell>
                    <TableCell>{t('planTitle')}</TableCell>
                    <TableCell align="right">{t('deviceTitle')}</TableCell>
                    <TableCell align="right">{t('resellerOnlineShort')}</TableCell>
                    <TableCell align="right">{t('resellerOffline24hShort')}</TableCell>
                    <TableCell align="right">{t('settingsUsers')}</TableCell>
                    <TableCell>{t('userExpirationTime')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary?.children.map((item) => {
                    const expired = item.expirationTime && dayjs(item.expirationTime).isBefore(dayjs());
                    return (
                      <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/settings/user/${item.id}`)}>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {item.manager ? <StorefrontIcon fontSize="small" sx={{ color: '#8e44ad' }} /> : <PeopleIcon fontSize="small" color="action" />}
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>{item.email}</Typography>
                            </Box>
                            {item.disabled && <Chip size="small" icon={<LockIcon />} label={t('resellerDisabledOne')} />}
                          </Stack>
                        </TableCell>
                        <TableCell>{planChip(item.plan, item.planName)}</TableCell>
                        <TableCell align="right">{item.deviceLimit > 0 ? `${item.deviceStats.total} / ${item.deviceLimit}` : item.deviceStats.total}</TableCell>
                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>{item.deviceStats.online}</TableCell>
                        <TableCell align="right" sx={{ color: item.deviceStats.offline24h ? 'warning.main' : undefined }}>{item.deviceStats.offline24h}</TableCell>
                        <TableCell align="right">{item.users}</TableCell>
                        <TableCell sx={{ color: expired ? 'error.main' : undefined, whiteSpace: 'nowrap' }}>{item.expirationTime ? dayjs(item.expirationTime).format('DD/MM/YYYY') : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </Grid>

        {whitelabel && (
          <Grid size={{ xs: 12, xl: 4 }}>
            <Card variant="outlined" sx={{ borderRadius: 4, height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <LanguageIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={700}>{t('resellerDomains')}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {t('resellerDomainsHelp').replace('{0}', expected.length ? expected.join(', ') : t('resellerServerIp'))}
                </Typography>
                {domainError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setDomainError(null)}>{domainError}</Alert>}
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  <TextField size="small" placeholder="gps.tuempresa.com" value={domain} onChange={(event) => setDomain(event.target.value)} sx={{ flexGrow: 1 }} />
                  <TextField size="small" select value={domainUser} onChange={(event) => setDomainUser(event.target.value)} sx={{ width: 150 }}>
                    <MenuItem value={currentUser.id}>{t('resellerMyBrand')}</MenuItem>
                    {summary?.children.filter((item) => item.manager).map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
                  </TextField>
                  <Button variant="contained" disabled={!domain.trim()} onClick={addDomain}>{t('sharedAdd')}</Button>
                </Stack>
                {domains.map((item) => {
                  const [color, label] = DOMAIN_STATUS[item.status] || DOMAIN_STATUS.unknown;
                  return (
                    <Stack key={item.domain} direction="row" alignItems="center" spacing={1} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap component="a" href={`https://${item.domain}`} target="_blank" rel="noreferrer" sx={{ color: 'inherit', textDecoration: 'none' }}>{item.domain}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {`${item.userName || ''}${item.addresses.length ? ` · ${item.addresses.join(', ')}` : ''}`}
                        </Typography>
                      </Box>
                      <Tooltip title={item.status === 'ok' ? t('resellerHttpsAuto') : ''}>
                        <Chip size="small" color={color} variant={item.status === 'ok' ? 'filled' : 'outlined'} label={t(label)} />
                      </Tooltip>
                      <IconButton size="small" onClick={() => removeDomain(item.domain)}><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                  );
                })}
                {!domains.length && <Typography variant="body2" color="text.secondary">{t('resellerNoDomains')}</Typography>}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default ResellerDashboardPage;
