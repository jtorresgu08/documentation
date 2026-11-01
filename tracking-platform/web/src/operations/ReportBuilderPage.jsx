import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Container, Divider, FormControlLabel, Grid, IconButton,
  LinearProgress, List, ListItemButton, ListItemText, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import AddIcon from '@mui/icons-material/Add';
import ScheduleSendIcon from '@mui/icons-material/ScheduleSend';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { prefixString } from '../common/util/stringUtils';
import {
  EVENT_TYPES, SOURCES, buildTable, formatValue,
} from './reportSources';
import { capitalize } from './alertUtils';

const PERIODS = {
  today: () => [dayjs().startOf('day'), dayjs()],
  yesterday: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().startOf('day')],
  last7d: () => [dayjs().subtract(7, 'day'), dayjs()],
  thisMonth: () => [dayjs().startOf('month'), dayjs()],
  lastMonth: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().startOf('month')],
};

const newConfig = (source = 'summary') => ({
  source,
  columns: SOURCES[source].columns.filter((column) => column.default).map((column) => column.key),
  period: 'last7d',
  from: dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  to: dayjs().format('YYYY-MM-DD'),
  deviceIds: [],
  groupIds: [],
  groupBy: 'none',
  sortBy: null,
  sortDesc: false,
  totals: true,
  filters: {},
});

