import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent, Container, Grid, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, Chip, Skeleton,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import NavigationIcon from '@mui/icons-material/Navigation';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import dayjs from 'dayjs';
import { useEffectAsync } from '../reactHelper';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatTime } from '../common/util/formatter';
import fetchOrThrow from '../common/util/fetchOrThrow';

const EXPIRING_DAYS = 30;

const StatCard = ({
  icon, title, value, detail, color, onClick,
}) => (
  <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
    <CardActionArea onClick={onClick} disabled={!onClick} sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: `${color}.main`, color: `${color}.contrastText`, flexShrink: 0,
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
    </CardActionArea>
  </Card>
);

const isExpired = (time) => time && dayjs(time).isBefore(dayjs());
const isExpiring = (time) => time && !isExpired(time) && dayjs(time).isBefore(dayjs().add(EXPIRING_DAYS, 'day'));

const AdminDashboardPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();

  const currentUser = useSelector((state) => state.session.user);
  const devices = useSelector((state) => Object.values(state.devices.items));

  const [users, setUsers] = useState(null);

  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/users');
    setUsers((await response.json()).filter((it) => !it.temporary && it.id !== currentUser.id));
  }, []);

  const managers = users?.filter((it) => it.administrator || it.userLimit !== 0);
  const activeUsers = users?.filter((it) => !it.disabled && !isExpired(it.expirationTime));
  const expiredUsers = users?.filter((it) => isExpired(it.expirationTime));

  const online = devices.filter((it) => it.status === 'online');
  const offline = devices.filter((it) => it.status === 'offline');
  const expiredDevices = devices.filter((it) => isExpired(it.expirationTime));

  const deviceLimit = currentUser.deviceLimit > 0 ? currentUser.deviceLimit : null;
  const userLimit = currentUser.userLimit > 0 ? currentUser.userLimit : null;

  const expiring = [
    ...(users || []).filter((it) => isExpiring(it.expirationTime) || isExpired(it.expirationTime))
      .map((it) => ({
        key: `user-${it.id}`, type: t('settingsUser'), name: it.email || it.name, time: it.expirationTime, link: `/settings/user/${it.id}`,
      })),
    ...devices.filter((it) => isExpiring(it.expirationTime) || isExpired(it.expirationTime))
      .map((it) => ({
        key: `device-${it.id}`, type: t('sharedDevice'), name: it.name, time: it.expirationTime, link: `/settings/device/${it.id}`,
      })),
  ].sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf());

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>{t('navOverview')}</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<PeopleIcon />}
            color="primary"
            title={t('settingsUsers')}
            value={users && (userLimit ? `${users.length}/${userLimit}` : users.length)}
            detail={activeUsers && `${t('dashboardActive')}: ${activeUsers.length}`}
            onClick={() => navigate('/settings/users')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<SupervisorAccountIcon />}
            color="secondary"
            title={t('dashboardManagers')}
            value={managers?.length}
            onClick={() => navigate('/settings/users')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<EventBusyIcon />}
            color="error"
            title={t('dashboardExpired')}
            value={expiredUsers && expiredUsers.length + expiredDevices.length}
            detail={expiredUsers && `${t('settingsUsers')}: ${expiredUsers.length} · ${t('deviceTitle')}: ${expiredDevices.length}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<NavigationIcon />}
            color="primary"
            title={t('deviceTitle')}
            value={deviceLimit ? `${devices.length}/${deviceLimit}` : devices.length}
            onClick={() => navigate('/settings/devices')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<WifiIcon />}
            color="success"
            title={t('deviceStatusOnline')}
            value={online.length}
            onClick={() => navigate('/')}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard
            icon={<WifiOffIcon />}
            color="warning"
            title={t('deviceStatusOffline')}
            value={offline.length}
            detail={`${t('deviceStatusUnknown')}: ${devices.length - online.length - offline.length}`}
            onClick={() => navigate('/')}
          />
        </Grid>
      </Grid>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 1 }}>{t('dashboardExpiring')}</Typography>
      <Card variant="outlined" sx={{ borderRadius: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('sharedType')}</TableCell>
              <TableCell>{t('sharedName')}</TableCell>
              <TableCell>{t('userExpirationTime')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expiring.map((item) => (
              <TableRow key={item.key} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(item.link)}>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  {formatTime(item.time, 'date')}
                  {' '}
                  {isExpired(item.time) && <Chip size="small" color="error" label={t('dashboardExpired')} />}
                </TableCell>
              </TableRow>
            ))}
            {!expiring.length && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="body2" color="text.secondary">{t('dashboardNothingExpiring')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </Container>
  );
};

export default AdminDashboardPage;
