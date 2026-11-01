import { useEffect, useState } from 'react';
import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import DownloadIcon from '@mui/icons-material/Download';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { downloadCsv } from '../reports/reportPeriods';
import {
  STATE_COLORS, hoursText, stateLabel, typeLabel,
} from './machineryUtils';

const Timeline = ({ segments, from, to, t }) => {
  const span = to - from;
  return (
    <Box sx={{ position: 'relative', height: 26, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'action.hover' }}>
      {segments.map((segment) => (
        <Tooltip key={segment.start} title={`${stateLabel(t, segment.state)} · ${dayjs(segment.start).format('DD/MM HH:mm')} – ${dayjs(segment.end).format('HH:mm')}`}>
          <Box sx={{
            position: 'absolute', top: 0, bottom: 0, left: `${((segment.start - from) / span) * 100}%`, width: `${Math.max(0.2, ((segment.end - segment.start) / span) * 100)}%`, bgcolor: STATE_COLORS[segment.state],
          }}
          />
        </Tooltip>
      ))}
    </Box>
  );
};

// One machine in the period: hours by day, timeline, sites, operators, maintenance by hours and the daily report
const MachineDetail = ({ machine, range, onClose, onSettings }) => {
  const t = useTranslation();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(`/api/machinery/${machine.deviceId}?from=${encodeURIComponent(range[0].toISOString())}&to=${encodeURIComponent(range[1].toISOString())}`)
      .then((response) => response.json()).then(setDetail);
  }, [machine.deviceId]);

  const exportCsv = () => downloadCsv(`parte-${machine.name}`, [t('machineryDate'), t('machineryWork'), t('machineryIdle'), t('machineryOff'), t('machineryEngineHours'), t('machineryUtilization')],
    detail.days.map((day) => [day.date, day.workHours, day.idleHours, day.offHours, day.engineHours, day.utilization ?? '']));
  const kpi = (label, value, detailText, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 120, p: 1.25, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>{value}</Typography>
      {detailText && <Typography variant="caption" color="text.secondary">{detailText}</Typography>}
    </Card>
  );

  return (
    <Dialog open fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={700}>{machine.name}</Typography>
            <Typography variant="caption" color="text.secondary">{`${typeLabel(t, machine.machineType)} · ${t('machineryHourMeter')} ${hoursText(machine.hourMeter)}`}</Typography>
          </Box>
          <Chip label={stateLabel(t, machine.now)} sx={{ bgcolor: `${STATE_COLORS[machine.now]}22`, color: STATE_COLORS[machine.now], fontWeight: 700 }} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {!detail && <LinearProgress />}
        {detail && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              {kpi(t('machineryWork'), hoursText(detail.workHours), null, STATE_COLORS.work)}
              {kpi(t('machineryIdle'), hoursText(detail.idleHours), null, STATE_COLORS.idle)}
              {kpi(t('machineryUtilization'), detail.utilization != null ? `${detail.utilization}%` : '—', t('machineryUtilizationHelp'))}
              {detail.outOfHoursHours != null && kpi(t('machineryOutOfHours'), hoursText(detail.outOfHoursHours), detail.workSchedule, detail.outOfHoursHours > 0 ? '#d9534f' : undefined)}
              {detail.fuelPerHour != null && kpi(t('machineryFuelPerHour'), `${detail.fuelPerHour} L/h`, `${detail.fuelUsed} L`)}
              {detail.amount != null && kpi(t('machineryAmount'), `S/ ${detail.amount.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, `${hoursText(detail.billableHours)} × S/ ${detail.hourRate}`, '#2563c9')}
            </Stack>
            {detail.segments?.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>{t('machineryTimeline')}</Typography>
                <Timeline segments={detail.segments} from={range[0].valueOf()} to={Math.min(range[1].valueOf(), Date.now())} t={t} />
                <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{dayjs(range[0]).format('DD/MM HH:mm')}</Typography><Typography variant="caption" color="text.secondary">{dayjs(Math.min(range[1].valueOf(), Date.now())).format('DD/MM HH:mm')}</Typography></Stack>
              </Box>
            )}
            {detail.days.length > 1 && (
              <Box sx={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={detail.days.map((day) => ({ ...day, label: dayjs(day.date).format('DD/MM') }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} unit=" h" />
                    <ChartTooltip />
                    <Legend />
                    <Bar dataKey="workHours" stackId="h" name={t('machineryWork')} fill={STATE_COLORS.work} />
                    <Bar dataKey="idleHours" stackId="h" name={t('machineryIdle')} fill={STATE_COLORS.idle} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ p: 1.5, pb: 0 }}>{t('machinerySites')}</Typography>
                <Table size="small">
                  <TableHead><TableRow><TableCell>{t('machinerySite')}</TableCell><TableCell align="right">{t('machineryWork')}</TableCell><TableCell align="right">{t('machineryIdle')}</TableCell></TableRow></TableHead>
                  <TableBody>
                    {detail.sites.filter((site) => site.engineHours > 0).map((site) => (
                      <TableRow key={site.geofenceId}><TableCell>{site.name}</TableCell><TableCell align="right">{hoursText(site.workHours)}</TableCell><TableCell align="right">{hoursText(site.idleHours)}</TableCell></TableRow>
                    ))}
                    {!detail.sites.some((site) => site.engineHours > 0) && <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>{t('machineryNoSites')}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ p: 1.5, pb: 0 }}>{t('machineryOperators')}</Typography>
                <Table size="small">
                  <TableHead><TableRow><TableCell>{t('machineryOperator')}</TableCell><TableCell align="right">{t('machineryEngineHours')}</TableCell><TableCell align="right">%</TableCell></TableRow></TableHead>
                  <TableBody>
                    {detail.operators.map((item) => (
                      <TableRow key={item.operator}><TableCell>{item.name}</TableCell><TableCell align="right">{hoursText(item.engineHours)}</TableCell><TableCell align="right">{item.utilization ?? '—'}</TableCell></TableRow>
                    ))}
                    {!detail.operators.length && <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>{t('machineryNoOperators')}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 3 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ p: 1.5, pb: 0 }}>{t('machineryMaintenance')}</Typography>
                <Table size="small">
                  <TableHead><TableRow><TableCell>{t('sharedName')}</TableCell><TableCell align="right">{t('machineryEvery')}</TableCell><TableCell align="right">{t('machineryRemaining')}</TableCell></TableRow></TableHead>
                  <TableBody>
                    {detail.maintenances.map((item) => (
                      <TableRow key={item.name}><TableCell>{item.name}</TableCell><TableCell align="right">{hoursText(item.everyHours)}</TableCell><TableCell align="right" sx={{ color: item.remainingHours < 25 ? '#d9534f' : undefined, fontWeight: 700 }}>{hoursText(item.remainingHours)}</TableCell></TableRow>
                    ))}
                    {!detail.maintenances.length && <TableRow><TableCell colSpan={3} sx={{ color: 'text.secondary' }}>{t('machineryNoMaintenance')}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Card>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button startIcon={<SettingsIcon />} onClick={onSettings} sx={{ mr: 'auto' }}>{t('machinerySettings')}</Button>
        <Button startIcon={<DownloadIcon />} disabled={!detail} onClick={exportCsv}>{t('machineryDailyReport')}</Button>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MachineDetail;