// Configurable reports: choose the data, the columns and their order, units, period, filters, grouping, sorting and
// totals; save it as a template, run it and export it to CSV / Excel or print it as PDF
const ReportBuilderPage = () => {
  const theme = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const groups = useSelector((state) => state.groups.items);
  const geofences = useSelector((state) => state.geofences.items);
  const currency = useSelector((state) => state.session.server.attributes.currencySymbol || 'S/');
  const brand = useSelector((state) => state.session.server.attributes.title || 'Safe Connection');

  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [name, setName] = useState('');
  const [config, setConfig] = useState(newConfig());
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const source = SOURCES[config.source];
  const ctx = { devices, geofences, t, currency };
  const update = (changes) => setConfig({ ...config, ...changes });

  const loadTemplates = async () => setTemplates(await (await fetchOrThrow('/api/report-templates')).json());
  useEffect(() => {
    loadTemplates().catch(() => {});
  }, []);

  const range = () => {
    if (config.period === 'custom') {
      return [dayjs(config.from).startOf('day'), dayjs(config.to).endOf('day')];
    }
    return PERIODS[config.period]();
  };

  const selectedDevices = () => {
    const ids = new Set(config.deviceIds);
    if (config.groupIds.length) {
      Object.values(devices).filter((device) => config.groupIds.includes(device.groupId)).forEach((device) => ids.add(device.id));
    }
    return ids.size ? [...ids] : Object.keys(devices).map(Number);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const [from, to] = range();
      if (source.maxDays && to.diff(from, 'day') > source.maxDays) {
        throw new Error(t('reportPeriodTooLong').replace('{days}', source.maxDays));
      }
      let data = await source.fetch({ deviceIds: selectedDevices(), from: from.toISOString(), to: to.toISOString(), filters: config.filters });
      if (config.filters.minDistance) data = data.filter((row) => row.distance >= config.filters.minDistance * 1000);
      if (config.filters.minDuration) data = data.filter((row) => row.duration >= config.filters.minDuration * 60000);
      setRows(data);
    } catch (e) {
      setError(e.message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  };

  const table = useMemo(() => (rows ? buildTable(rows, source, config, ctx) : null), [rows, config.columns, config.groupBy, config.sortBy, config.sortDesc, config.totals]);

  const save = async () => {
    const body = { name: name || t('reportBuilderUntitled'), config: JSON.stringify(config), attributes: {} };
    const response = await fetchOrThrow(templateId ? `/api/report-templates/${templateId}` : '/api/report-templates', {
      method: templateId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const saved = await response.json();
    setTemplateId(saved.id);
    setName(saved.name);
    setMessage(t('reportBuilderSaved'));
    loadTemplates();
  };

  const open = (template) => {
    try {
      const parsed = { ...newConfig(), ...JSON.parse(template.config) };
      setConfig(parsed);
      setTemplateId(template.id);
      setName(template.name);
      setRows(null);
    } catch {
      setError(t('reportBuilderInvalid'));
    }
  };

  const remove = async (template) => {
    await fetchOrThrow(`/api/report-templates/${template.id}`, { method: 'DELETE' });
    if (template.id === templateId) {
      setTemplateId(null);
      setName('');
    }
    loadTemplates();
  };

  const changeSource = (value) => {
    setConfig({ ...newConfig(value), period: config.period, from: config.from, to: config.to, deviceIds: config.deviceIds, groupIds: config.groupIds });
    setRows(null);
  };

  const toggleColumn = (key) => update({ columns: config.columns.includes(key) ? config.columns.filter((item) => item !== key) : [...config.columns, key] });
  const move = (key, delta) => {
    const index = config.columns.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= config.columns.length) return;
    const columns = [...config.columns];
    [columns[index], columns[target]] = [columns[target], columns[index]];
    update({ columns });
  };

  const textRows = () => {
    const header = table.columns.map((column) => t(column.label));
    const body = table.data.map((item) => table.columns.map((column) => formatValue(item.values[column.key], column.format, ctx)));
    const footer = table.totals ? [table.columns.map((column, index) => (index === 0 ? t('reportTotal') : formatValue(table.totals[column.key], column.format, ctx)))] : [];
    return [header, ...body, ...footer];
  };

  const exportCsv = () => {
    const csv = textRows().map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `${(name || t(`reportSource${capitalize(config.source)}`)).replace(/[^\w-]+/g, '_')}-${dayjs().format('YYYYMMDD')}.csv`;
    link.click();
  };

  const print = () => {
    const [from, to] = range();
    const [header, ...body] = textRows();
    const escape = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(name || t(`reportSource${capitalize(config.source)}`))}</title>
<style>body{font-family:Roboto,Arial,sans-serif;margin:24px;color:#0f1b2d}h1{font-size:18px;margin:0}p{color:#56657a;margin:4px 0 16px;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:11px}th{background:#eef3fb;text-align:left}th,td{border-bottom:1px solid #dde3ea;padding:6px 8px}
tr:last-child td{font-weight:700}</style></head><body><h1>${escape(brand)} · ${escape(name || t(`reportSource${capitalize(config.source)}`))}</h1>
<p>${escape(from.format('DD/MM/YYYY HH:mm'))} – ${escape(to.format('DD/MM/YYYY HH:mm'))} · ${table.data.length} ${escape(t('reportRows'))} · ${escape(dayjs().format('DD/MM/YYYY HH:mm'))}</p>
<table><thead><tr>${header.map((cell) => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((line) => `<tr>${line.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  return (
    <Container maxWidth={false} sx={{ py: 3, maxWidth: 1700 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('reportBuilderTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('reportBuilderSubtitle')}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<ScheduleSendIcon />} onClick={() => navigate('/reports/scheduled')}>{t('reportBuilderSchedule')}</Button>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4, lg: 3 }}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" sx={{ px: 1.5, py: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>{t('reportBuilderTemplates')}</Typography>
              <Tooltip title={t('reportBuilderNew')}>
                <IconButton size="small" onClick={() => { setConfig(newConfig()); setTemplateId(null); setName(''); setRows(null); }} aria-label={t('reportBuilderNew')}><AddIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
            <Divider />
            <List dense disablePadding>
              {templates.map((template) => (
                <ListItemButton key={template.id} selected={template.id === templateId} onClick={() => open(template)}>
                  <ListItemText primary={template.name} secondary={(() => { try { return t(`reportSource${capitalize(JSON.parse(template.config).source)}`); } catch { return ''; } })()} />
                  <IconButton size="small" edge="end" onClick={(event) => { event.stopPropagation(); remove(template); }} aria-label={t('sharedRemove')}><DeleteIcon fontSize="small" /></IconButton>
                </ListItemButton>
              ))}
              {!templates.length && <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>{t('reportBuilderNoTemplates')}</Typography>}
            </List>
          </Card>

          <Card variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.5}>
              <TextField size="small" label={t('reportBuilderName')} value={name} onChange={(event) => setName(event.target.value)} />
              <TextField select size="small" label={t('reportBuilderSource')} value={config.source} onChange={(event) => changeSource(event.target.value)}>
                {Object.keys(SOURCES).map((key) => <MenuItem key={key} value={key}>{t(`reportSource${capitalize(key)}`)}</MenuItem>)}
              </TextField>
              {!source.noPeriod && (
                <>
                  <TextField select size="small" label={t('reportPeriod')} value={config.period} onChange={(event) => update({ period: event.target.value })}>
                    {Object.keys(PERIODS).map((key) => <MenuItem key={key} value={key}>{t(`reportBuilderPeriod${capitalize(key)}`)}</MenuItem>)}
                    <MenuItem value="custom">{t('reportCustom')}</MenuItem>
                  </TextField>
                  {config.period === 'custom' && (
                    <Stack direction="row" spacing={1}>
                      <TextField size="small" type="date" label={t('reportFrom')} value={config.from} onChange={(event) => update({ from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                      <TextField size="small" type="date" label={t('reportTo')} value={config.to} onChange={(event) => update({ to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                    </Stack>
                  )}
                </>
              )}
              <Autocomplete
                multiple
                size="small"
                limitTags={2}
                options={Object.values(groups).sort((a, b) => a.name.localeCompare(b.name))}
                getOptionLabel={(option) => option.name}
                value={config.groupIds.map((id) => groups[id]).filter(Boolean)}
                onChange={(_, value) => update({ groupIds: value.map((item) => item.id) })}
                renderInput={(params) => <TextField {...params} label={t('settingsGroups')} />}
              />
              <Autocomplete
                multiple
                size="small"
                limitTags={2}
                options={Object.values(devices).sort((a, b) => a.name.localeCompare(b.name))}
                getOptionLabel={(option) => option.name}
                value={config.deviceIds.map((id) => devices[id]).filter(Boolean)}
                onChange={(_, value) => update({ deviceIds: value.map((item) => item.id) })}
                renderInput={(params) => <TextField {...params} label={t('deviceTitle')} placeholder={config.deviceIds.length || config.groupIds.length ? '' : t('drivingAllUnits')} />}
              />
              {source.filters?.includes('eventTypes') && (
                <Autocomplete
                  multiple
                  size="small"
                  limitTags={2}
                  options={EVENT_TYPES}
                  getOptionLabel={(option) => t(prefixString('event', option))}
                  value={config.filters.eventTypes || []}
                  onChange={(_, value) => update({ filters: { ...config.filters, eventTypes: value } })}
                  renderInput={(params) => <TextField {...params} label={t('reportEventTypes')} placeholder={config.filters.eventTypes?.length ? '' : t('eventAll')} />}
                />
              )}
              {source.filters?.includes('minDistance') && (
                <TextField size="small" type="number" label={t('reportBuilderMinDistance')} value={config.filters.minDistance || ''} onChange={(event) => update({ filters: { ...config.filters, minDistance: Number(event.target.value) || 0 } })} />
              )}
              {source.filters?.includes('minDuration') && (
                <TextField size="small" type="number" label={t('reportBuilderMinDuration')} value={config.filters.minDuration || ''} onChange={(event) => update({ filters: { ...config.filters, minDuration: Number(event.target.value) || 0 } })} />
              )}
              {source.groups.length > 0 && (
                <TextField select size="small" label={t('reportBuilderGroupBy')} value={config.groupBy} onChange={(event) => update({ groupBy: event.target.value })}>
                  <MenuItem value="none">{t('reportBuilderNoGrouping')}</MenuItem>
                  {source.groups.map((key) => <MenuItem key={key} value={key}>{t(`reportGroupBy${capitalize(key)}`)}</MenuItem>)}
                </TextField>
              )}
              <FormControlLabel control={<Switch size="small" checked={config.totals} onChange={(event) => update({ totals: event.target.checked })} />} label={<Typography variant="body2">{t('reportBuilderTotals')}</Typography>} />
            </Stack>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 8, lg: 9 }}>
          <Card variant="outlined" sx={{ p: 1.5, mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>{t('reportBuilderColumns')}</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {config.columns.map((key, index) => {
                const column = source.columns.find((item) => item.key === key);
                return column && (
                  <Chip
                    key={key}
                    color="primary"
                    label={(
                      <Stack direction="row" alignItems="center" spacing={0.25}>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>{index + 1}</Typography>
                        <span>{t(column.label)}</span>
                        <IconButton size="small" sx={{ color: 'inherit', p: 0.25 }} onClick={() => move(key, -1)} aria-label={t('reportBuilderMoveLeft')}><ArrowUpwardIcon sx={{ fontSize: 14, transform: 'rotate(-90deg)' }} /></IconButton>
                        <IconButton size="small" sx={{ color: 'inherit', p: 0.25 }} onClick={() => move(key, 1)} aria-label={t('reportBuilderMoveRight')}><ArrowDownwardIcon sx={{ fontSize: 14, transform: 'rotate(-90deg)' }} /></IconButton>
                      </Stack>
                    )}
                    onDelete={() => toggleColumn(key)}
                  />
                );
              })}
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {source.columns.filter((column) => !config.columns.includes(column.key)).map((column) => (
                <Chip key={column.key} size="small" variant="outlined" icon={<AddIcon />} label={t(column.label)} onClick={() => toggleColumn(column.key)} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap alignItems="center">
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={run} disabled={loading || !config.columns.length}>{t('reportShow')}</Button>
              <Button variant="outlined" startIcon={<SaveIcon />} onClick={save}>{templateId ? t('reportBuilderUpdate') : t('reportBuilderSave')}</Button>
              <Button startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!table?.data.length}>{t('reportBuilderExcel')}</Button>
              <Button startIcon={<PrintIcon />} onClick={print} disabled={!table?.data.length}>{t('reportBuilderPrint')}</Button>
              {message && <Typography variant="caption" color="success.main">{message}</Typography>}
            </Stack>
          </Card>

          {loading && <LinearProgress sx={{ mb: 1 }} />}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!table && !loading && <Alert severity="info">{t('reportBuilderHint')}</Alert>}
          {table && (
            <Card variant="outlined" sx={{ overflowX: 'auto' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 1, display: 'block' }}>{`${table.data.length} ${t('reportRows')}`}</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {table.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        align={column.format && column.format !== 'datetime' && column.format !== 'date' ? 'right' : 'left'}
                        onClick={() => update({ sortBy: column.key, sortDesc: config.sortBy === column.key ? !config.sortDesc : false })}
                        sx={{ cursor: 'pointer', whiteSpace: 'nowrap', bgcolor: alpha(theme.palette.primary.main, 0.04) }}
                      >
                        {t(column.label)}
                        {config.sortBy === column.key && (config.sortDesc ? ' ↓' : ' ↑')}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.data.slice(0, 2000).map((item, index) => (
                     
                    <TableRow key={index} hover>
                      {table.columns.map((column) => (
                        <TableCell key={column.key} align={column.format && column.format !== 'datetime' && column.format !== 'date' ? 'right' : 'left'} sx={{ whiteSpace: column.format ? 'nowrap' : 'normal' }}>
                          {formatValue(item.values[column.key], column.format, ctx)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {table.totals && (
                    <TableRow sx={{ '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.divider}` } }}>
                      {table.columns.map((column, index) => (
                        <TableCell key={column.key} align={column.format && column.format !== 'datetime' && column.format !== 'date' ? 'right' : 'left'}>
                          {index === 0 ? t('reportTotal') : formatValue(table.totals[column.key], column.format, ctx)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </Grid>
      </Grid>
    </Container>
  );
};

export default ReportBuilderPage;
