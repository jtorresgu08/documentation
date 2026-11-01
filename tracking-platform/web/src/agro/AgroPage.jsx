import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, Chip, Container, IconButton, LinearProgress, MenuItem, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import dayjs from 'dayjs';
import MapView from '../map/core/MapView';
import MapScale from '../map/MapScale';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { PERIODS, downloadCsv, periodRange } from '../reports/reportPeriods';
import AgroMap, { PASS_COLORS } from './AgroMap';
import ImplementDialog from './ImplementDialog';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Agriculture and machinery: field work (worked hectares, coverage, overlap, passes, hours), fields, implements and a
// summary per unit
const AgroPage = () => {
  const t = useTranslation();
  const readonly = useRestriction('readonly');
  const devices = useSelector((state) => state.devices.items);
  const [tab, setTab] = useState('work');
  const [implementsList, setImplements] = useState([]);
  const [fields, setFields] = useState([]);
  const [allGeofences, setAllGeofences] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [implementId, setImplementId] = useState('');
  const [period, setPeriod] = useState('today');
  const [custom, setCustom] = useState({ from: dayjs().startOf('day').format('YYYY-MM-DDTHH:mm'), to: dayjs().format('YYYY-MM-DDTHH:mm') });
  const [work, setWork] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadImplements = async () => setImplements(await (await fetch('/api/agro/implements')).json());
  const loadFields = async () => {
    const all = await (await fetch('/api/agro/fields?all=true')).json();
    setAllGeofences(all);
    setFields(all.filter((item) => item.field));
  };
  useEffect(() => {
    loadImplements();
    loadFields();
  }, []);

  const range = () => periodRange(period, custom).map((date) => encodeURIComponent(date.toISOString()));
  const units = [...new Set(implementsList.flatMap((implement) => implement.deviceIds))].map((id) => devices[id]).filter(Boolean);

  const analyze = async () => {
    if (!deviceId) return;
    setError(null);
    setLoading(true);
    const [from, to] = range();
    const response = await fetch(`/api/agro/work?deviceId=${deviceId}${fieldId ? `&fieldId=${fieldId}` : ''}${implementId ? `&implementId=${implementId}` : ''}&from=${from}&to=${to}`);
    setLoading(false);
    if (response.ok) setWork(await response.json());
    else setError((await response.text()).split('\n')[0]);
  };
  const loadSummary = async () => {
    setSummary(null);
    const [from, to] = range();
    setSummary(await (await fetch(`/api/agro/summary?from=${from}&to=${to}`)).json());
  };
  useEffect(() => {
    if (tab === 'summary') loadSummary();
  }, [tab, period]);
  useEffect(() => {
    if (!deviceId && units.length) setDeviceId(units[0].id);
    if (!fieldId && fields.length) setFieldId(fields[0].id);
  }, [units.length, fields.length]);

  const markField = async (geofence, changes) => {
    await fetch(`/api/agro/fields/${geofence.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field: geofence.field, crop: geofence.crop, ...changes }),
    });
    loadFields();
  };
  const removeImplement = async (implement) => {
    await fetch(`/api/agro/implements/${implement.id}`, { method: 'DELETE' });
    loadImplements();
  };

  const kpi = (label, value, detail, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 120, p: 1.25, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>{value ?? '—'}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Card>
  );
  const periodSelect = (
    <TextField select size="small" label={t('reportPeriod')} value={period} onChange={(event) => setPeriod(event.target.value)} sx={{ minWidth: 140 }}>
      {PERIODS.map((item) => <MenuItem key={item} value={item}>{t(`opsPeriod${capitalize(item)}`)}</MenuItem>)}
    </TextField>
  );
  const customRange = period === 'custom' && (
    <>
      <TextField size="small" type="datetime-local" label={t('reportFrom')} value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField size="small" type="datetime-local" label={t('reportTo')} value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
    </>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 1 }}>
        <Typography variant="h5" fontWeight={700}>{t('agroTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('agroSubtitle')}</Typography>
      </Box>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="work" label={t('agroWork')} />
        <Tab value="summary" label={t('agroSummary')} />
        <Tab value="fields" label={`${t('agroFields')} (${fields.length})`} />
        <Tab value="implements" label={`${t('agroImplements')} (${implementsList.length})`} />
      </Tabs>
      {tab === 'work' && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField select size="small" label={t('sharedDevice')} value={deviceId} onChange={(event) => setDeviceId(event.target.value)} sx={{ minWidth: 180 }}>
              {units.map((device) => <MenuItem key={device.id} value={device.id}>{device.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('agroField')} value={fieldId} onChange={(event) => setFieldId(event.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">{t('agroNoField')}</MenuItem>
              {fields.map((field) => <MenuItem key={field.id} value={field.id}>{`${field.name}${field.crop ? ` · ${field.crop}` : ''}`}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('agroImplement')} value={implementId} onChange={(event) => setImplementId(event.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">{t('agroAssignedImplement')}</MenuItem>
              {implementsList.map((implement) => <MenuItem key={implement.id} value={implement.id}>{`${implement.name} · ${implement.width} m`}</MenuItem>)}
            </TextField>
            {periodSelect}
            {customRange}
            <Button variant="contained" onClick={analyze} disabled={!deviceId || loading}>{t('reportShow')}</Button>
          </Stack>
          {!units.length && <Alert severity="info">{t('agroNoUnits')}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <LinearProgress />}
          {work && (
            <>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {kpi(t('agroWorkedHa'), `${work.workedHa} ha`, work.fieldHa != null ? `${t('agroOf')} ${work.fieldHa} ha` : null, '#2f7d32')}
                {work.coveragePercent != null && kpi(t('agroCoverage'), `${work.coveragePercent}%`, `${work.missedHa} ha ${t('agroMissed')}`, work.coveragePercent < 90 ? '#e67e22' : '#2f7d32')}
                {kpi(t('agroOverlap'), `${work.overlapPercent}%`, `${work.overlapHa} ha`, work.overlapPercent > 10 ? '#d9534f' : undefined)}
                {kpi(t('agroPasses'), work.passCount, `${work.workKm} km`)}
                {kpi(t('agroHours'), work.workHours, work.averageSpeedKmh != null ? `${work.averageSpeedKmh} km/h` : null)}
                {kpi(t('agroProductivity'), work.haPerHour != null ? `${work.haPerHour} ha/h` : null, `${work.implementName} · ${work.width} m`)}
                {work.outsideHa > 0 && kpi(t('agroOutside'), `${work.outsideHa} ha`, null, '#8a93a3')}
              </Stack>
              <Card variant="outlined" sx={{ borderRadius: 4, height: 460, position: 'relative', overflow: 'hidden' }}>
                <MapView>
                  <AgroMap work={work} />
                </MapView>
                <MapScale />
                <Stack direction="row" spacing={1} sx={{ position: 'absolute', left: 12, top: 12, bgcolor: 'background.paper', borderRadius: 2, p: 1, boxShadow: 2 }}>
                  {[0, 1, 2, 3].map((passes) => (
                    <Stack key={passes} direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: PASS_COLORS[passes] }} />
                      <Typography variant="caption" fontWeight={600}>{passes === 0 ? t('agroNotWorked') : passes === 3 ? '3+' : `${passes}×`}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('agroPass')}</TableCell>
                      <TableCell>{t('reportStartTime')}</TableCell>
                      <TableCell>{t('reportEndTime')}</TableCell>
                      <TableCell align="right">{t('sharedDistance')}</TableCell>
                      <TableCell align="right">km/h</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {work.passes.slice(0, 200).map((pass) => {
                      const minutes = (pass.end - pass.start) / 60000;
                      return (
                        <TableRow key={pass.number}>
                          <TableCell>{pass.number}</TableCell>
                          <TableCell>{dayjs(pass.start).format('DD/MM HH:mm')}</TableCell>
                          <TableCell>{dayjs(pass.end).format('HH:mm')}</TableCell>
                          <TableCell align="right">{`${pass.meters} m`}</TableCell>
                          <TableCell align="right">{minutes > 0 ? (pass.meters / 1000 / (minutes / 60)).toFixed(1) : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </Stack>
      )}
      {tab === 'summary' && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5}>
            {periodSelect}
            {customRange}
            {period === 'custom' && <Button variant="contained" onClick={loadSummary}>{t('reportShow')}</Button>}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="outlined"
              disabled={!summary?.length}
              onClick={() => downloadCsv('agro-resumen', [t('sharedDevice'), t('agroImplement'), t('agroWorkedHa'), t('agroOverlap'), t('agroHours'), 'km', t('agroProductivity'), t('agroPasses')],
                summary.map((item) => [item.deviceName, item.implementName, item.workedHa, item.overlapPercent, item.workHours, item.workKm, item.haPerHour ?? '', item.passCount]))}
            >
              CSV
            </Button>
          </Stack>
          {!summary && <LinearProgress />}
          {summary && (
            <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('sharedDevice')}</TableCell>
                    <TableCell>{t('agroImplement')}</TableCell>
                    <TableCell align="right">{t('agroWorkedHa')}</TableCell>
                    <TableCell align="right">{t('agroOverlap')}</TableCell>
                    <TableCell align="right">{t('agroHours')}</TableCell>
                    <TableCell align="right">km</TableCell>
                    <TableCell align="right">{t('agroProductivity')}</TableCell>
                    <TableCell align="right">{t('agroPasses')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.map((item) => (
                    <TableRow key={item.deviceId}>
                      <TableCell sx={{ fontWeight: 600 }}>{item.deviceName}</TableCell>
                      <TableCell>{`${item.implementName} · ${item.width} m`}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#2f7d32' }}>{`${item.workedHa} ha`}</TableCell>
                      <TableCell align="right">{`${item.overlapPercent}%`}</TableCell>
                      <TableCell align="right">{item.workHours}</TableCell>
                      <TableCell align="right">{item.workKm}</TableCell>
                      <TableCell align="right">{item.haPerHour != null ? `${item.haPerHour} ha/h` : '—'}</TableCell>
                      <TableCell align="right">{item.passCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Stack>
      )}
      {tab === 'fields' && (
        <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedGeofence')}</TableCell>
                <TableCell>{t('agroIsField')}</TableCell>
                <TableCell>{t('agroCrop')}</TableCell>
                <TableCell align="right">{t('agroArea')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allGeofences.map((geofence) => (
                <TableRow key={geofence.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{geofence.name}</TableCell>
                  <TableCell><Switch checked={geofence.field} disabled={readonly} onChange={(event) => markField(geofence, { field: event.target.checked })} /></TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      defaultValue={geofence.crop || ''}
                      placeholder={t('agroCropExample')}
                      disabled={readonly || !geofence.field}
                      onBlur={(event) => event.target.value !== (geofence.crop || '') && markField(geofence, { crop: event.target.value })}
                    />
                  </TableCell>
                  <TableCell align="right">{geofence.areaHa != null ? `${geofence.areaHa} ha` : '—'}</TableCell>
                </TableRow>
              ))}
              {!allGeofences.length && (
                <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{t('agroNoGeofences')}</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
      {tab === 'implements' && (
        <Stack spacing={1.5}>
          {!readonly && <Button variant="contained" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => setEditing({})}>{t('agroNewImplement')}</Button>}
          <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('sharedName')}</TableCell>
                  <TableCell>{t('sharedType')}</TableCell>
                  <TableCell align="right">{t('agroWidth')}</TableCell>
                  <TableCell>{t('agroWorkingWhen')}</TableCell>
                  <TableCell>{t('agroUnits')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {implementsList.map((implement) => (
                  <TableRow key={implement.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{implement.name}</TableCell>
                    <TableCell>{t(`agroType${capitalize(implement.type || 'other')}`)}</TableCell>
                    <TableCell align="right">{`${implement.width} m`}</TableCell>
                    <TableCell>{implement.workAttribute ? `${t('agroInput')} ${implement.workAttribute}` : `${implement.minSpeed || 2}–${implement.maxSpeed || 20} km/h`}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {implement.deviceIds.map((id) => devices[id] && <Chip key={id} size="small" label={devices[id].name} />)}
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!readonly && <IconButton size="small" onClick={() => setEditing(implement)}><EditIcon fontSize="small" /></IconButton>}
                      {!readonly && <IconButton size="small" onClick={() => removeImplement(implement)}><DeleteIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Stack>
      )}
      {editing && <ImplementDialog implement={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadImplements(); }} />}
    </Container>
  );
};

export default AgroPage;
