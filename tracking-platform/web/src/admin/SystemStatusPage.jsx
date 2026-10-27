import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, FormControlLabel, Grid, IconButton, LinearProgress,
  Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatPeriod } from '../main/DeviceRow';
import AddDeviceDialog from '../settings/AddDeviceDialog';

const REFRESH_INTERVAL = 10000;

const formatBytes = (bytes) => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

const ago = (time, t) => (time ? `${formatPeriod(Date.now() - time)} ${t('statusAgo')}` : '—');

// usage bars turn orange / red when high, unless a high value is good (ports listening, devices connected)
const Metric = ({
  title, value, detail, progress, color = 'primary', higherIsBetter,
}) => (
  <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
    <CardContent>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      <Typography variant="h5" fontWeight={700}>{value}</Typography>
      {progress !== undefined && (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, progress)}
          color={higherIsBetter || progress <= 75 ? color : (progress > 90 ? 'error' : 'warning')}
          sx={{ my: 1, height: 6, borderRadius: 3 }}
        />
      )}
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </CardContent>
  </Card>
);

const SystemStatusPage = () => {
  const t = useTranslation();

  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);

  const load = async () => {
    try {
      const response = await fetchOrThrow('/api/system/status');
      setStatus(await response.json());
      setUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!status) {
    return (
      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error ? <Alert severity="error">{error}</Alert> : <LinearProgress />}
      </Container>
    );
  }

  const keyword = search.trim().toLowerCase();
  const ports = status.ports
    .filter((port) => !activeOnly || port.messages.total > 0 || port.connections > 0 || port.devices > 0)
    .filter((port) => !keyword || port.protocol.includes(keyword) || String(port.port).includes(keyword))
    .sort((a, b) => (b.messages.lastTime || 0) - (a.messages.lastTime || 0) || a.port - b.port);
  const listening = status.ports.filter((port) => port.listening).length;
  const failing = status.ports.filter((port) => !port.listening);
  const memory = (status.jvm.memoryUsed / status.jvm.memoryMax) * 100;
  const diskUsed = ((status.disk.total - status.disk.free) / status.disk.total) * 100;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{t('statusTitle')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {`${t('statusUpdated')} ${dayjs(updated).format('HH:mm:ss')}`}
        </Typography>
        <IconButton onClick={load}><RefreshIcon /></IconButton>
      </Stack>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {failing.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {`${t('statusPortsFailing')}: ${failing.map((port) => `${port.protocol} ${port.port}`).join(', ')}`}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusUptime')}
            value={formatPeriod(status.jvm.uptime)}
            detail={`Traccar ${status.version || ''} · ${status.jvm.threads} ${t('statusThreads')}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusMemory')}
            value={`${formatBytes(status.jvm.memoryUsed)} / ${formatBytes(status.jvm.memoryMax)}`}
            progress={memory}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusCpu')}
            value={status.jvm.loadAverage >= 0 ? status.jvm.loadAverage.toFixed(2) : '—'}
            progress={status.jvm.loadAverage >= 0 ? (status.jvm.loadAverage / status.jvm.processors) * 100 : undefined}
            detail={`${status.jvm.processors} ${t('statusProcessors')}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusDisk')}
            value={`${formatBytes(status.disk.free)} ${t('statusFree')}`}
            progress={diskUsed}
            detail={`${t('statusOf')} ${formatBytes(status.disk.total)}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusDatabase')}
            value={status.database.ok ? `${status.database.latencyMs.toFixed(1)} ms` : t('statusError')}
            color={status.database.ok ? 'success' : 'error'}
            detail={status.database.driver}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusConnectedDevices')}
            value={`${status.devices.connected} / ${status.devices.total}`}
            progress={status.devices.total ? (status.devices.connected / status.devices.total) * 100 : 0}
            color="success"
            higherIsBetter
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric title={t('statusMessagesPerMinute')} value={status.messagesLastMinute} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Metric
            title={t('statusPorts')}
            value={`${listening} / ${status.ports.length}`}
            detail={t('statusPortsListening')}
            color="success"
            higherIsBetter
            progress={(listening / status.ports.length) * 100}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} sx={{ mt: 4, mb: 1 }}>
        <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{t('statusPortMonitor')}</Typography>
        <TextField size="small" placeholder={t('statusSearchPort')} value={search} onChange={(event) => setSearch(event.target.value)} />
        <FormControlLabel
          control={<Switch checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />}
          label={t('statusActiveOnly')}
        />
      </Stack>
      <Card variant="outlined" sx={{ borderRadius: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('addDeviceProtocol')}</TableCell>
              <TableCell>{t('addDevicePort')}</TableCell>
              <TableCell>{t('statusState')}</TableCell>
              <TableCell align="right">{t('statusConnections')}</TableCell>
              <TableCell align="right">{t('deviceTitle')}</TableCell>
              <TableCell align="right">{t('statusLastMinute')}</TableCell>
              <TableCell align="right">{t('statusLastHour')}</TableCell>
              <TableCell align="right">{t('statusTotal')}</TableCell>
              <TableCell>{t('statusLastMessage')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ports.map((port) => (
              <TableRow key={`${port.protocol}-${port.port}-${port.transport}`} hover>
                <TableCell><Typography variant="body2" fontWeight={600}>{port.protocol}</Typography></TableCell>
                <TableCell>{`${port.port} ${port.transport.toUpperCase()}`}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={port.listening ? 'success' : 'error'}
                    label={port.listening ? t('statusListening') : t('statusError')}
                  />
                </TableCell>
                <TableCell align="right">{port.connections ?? '—'}</TableCell>
                <TableCell align="right">{port.devices}</TableCell>
                <TableCell align="right">{port.messages.lastMinute}</TableCell>
                <TableCell align="right">{port.messages.lastHour}</TableCell>
                <TableCell align="right">{port.messages.total}</TableCell>
                <TableCell>
                  <Tooltip title={port.messages.lastTime ? dayjs(port.messages.lastTime).format('YYYY-MM-DD HH:mm:ss') : ''}>
                    <span>{ago(port.messages.lastTime, t)}</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!ports.length && (
              <TableRow>
                <TableCell colSpan={9}><Typography variant="body2" color="text.secondary">{t('statusNoActivity')}</Typography></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 4 }}>{t('statusUnknownDevices')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('statusUnknownHelp')}</Typography>
      <Card variant="outlined" sx={{ borderRadius: 3, overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('addDeviceImei')}</TableCell>
              <TableCell>{t('addDeviceProtocol')}</TableCell>
              <TableCell>IP</TableCell>
              <TableCell align="right">{t('statusAttempts')}</TableCell>
              <TableCell>{t('statusLastAttempt')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {status.unknownDevices.map((device) => (
              <TableRow key={device.uniqueId} hover>
                <TableCell><Box component="code">{device.uniqueId}</Box></TableCell>
                <TableCell>{`${device.protocol} · ${device.port}`}</TableCell>
                <TableCell>{device.address}</TableCell>
                <TableCell align="right">{device.attempts}</TableCell>
                <TableCell>{ago(device.lastTime, t)}</TableCell>
                <TableCell align="right">
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(device)}>
                    {t('statusAddUnit')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!status.unknownDevices.length && (
              <TableRow>
                <TableCell colSpan={6}><Typography variant="body2" color="text.secondary">{t('statusNoUnknown')}</Typography></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AddDeviceDialog
        open={Boolean(adding)}
        onClose={() => {
          setAdding(null);
          load();
        }}
        initialUniqueId={adding?.uniqueId}
        initialProtocol={adding?.protocol}
      />
    </Container>
  );
};

export default SystemStatusPage;
