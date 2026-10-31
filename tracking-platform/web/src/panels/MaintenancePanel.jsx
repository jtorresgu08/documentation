import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BuildIcon from '@mui/icons-material/Build';
import AddIcon from '@mui/icons-material/Add';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import {
  Empty, Metric, usePolling, withDevices,
} from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  STATE_COLORS, ServiceDialog, formatRemaining,
} from '../operations/FleetMaintenancePage';
import ServiceSetupDialog from '../operations/ServiceSetupDialog';
import { capitalize } from '../operations/alertUtils';

// Services and due dates that need attention (oil change, SOAT, technical inspection…): overdue and due soon, what
// is left, the estimated date and a button to register the service done or add a new one
const MaintenancePanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const navigate = useNavigate();
  const readonly = useSelector((state) => state.session.user.readonly);
  const devices = useSelector((state) => state.devices.items);
  const currency = useSelector((state) => state.session.server.attributes.currencySymbol || 'S/');
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState(null);
  const [record, setRecord] = useState(null);
  const [setup, setSetup] = useState(false);

  const load = async () => {
    try {
      if (!Object.keys(devices).length) return;
      setStatus(await (await fetchOrThrow(`/api/maintenance-plans/status?${withDevices(new URLSearchParams(), devices)}`)).json());
    } catch {
      setStatus((current) => current || { counts: { overdue: 0, soon: 0, ok: 0 }, items: [] });
    }
  };
  usePolling(load, 300000, [Object.keys(devices).length]);

  const pending = (status?.items || []).filter((item) => item.state !== 'ok' && (!filter || item.state === filter));

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<BuildIcon fontSize="small" />}
      color={STATE_COLORS.overdue}
      title={t('panelMaintenance')}
      subtitle={status ? `${status.counts.overdue} ${t('maintenanceStateOverdue').toLowerCase()} · ${status.counts.soon} ${t('maintenanceStateSoon').toLowerCase()}` : t('sharedLoading')}
      width={380}
      height={460}
      actions={!readonly && <Tooltip title={t('serviceAdd')}><IconButton size="small" onClick={() => setSetup(true)}><AddIcon fontSize="small" /></IconButton></Tooltip>}
      footer={<Button size="small" onClick={() => navigate('/maintenance')}>{t('panelOpenMaintenance')}</Button>}
    >
      {status && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 1 }}>
          {['overdue', 'soon', 'ok'].map((state) => (
            <Box key={state} sx={{ flex: 1 }}>
              <Metric
                label={t(`maintenanceState${capitalize(state)}`)}
                value={status.counts[state]}
                color={STATE_COLORS[state]}
                active={filter === state}
                onClick={state === 'ok' ? null : () => setFilter(filter === state ? null : state)}
              />
            </Box>
          ))}
        </Stack>
      )}
      {status && !pending.length && <Empty>{t('panelNothingDue')}</Empty>}
      <Stack spacing={0.75}>
        {pending.map((item) => (
          <Box key={`${item.deviceId}-${item.maintenanceId}`} sx={{ p: 1, borderRadius: '12px', bgcolor: alpha(STATE_COLORS[item.state], 0.07), borderLeft: `4px solid ${STATE_COLORS[item.state]}` }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{`${item.name} · ${item.deviceName}`}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap component="div">
                  {`${formatRemaining(item.type, item.remaining, t)}${item.estimatedDate ? ` · ${dayjs(item.estimatedDate).format('DD/MM/YYYY')}` : ''}`}
                </Typography>
              </Box>
              <Chip size="small" label={t(`maintenanceState${capitalize(item.state)}`)} sx={{ height: 20, fontSize: 10, fontWeight: 700, color: STATE_COLORS[item.state], bgcolor: alpha(STATE_COLORS[item.state], 0.12) }} />
              {!readonly && (
                <Tooltip title={t('maintenanceRegister')}>
                  <IconButton size="small" color="primary" onClick={() => setRecord({ deviceId: item.deviceId, maintenanceId: item.maintenanceId })}><BuildIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
            </Stack>
          </Box>
        ))}
      </Stack>
      <ServiceDialog
        open={Boolean(record)}
        initial={record}
        items={status?.items || []}
        currency={currency}
        onClose={() => setRecord(null)}
        onSaved={() => { setRecord(null); load(); }}
      />
      <ServiceSetupDialog open={setup} deviceIds={[]} onClose={() => setSetup(false)} onSaved={() => { setSetup(false); load(); }} />
    </FloatingPanel>
  );
};

export default MaintenancePanel;
