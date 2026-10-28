import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Grid, IconButton, LinearProgress, MenuItem, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PaymentsIcon from '@mui/icons-material/Payments';
import RouteIcon from '@mui/icons-material/Route';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import BuildIcon from '@mui/icons-material/Build';
import TollIcon from '@mui/icons-material/Toll';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useRestriction } from '../common/util/permissions';
import ExpenseDialog, { EXPENSE_TYPES, expenseLabelKey } from './ExpenseDialog';

const PERIODS = {
  thisMonth: () => [dayjs().startOf('month'), dayjs()],
  last30d: () => [dayjs().subtract(30, 'day'), dayjs()],
  last3m: () => [dayjs().subtract(3, 'month').startOf('month'), dayjs()],
  thisYear: () => [dayjs().startOf('year'), dayjs()],
  last12m: () => [dayjs().subtract(12, 'month').startOf('month'), dayjs()],
};

const COLORS = {
  fuel: '#1e88e5', toll: '#8e24aa', maintenance: '#43a047', repair: '#e53935', tires: '#6d4c41', insurance: '#00897b', fine: '#f4511e', parking: '#fdd835', wash: '#26c6da', other: '#90a4ae',
};

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Costs per unit (fuel, tolls, workshop, tires...) with cost per km, charts, the expense log and upcoming services
const ExpensesPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => state.devices.items);
  const currency = useSelector((state) => state.session.server.attributes.currencySymbol || 'S/');

  const [period, setPeriod] = useState('thisMonth');
  const [selected, setSelected] = useState([]);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const money = (value) => `${currency} ${Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const params = () => {
    const [from, to] = PERIODS[period]();
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    (selected.length ? selected : Object.values(devices)).forEach((device) => query.append('deviceId', device.id));
    return query;
  };

  const load = useCatch(async () => {
    if (!Object.keys(devices).length) {
      return;
    }
    setLoading(true);
    try {
      const query = params();
      const [summaryResponse, expensesResponse, maintenanceResponse] = await Promise.all([
        fetchOrThrow(`/api/expenses/summary?${query}`),
        fetchOrThrow(`/api/expenses?${query}`),
        fetchOrThrow(`/api/expenses/maintenance?${new URLSearchParams([...query].filter(([key]) => key === 'deviceId'))}`),
      ]);
      setSummary(await summaryResponse.json());
      setExpenses(await expensesResponse.json());
      setMaintenances(await maintenanceResponse.json());
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    load();
  }, [period, selected, Object.keys(devices).length]);

  const remove = useCatch(async (expense) => {
    await fetchOrThrow(`/api/expenses/${expense.id}`, { method: 'DELETE' });
    load();
  });

  const monthly = useMemo(() => Object.entries(summary?.byMonth || {}).map(([month, values]) => ({
    month: dayjs(`${month}-01`).format('MMM YY'), ...values,
  })), [summary]);
  const types = Object.keys(summary?.byType || {});
  const pie = types.map((type) => ({ type, value: summary.byType[type] }));
  const visible = expenses.filter((expense) => typeFilter === 'all' || expense.type === typeFilter);

  const exportCsv = () => {
    const rows = [
      [t('expenseDate'), t('reportDevice'), t('sharedType'), t('expenseAmount'), t('expenseQuantity'), t('expenseOdometer'), t('expenseVendor'), t('expenseReference'), t('sharedDescription')],
      ...visible.map((expense) => [
        dayjs(expense.expenseTime).format('YYYY-MM-DD HH:mm'), devices[expense.deviceId]?.name || expense.deviceId, t(expenseLabelKey(expense.type)),
        expense.amount.toFixed(2), expense.quantity || '', expense.odometer || '', expense.vendor || '', expense.reference || '', expense.description || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `gastos-${dayjs().format('YYYYMMDD')}.csv`;
    link.click();
  };

  const remainingText = (item) => {
    if (item.type.endsWith('Time')) {
      const days = Math.round(item.remaining / 86400000);
      return days >= 0 ? `${days} ${t('expenseDays')}` : t('expenseOverdue');
    }
    if (item.type === 'hours') {
      return `${Math.round(item.remaining / 3600000)} h`;
    }
    return `${Math.round(item.remaining / 1000).toLocaleString('es-PE')} km`;
  };

  const Kpi = ({ icon, color, label, value, caption }) => (
    <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{
          width: 46, height: 46, borderRadius: 2.5, bgcolor: color, color: 'common.white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{label}</Typography>
          <Typography fontWeight={700} noWrap sx={{ color, fontSize: { xs: '1.05rem', xl: '1.25rem' } }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">{caption}</Typography>
        </Box>
      </Stack>
    </Card>
  );

  const byType = summary?.byType || {};

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1600 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }} sx={{ mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('expensesTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('expensesSubtitle')}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
          <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 170 }}>
            {Object.keys(PERIODS).map((value) => <MenuItem key={value} value={value}>{t(`expensePeriod${capitalize(value)}`)}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple
            size="small"
            limitTags={2}
            sx={{ minWidth: 260 }}
            options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
            getOptionLabel={(option) => option.name}
            value={selected}
            onChange={(_, value) => setSelected(value)}
            renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={selected.length ? '' : t('drivingAllUnits')} />}
          />
          {!readonly && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ deviceId: selected[0]?.id })}>{t('expenseAdd')}</Button>
          )}
        </Stack>
      </Stack>
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {summary && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <Kpi icon={<PaymentsIcon />} color={theme.palette.primary.main} label={t('expenseTotal')} value={money(summary.total)} caption={`${expenses.length} ${t('expenseRecords')}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <Kpi icon={<RouteIcon />} color="#7c4dff" label={t('expenseCostPerKm')} value={summary.costPerKm ? money(summary.costPerKm) : '—'} caption={`${summary.distance.toLocaleString('es-PE')} km`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <Kpi icon={<LocalGasStationIcon />} color={COLORS.fuel} label={t('expenseTypeFuel')} value={money(byType.fuel)} caption={summary.fuelPricePerLitre ? `${summary.fuelLitres.toFixed(0)} L · ${money(summary.fuelPricePerLitre)}/L` : '—'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
              <Kpi icon={<BuildIcon />} color={COLORS.maintenance} label={t('expenseWorkshop')} value={money((byType.maintenance || 0) + (byType.repair || 0) + (byType.tires || 0))} caption={t('expenseWorkshopCaption')} />
            </Grid>
            <Grid size={{ xs: 12, lg: 2.4 }}>
              <Kpi icon={<TollIcon />} color={COLORS.toll} label={t('expenseTypeToll')} value={money(byType.toll)} caption={`${t('expenseTypeParking')}: ${money(byType.parking)}`} />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('expenseByMonth')}</Typography>
                <Box sx={{ height: 280 }}>
                  {monthly.length ? (
                    <ResponsiveContainer>
                      <BarChart data={monthly}>
                        <CartesianGrid vertical={false} stroke={theme.palette.divider} />
                        <XAxis dataKey="month" stroke={theme.palette.text.secondary} fontSize={12} />
                        <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={70} tickFormatter={(value) => `${currency} ${value}`} />
                        <ChartTooltip formatter={(value, key) => [money(value), t(expenseLabelKey(key))]} />
                        <Legend formatter={(key) => t(expenseLabelKey(key))} />
                        {types.map((type) => <Bar key={type} dataKey={type} stackId="a" fill={COLORS[type] || COLORS.other} isAnimationActive={false} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <Typography color="text.secondary" sx={{ pt: 10, textAlign: 'center' }}>{t('expenseNone')}</Typography>}
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>{t('expenseByType')}</Typography>
                <Box sx={{ height: 280 }}>
                  {pie.length > 0 && (
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pie} dataKey="value" nameKey="type" innerRadius={60} outerRadius={100} paddingAngle={2} isAnimationActive={false}>
                          {pie.map((entry) => <Cell key={entry.type} fill={COLORS[entry.type] || COLORS.other} />)}
                        </Pie>
                        <ChartTooltip formatter={(value, key) => [money(value), t(expenseLabelKey(key))]} />
                        <Legend formatter={(key) => t(expenseLabelKey(key))} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Box>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2, pb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>{t('expenseByUnit')}</Typography>
                </Stack>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600 } }}>
                        <TableCell>{t('reportDevice')}</TableCell>
                        <TableCell align="right">{t('expenseTotal')}</TableCell>
                        <TableCell align="right">{t('fuelDistance')}</TableCell>
                        <TableCell align="right">{t('expenseCostPerKm')}</TableCell>
                        <TableCell>{t('expenseMix')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.units.map((unit) => (
                        <TableRow key={unit.deviceId} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{unit.name}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(unit.total)}</TableCell>
                          <TableCell align="right">{`${unit.distance.toLocaleString('es-PE')} km`}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{unit.costPerKm ? money(unit.costPerKm) : '—'}</TableCell>
                          <TableCell sx={{ minWidth: 140 }}>
                            <Stack direction="row" sx={{ height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover' }}>
                              {Object.entries(unit.byType).map(([type, value]) => (
                                <Tooltip key={type} title={`${t(expenseLabelKey(type))}: ${money(value)}`}>
                                  <Box sx={{ width: `${(value / Math.max(unit.total, 1)) * 100}%`, bgcolor: COLORS[type] || COLORS.other }} />
                                </Tooltip>
                              ))}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!summary.units.length && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">{t('expenseNone')}</Typography></TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </Box>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Card variant="outlined" sx={{ borderRadius: 3, p: 2, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <EventRepeatIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight={700}>{t('expenseUpcoming')}</Typography>
                </Stack>
                {maintenances.slice(0, 8).map((item) => {
                  const used = item.period > 0 ? Math.min(100, Math.max(0, (1 - item.remaining / item.period) * 100)) : 0;
                  const color = item.remaining <= 0 ? theme.palette.error.main : used > 85 ? theme.palette.warning.main : theme.palette.success.main;
                  return (
                    <Box key={`${item.deviceId}-${item.maintenanceId}`} sx={{ py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>{`${item.name} · ${item.deviceName}`}</Typography>
                          <Typography variant="caption" sx={{ color }}>{item.remaining <= 0 ? t('expenseOverdue') : `${t('expenseDueIn')} ${remainingText(item)}`}</Typography>
                        </Box>
                        {!readonly && (
                          <Button size="small" onClick={() => setEditing({ deviceId: item.deviceId, type: 'maintenance', maintenanceId: item.maintenanceId, description: item.name })}>
                            {t('expenseRegisterService')}
                          </Button>
                        )}
                      </Stack>
                      <LinearProgress variant="determinate" value={used} sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: alpha(color, 0.15), '& .MuiLinearProgress-bar': { bgcolor: color } }} />
                    </Box>
                  );
                })}
                {!maintenances.length && <Typography variant="body2" color="text.secondary">{t('expenseNoMaintenance')}</Typography>}
              </Card>
            </Grid>
          </Grid>

          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2, pb: 1 }} flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>{t('expenseLog')}</Typography>
              <TextField select size="small" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="all">{t('fuelAllTypes')}</MenuItem>
                {EXPENSE_TYPES.map((type) => <MenuItem key={type} value={type}>{t(expenseLabelKey(type))}</MenuItem>)}
              </TextField>
              <Tooltip title={t('fuelExportCsv')}><IconButton onClick={exportCsv}><DownloadIcon /></IconButton></Tooltip>
            </Stack>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600 } }}>
                    <TableCell>{t('expenseDate')}</TableCell>
                    <TableCell>{t('reportDevice')}</TableCell>
                    <TableCell>{t('sharedType')}</TableCell>
                    <TableCell>{t('sharedDescription')}</TableCell>
                    <TableCell align="right">{t('expenseQuantity')}</TableCell>
                    <TableCell align="right">{t('expenseOdometer')}</TableCell>
                    <TableCell align="right">{t('expenseAmount')}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((expense) => (
                    <TableRow key={expense.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{dayjs(expense.expenseTime).format('DD MMM YYYY')}</TableCell>
                      <TableCell>{devices[expense.deviceId]?.name}</TableCell>
                      <TableCell>
                        <Chip size="small" label={t(expenseLabelKey(expense.type))} sx={{ bgcolor: alpha(COLORS[expense.type] || COLORS.other, 0.15), color: COLORS[expense.type] || COLORS.other, fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{expense.description || expense.vendor || '—'}</Typography>
                        {expense.description && expense.vendor && <Typography variant="caption" color="text.secondary">{expense.vendor}</Typography>}
                      </TableCell>
                      <TableCell align="right">{expense.quantity ? `${expense.quantity}${expense.type === 'fuel' ? ' L' : ''}` : '—'}</TableCell>
                      <TableCell align="right">{expense.odometer ? `${expense.odometer.toLocaleString('es-PE')} km` : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(expense.amount)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {!readonly && (
                          <>
                            <IconButton size="small" onClick={() => setEditing(expense)}><EditIcon fontSize="small" /></IconButton>
                            <IconButton size="small" onClick={() => remove(expense)}><DeleteIcon fontSize="small" /></IconButton>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!visible.length && <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary">{t('expenseNone')}</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </>
      )}
      {!summary && !loading && <Alert severity="info">{t('expenseNone')}</Alert>}

      <ExpenseDialog
        open={Boolean(editing)}
        expense={editing}
        currency={currency}
        maintenances={maintenances}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Container>
  );
};

export default ExpensesPage;
