import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Autocomplete, Box, Card, Chip, Container, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { PERIODS, downloadCsv, periodRange } from '../reports/reportPeriods';
import MachineDialog from './MachineDialog';
import MachineDetail from './MachineDetail';
import {
  STATE_COLORS, capitalize, hoursText, stateLabel, typeLabel,
} from './machineryUtils';

const HoursBar = ({ machine, t }) => {
  const total = machine.workHours + machine.idleHours + machine.offHours;
  if (!total) return '—';
  return (
    <Tooltip title={`${t('machineryWork')} ${hoursText(machine.workHours)} · ${t('machineryIdle')} ${hoursText(machine.idleHours)} · ${t('machineryOff')} ${hoursText(machine.offHours)}`}>
      <Box sx={{
        display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', minWidth: 140,
      }}
      >
        {['work', 'idle', 'off'].map((state) => <Box key={state} sx={{ width: `${(machine[`${state}Hours`] / total) * 100}%`, bgcolor: STATE_COLORS[state] }} />)}
      </Box>
    </Tooltip>
  );
};

// Heavy machinery: what each machine is doing now, hour meter, work and idle hours with utilization in the period,
// current site, next maintenance by hours and rental amount
const MachineryPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => Object.values(state.devices.items));
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({ from: dayjs().startOf('day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [machines, setMachines] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  const range = periodRange(period, custom);
  const load = async () => {
    setMachines(null);
    const [from, to] = periodRange(period, custom);
    setMachines(await (await fetch(`/api/machinery?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)).json());
  };
  useEffect(() => {
    if (period !== 'custom') load();
  }, [period]);

  const sum = (key) => machines?.reduce((total, machine) => total + (machine[key] || 0), 0) || 0;
  const working = machines?.filter((machine) => machine.now === 'work').length || 0;
  const engine = sum('workHours') + sum('idleHours');
  const amount = sum('amount');
  const exportCsv = () => downloadCsv('maquinaria', [t('sharedDevice'), t('sharedType'), t('machineryHourMeter'), t('machineryWork'), t('machineryIdle'), t('machineryUtilization'), t('machineryOutOfHours'), t('machinerySite'), t('machineryAmount')],
    machines.map((machine) => [machine.name, typeLabel(t, machine.machineType), machine.hourMeter, machine.workHours, machine.idleHours, machine.utilization ?? '', machine.outOfHoursHours ?? '', machine.site || '', machine.amount ?? '']));
  const kpi = (label, value, detail, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 140, p: 1.5, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('machineryTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('machinerySubtitle')}</Typography>
        </Box>
        <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 140 }}>
          {PERIODS.map((item) => <MenuItem key={item} value={item}>{t(`opsPeriod${capitalize(item)}`)}</MenuItem>)}
        </TextField>
        {period === 'custom' && (
          <>
            <TextField size="small" type="datetime-local" label={t('reportFrom')} value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="datetime-local" label={t('reportTo')} value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <Chip label={t('reportShow')} color="primary" onClick={load} />
          </>
        )}
        <Chip label="CSV" variant="outlined" onClick={() => machines?.length && exportCsv()} />
        {!readonly && (
          <Autocomplete
            size="small"
            sx={{ minWidth: 230 }}
            options={devices.filter((device) => !machines?.some((machine) => machine.deviceId === device.id))}
            getOptionLabel={(option) => option.name}
            onChange={(_, device) => device && setEditing({ device })}
            renderInput={(params) => <TextField {...params} label={t('machineryAdd')} />}
          />
        )}
      </Stack>
      {!machines && <LinearProgress />}
      {machines && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            {kpi(t('machineryWorkingNow'), `${working} / ${machines.length}`, t('machineryMachines'), STATE_COLORS.work)}
            {kpi(t('machineryEngineHours'), hoursText(engine), `${hoursText(sum('workHours'))} ${t('machineryWorkLower')}`)}
            {kpi(t('machineryUtilization'), engine ? `${Math.round((sum('workHours') / engine) * 1000) / 10}%` : '—', t('machineryUtilizationHelp'))}
            {kpi(t('machineryIdle'), hoursText(sum('idleHours')), t('machineryIdleHelp'), STATE_COLORS.idle)}
            {amount > 0 && kpi(t('machineryAmount'), `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, t('machineryAmountHelp'), '#2563c9')}
          </Stack>
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('machineryMachine')}</TableCell>
                  <TableCell>{t('machineryNow')}</TableCell>
                  <TableCell align="right">{t('machineryHourMeter')}</TableCell>
                  <TableCell>{t('machineryUse')}</TableCell>
                  <TableCell align="right">{t('machineryWork')}</TableCell>
                  <TableCell align="right">{t('machineryIdle')}</TableCell>
                  <TableCell align="right">{t('machineryUtilization')}</TableCell>
                  <TableCell>{t('machinerySite')}</TableCell>
                  <TableCell>{t('machineryNextMaintenance')}</TableCell>
                  <TableCell align="right">{t('machineryAmount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {machines.map((machine) => (
                  <TableRow key={machine.deviceId} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(machine)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{machine.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{typeLabel(t, machine.machineType)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={stateLabel(t, machine.now)} sx={{ bgcolor: `${STATE_COLORS[machine.now]}22`, color: STATE_COLORS[machine.now], fontWeight: 700 }} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{hoursText(machine.hourMeter)}</TableCell>
                    <TableCell><HoursBar machine={machine} t={t} /></TableCell>
                    <TableCell align="right" sx={{ color: STATE_COLORS.work, fontWeight: 700 }}>{hoursText(machine.workHours)}</TableCell>
                    <TableCell align="right" sx={{ color: STATE_COLORS.idle }}>{hoursText(machine.idleHours)}</TableCell>
                    <TableCell align="right">{machine.utilization != null ? `${machine.utilization}%` : '—'}</TableCell>
                    <TableCell>{machine.site || '—'}</TableCell>
                    <TableCell>
                      {machine.nextMaintenance ? (
                        <Typography variant="body2" sx={{ color: machine.nextMaintenance.remainingHours < 25 ? '#d9534f' : undefined, fontWeight: machine.nextMaintenance.remainingHours < 25 ? 700 : 400 }}>
                          {`${machine.nextMaintenance.name} · ${t('machineryIn')} ${hoursText(machine.nextMaintenance.remainingHours)}`}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right">{machine.amount != null ? `S/ ${machine.amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                  </TableRow>
                ))}
                {!machines.length && <TableRow><TableCell colSpan={10}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{t('machineryEmpty')}</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </Stack>
      )}
      {selected && <MachineDetail machine={selected} range={range} onClose={() => setSelected(null)} onSettings={() => { setEditing({ device: { id: selected.deviceId, name: selected.name }, machine: selected }); setSelected(null); }} />}
      {editing && <MachineDialog device={editing.device} machine={editing.machine} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Container>
  );
};

export default MachineryPage;
