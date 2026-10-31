import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Divider, FormControlLabel, IconButton, InputAdornment, LinearProgress, MenuItem, Paper, Stack,
  Switch, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import dayjs from 'dayjs';
import MapView from '../map/core/MapView';
import MapScale from '../map/MapScale';
import { useTranslation } from '../common/components/LocalizationProvider';
import DispatchNav from './DispatchNav';
import PlannerMap from './PlannerMap';
import {
  ROUTE_COLORS, formatHour, reasonLabel, timeOnDate,
} from './dispatchUtils';

const vehicleDefaults = (device) => ({
  deviceId: device.id,
  name: device.name,
  capacityWeight: device.attributes?.dispatchCapacityKg || '',
  capacityVolume: device.attributes?.dispatchCapacityM3 || '',
  maxStops: device.attributes?.dispatchMaxStops || '',
  from: '08:00',
  to: '18:00',
  driverName: '',
  driverPhone: '',
});

// Automatic planning (Wialon Logistics style): choose the orders of the day, the vehicles with their capacity and
// shift and the depot; the planner splits the orders into routes (capacity, time windows, shift, return to depot),
// shows them on the map with times, distance and load, lists what does not fit and creates the trips
const PlannerPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const devices = useSelector((state) => Object.values(state.devices.items).sort((a, b) => a.name.localeCompare(b.name)));
  const [date, setDate] = useState(location.state?.date || dayjs().format('YYYY-MM-DD'));
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(location.state?.orderIds || null);
  const [depots, setDepots] = useState([]);
  const [depotId, setDepotId] = useState(0);
  const [returnToDepot, setReturnToDepot] = useState(true);
  const [speed, setSpeed] = useState(30);
  const [vehicles, setVehicles] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const from = dayjs(date).startOf('day').toISOString();
      const to = dayjs(date).endOf('day').toISOString();
      const response = await fetch(`/api/dispatch/orders?status=unassigned&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (response.ok) {
        const items = await response.json();
        setOrders(items);
        setSelected((current) => (current ? current.filter((id) => items.some((order) => order.id === id)) : items.map((order) => order.id)));
      }
      setPlan(null);
    })();
  }, [date]);

  useEffect(() => {
    (async () => {
      const response = await fetch('/api/dispatch/depots');
      if (response.ok) {
        const items = await response.json();
        setDepots(items);
        if (items[0]?.depot) setDepotId(items[0].id);
      }
    })();
  }, []);

  const chosen = orders.filter((order) => selected?.includes(order.id));
  const depot = depots.find((item) => item.id === depotId);
  const byId = Object.fromEntries(orders.map((order) => [order.id, order]));
  const updateVehicle = (index, changes) => setVehicles(vehicles.map((vehicle, i) => (i === index ? { ...vehicle, ...changes } : vehicle)));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/dispatch/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: chosen.map((order) => order.id),
          depotId,
          returnToDepot,
          speedKmh: Number(speed) || 30,
          vehicles: vehicles.map((vehicle) => ({
            deviceId: vehicle.deviceId,
            capacityWeight: Number(vehicle.capacityWeight) || 0,
            capacityVolume: Number(vehicle.capacityVolume) || 0,
            maxStops: Number(vehicle.maxStops) || 0,
            shiftStart: timeOnDate(date, vehicle.from),
            shiftEnd: timeOnDate(date, vehicle.to),
          })),
        }),
      });
      if (!response.ok) throw new Error((await response.text()).split('\n')[0]);
      setPlan(await response.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    const response = await fetch('/api/dispatch/plan/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plannedStart: timeOnDate(date, '08:00'),
        routes: plan.routes.map((route) => {
          const vehicle = vehicles.find((item) => item.deviceId === route.deviceId);
          return {
            ...route, name: `${t('dispatchRoute')} ${route.deviceName} ${dayjs(date).format('DD/MM')}`, driverName: vehicle?.driverName, driverPhone: vehicle?.driverPhone, depot: depot ? [depot.latitude, depot.longitude] : null,
          };
        }),
      }),
    });
    setBusy(false);
    if (response.ok) navigate('/dispatch');
    else setError((await response.text()).split('\n')[0]);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: { xs: 'column-reverse', md: 'row' } }}>
      <Paper square sx={{ width: { md: 460 }, height: { xs: '60%', md: '100%' }, overflowY: 'auto', zIndex: 2 }}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton edge="start" onClick={() => navigate('/dispatch')}><ArrowBackIcon /></IconButton>
            <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>{t('dispatchPlanner')}</Typography>
            <DispatchNav />
          </Stack>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="date" label={t('dispatchDeliveryDate')} value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField size="small" type="number" label={t('dispatchAvgSpeed')} value={speed} onChange={(event) => setSpeed(event.target.value)} slotProps={{ input: { endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }} sx={{ width: 140 }} />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" select label={t('dispatchDepot')} value={depotId} onChange={(event) => setDepotId(event.target.value)} sx={{ flex: 1 }}>
              <MenuItem value={0}>{t('dispatchDepotNone')}</MenuItem>
              {depots.map((item) => <MenuItem key={item.id} value={item.id}>{item.depot ? `★ ${item.name}` : item.name}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Switch size="small" checked={returnToDepot} disabled={!depotId} onChange={(event) => setReturnToDepot(event.target.checked)} />} label={t('dispatchReturnToDepot')} />
          </Stack>

          <Divider />
          <Typography variant="subtitle2" fontWeight={700}>{`${t('dispatchVehicles')} (${vehicles.length})`}</Typography>
          <Autocomplete
            multiple
            size="small"
            options={devices}
            getOptionLabel={(option) => option.name}
            value={devices.filter((device) => vehicles.some((vehicle) => vehicle.deviceId === device.id))}
            onChange={(_, next) => setVehicles(next.map((device) => vehicles.find((vehicle) => vehicle.deviceId === device.id) || vehicleDefaults(device)))}
            renderInput={(params) => <TextField {...params} placeholder={vehicles.length ? '' : t('dispatchChooseVehicles')} />}
          />
          {vehicles.map((vehicle, index) => (
            <Box key={vehicle.deviceId} sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${ROUTE_COLORS[index % ROUTE_COLORS.length]}` }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>{vehicle.name}</Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <TextField size="small" type="number" label={t('dispatchCapacity')} value={vehicle.capacityWeight} onChange={(event) => updateVehicle(index, { capacityWeight: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">kg</InputAdornment> } }} />
                <TextField size="small" type="number" label={t('dispatchVolume')} value={vehicle.capacityVolume} onChange={(event) => updateVehicle(index, { capacityVolume: event.target.value })} slotProps={{ input: { endAdornment: <InputAdornment position="end">m³</InputAdornment> } }} />
                <TextField size="small" type="number" label={t('dispatchMaxStops')} value={vehicle.maxStops} onChange={(event) => updateVehicle(index, { maxStops: event.target.value })} />
                <TextField size="small" type="time" label={t('dispatchShiftStart')} value={vehicle.from} onChange={(event) => updateVehicle(index, { from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="time" label={t('dispatchShiftEnd')} value={vehicle.to} onChange={(event) => updateVehicle(index, { to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" label={t('dispatchDriver')} value={vehicle.driverName} onChange={(event) => updateVehicle(index, { driverName: event.target.value })} />
              </Box>
            </Box>
          ))}

          <Divider />
          <Stack direction="row" alignItems="center">
            <Typography variant="subtitle2" fontWeight={700} sx={{ flexGrow: 1 }}>{`${t('dispatchOrders')} (${chosen.length}/${orders.length})`}</Typography>
            <Button size="small" onClick={() => setSelected(chosen.length === orders.length ? [] : orders.map((order) => order.id))}>{chosen.length === orders.length ? t('geofenceImportNone') : t('geofenceImportAll')}</Button>
          </Stack>
          <Box sx={{ maxHeight: 220, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            {orders.map((order) => (
              <Stack key={order.id} direction="row" alignItems="center" sx={{ px: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Checkbox size="small" checked={!!selected?.includes(order.id)} onChange={(event) => setSelected(event.target.checked ? [...(selected || []), order.id] : selected.filter((id) => id !== order.id))} />
                <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>{`${order.code ? `${order.code} · ` : ''}${order.name}`}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>{order.weight ? `${order.weight} kg` : ''}</Typography>
              </Stack>
            ))}
            {!orders.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{t('dispatchNoOrders')}</Typography>}
          </Box>
          <Button variant="contained" size="large" startIcon={<AutoAwesomeIcon />} disabled={busy || !vehicles.length || !chosen.length} onClick={run}>{t('dispatchRunPlanner')}</Button>
          {busy && <LinearProgress />}

          {plan && (
            <>
              <Divider />
              {plan.routes.map((route) => (
                <Box key={route.deviceId} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', borderLeft: `4px solid ${ROUTE_COLORS[vehicles.findIndex((vehicle) => vehicle.deviceId === route.deviceId) % ROUTE_COLORS.length]}` }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" fontWeight={700} sx={{ flexGrow: 1 }}>{route.deviceName}</Typography>
                    <Chip size="small" label={`${route.orderIds.length} ${t('dispatchStopsLower')}`} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {`${route.distanceKm} km · ${formatHour(route.start)}–${formatHour(route.end)} · ${Math.round(route.weight)} kg`}
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                    {route.visits.map((visit, position) => `${position + 1}. ${byId[visit.orderId]?.name || ''} ${formatHour(visit.start)}`).join(' → ')}
                  </Typography>
                </Box>
              ))}
              {plan.unassigned.length > 0 && (
                <Alert severity="warning">
                  <Typography variant="body2" fontWeight={700}>{t('dispatchUnplanned').replace('{0}', plan.unassigned.length)}</Typography>
                  {plan.unassigned.map((item) => <Typography key={item.orderId} variant="caption" component="div">{`${byId[item.orderId]?.name}: ${reasonLabel(t, item.reason)}`}</Typography>)}
                </Alert>
              )}
              <Button variant="contained" color="success" size="large" startIcon={<CheckIcon />} disabled={busy || !plan.routes.length} onClick={commit}>
                {t('dispatchCreateTrips').replace('{0}', plan.routes.length)}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
      <Box sx={{ flexGrow: 1, position: 'relative', height: { xs: '40%', md: '100%' } }}>
        <MapView>
          <PlannerMap orders={chosen} routes={plan?.routes || []} depot={depot} colors={plan ? plan.routes.map((route) => ROUTE_COLORS[vehicles.findIndex((vehicle) => vehicle.deviceId === route.deviceId) % ROUTE_COLORS.length]) : ROUTE_COLORS} />
        </MapView>
        <MapScale />
      </Box>
    </Box>
  );
};

export default PlannerPage;
