import dayjs from 'dayjs';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { formatPeriod } from '../main/DeviceRow';
import { alertTitle } from './alertUtils';

// Data sources of the configurable reports: how to fetch them and the columns each one offers.
// value(row, ctx) returns the raw value; format turns it into text; agg says how it adds up in groups and totals.

const json = { headers: { Accept: 'application/json' } };

const traccarReport = (path) => async ({ deviceIds, from, to, extra = '' }) => {
  const query = new URLSearchParams({ from, to });
  deviceIds.forEach((id) => query.append('deviceId', id));
  return (await fetchOrThrow(`/api/reports/${path}?${query}${extra}`, json)).json();
};

export const EVENT_TYPES = [
  'alarm', 'deviceOverspeed', 'geofenceEnter', 'geofenceExit', 'ignitionOn', 'ignitionOff', 'deviceFuelDrop',
  'deviceFuelIncrease', 'maintenance', 'driverChanged', 'deviceOnline', 'deviceOffline', 'deviceInactive', 'media',
  'commandResult',
];

export const SOURCES = {
  summary: {
    fetch: traccarReport('summary'),
    groups: ['device', 'day'],
    columns: [
      { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
      { key: 'startTime', label: 'reportStartTime', value: (row) => row.startTime, format: 'datetime' },
      { key: 'endTime', label: 'reportEndTime', value: (row) => row.endTime, format: 'datetime' },
      { key: 'distance', label: 'sharedDistance', value: (row) => row.distance, format: 'distance', agg: 'sum', default: true },
      { key: 'averageSpeed', label: 'reportAverageSpeed', value: (row) => row.averageSpeed, format: 'speed', agg: 'avg', default: true },
      { key: 'maxSpeed', label: 'reportMaximumSpeed', value: (row) => row.maxSpeed, format: 'speed', agg: 'max', default: true },
      { key: 'engineHours', label: 'reportEngineHours', value: (row) => row.engineHours, format: 'duration', agg: 'sum', default: true },
      { key: 'spentFuel', label: 'reportSpentFuel', value: (row) => row.spentFuel, format: 'number', agg: 'sum' },
      { key: 'startOdometer', label: 'reportStartOdometer', value: (row) => row.startOdometer, format: 'distance', agg: 'min' },
      { key: 'endOdometer', label: 'reportEndOdometer', value: (row) => row.endOdometer, format: 'distance', agg: 'max' },
    ],
  },
  trips: {
    fetch: traccarReport('trips'),
    groups: ['device', 'day', 'driver'],
    filters: ['minDistance'],
    columns: [
      { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
      { key: 'startTime', label: 'reportStartTime', value: (row) => row.startTime, format: 'datetime', default: true },
      { key: 'endTime', label: 'reportEndTime', value: (row) => row.endTime, format: 'datetime', default: true },
      { key: 'duration', label: 'reportDuration', value: (row) => row.duration, format: 'duration', agg: 'sum', default: true },
      { key: 'distance', label: 'sharedDistance', value: (row) => row.distance, format: 'distance', agg: 'sum', default: true },
      { key: 'averageSpeed', label: 'reportAverageSpeed', value: (row) => row.averageSpeed, format: 'speed', agg: 'avg' },
      // reports longer than a day use Traccar's fast mode, which does not compute the trip maximum (0)
      { key: 'maxSpeed', label: 'reportMaximumSpeed', value: (row) => row.maxSpeed || null, format: 'speed', agg: 'max', default: true },
      { key: 'startAddress', label: 'reportStartAddress', value: (row) => row.startAddress },
      { key: 'endAddress', label: 'reportEndAddress', value: (row) => row.endAddress },
      { key: 'driverName', label: 'sharedDriver', value: (row) => row.driverName },
      { key: 'spentFuel', label: 'reportSpentFuel', value: (row) => row.spentFuel, format: 'number', agg: 'sum' },
    ],
  },
  stops: {
    fetch: traccarReport('stops'),
    groups: ['device', 'day'],
    filters: ['minDuration'],
    columns: [
      { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
      { key: 'startTime', label: 'reportStartTime', value: (row) => row.startTime, format: 'datetime', default: true },
      { key: 'endTime', label: 'reportEndTime', value: (row) => row.endTime, format: 'datetime', default: true },
      { key: 'duration', label: 'reportDuration', value: (row) => row.duration, format: 'duration', agg: 'sum', default: true },
      { key: 'address', label: 'positionAddress', value: (row) => row.address, default: true },
      { key: 'engineHours', label: 'reportEngineHours', value: (row) => row.engineHours, format: 'duration', agg: 'sum' },
      { key: 'spentFuel', label: 'reportSpentFuel', value: (row) => row.spentFuel, format: 'number', agg: 'sum' },
    ],
  },
  events: {
    fetch: async (params) => {
      const types = params.filters.eventTypes?.length ? params.filters.eventTypes : ['allEvents'];
      return traccarReport('events')({ ...params, extra: types.map((type) => `&type=${type}`).join('') });
    },
    groups: ['device', 'day', 'type'],
    filters: ['eventTypes'],
    columns: [
      { key: 'deviceName', label: 'reportDevice', value: (row, ctx) => ctx.devices[row.deviceId]?.name, default: true },
      { key: 'eventTime', label: 'positionFixTime', value: (row) => row.eventTime, format: 'datetime', default: true },
      { key: 'type', label: 'sharedType', value: (row, ctx) => alertTitle(row, ctx.t), default: true },
      { key: 'geofence', label: 'sharedGeofence', value: (row, ctx) => ctx.geofences[row.geofenceId]?.name },
      { key: 'speed', label: 'positionSpeed', value: (row) => row.attributes?.speed, format: 'speed', agg: 'max' },
    ],
  },
  driving: {
    fetch: async ({ deviceIds, from, to }) => {
      const query = new URLSearchParams({ from, to });
      deviceIds.forEach((id) => query.append('deviceId', id));
      return (await (await fetchOrThrow(`/api/driving/score?${query}`)).json()).devices;
    },
    groups: [],
    columns: [
      { key: 'name', label: 'reportDevice', value: (row) => row.name, default: true },
      { key: 'score', label: 'drivingScore', value: (row) => row.score, format: 'number', agg: 'avg', default: true },
      { key: 'rating', label: 'reportRating', value: (row, ctx) => ctx.t(`drivingRating${row.rating.charAt(0).toUpperCase()}${row.rating.slice(1)}`), default: true },
      { key: 'distance', label: 'sharedDistance', value: (row) => row.distance * 1000, format: 'distance', agg: 'sum', default: true },
      { key: 'drivingTime', label: 'drivingTime', value: (row) => row.drivingTime, format: 'duration', agg: 'sum' },
      { key: 'braking', label: 'drivingBraking', value: (row) => row.counts.braking, format: 'number', agg: 'sum', default: true },
      { key: 'acceleration', label: 'drivingAcceleration', value: (row) => row.counts.acceleration, format: 'number', agg: 'sum', default: true },
      { key: 'cornering', label: 'drivingCornering', value: (row) => row.counts.cornering, format: 'number', agg: 'sum', default: true },
      { key: 'speeding', label: 'drivingSpeeding', value: (row) => row.counts.speeding, format: 'number', agg: 'sum', default: true },
      { key: 'maxSpeed', label: 'drivingMaxSpeed', value: (row) => row.maxSpeed / 1.852, format: 'speed', agg: 'max' },
    ],
  },
  expenses: {
    fetch: async ({ deviceIds, from, to }) => {
      const query = new URLSearchParams({ from, to });
      deviceIds.forEach((id) => query.append('deviceId', id));
      return (await fetchOrThrow(`/api/expenses?${query}`)).json();
    },
    groups: ['device', 'day', 'type'],
    columns: [
      { key: 'expenseTime', label: 'expenseDate', value: (row) => row.expenseTime, format: 'date', default: true },
      { key: 'deviceName', label: 'reportDevice', value: (row, ctx) => ctx.devices[row.deviceId]?.name, default: true },
      { key: 'type', label: 'sharedType', value: (row, ctx) => ctx.t(`expenseType${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}`), default: true },
      { key: 'amount', label: 'expenseAmount', value: (row) => row.amount, format: 'money', agg: 'sum', default: true },
      { key: 'quantity', label: 'expenseQuantity', value: (row) => row.quantity, format: 'number', agg: 'sum' },
      { key: 'vendor', label: 'expenseVendor', value: (row) => row.vendor, default: true },
      { key: 'reference', label: 'expenseReference', value: (row) => row.reference },
      { key: 'description', label: 'sharedDescription', value: (row) => row.description },
    ],
  },
  quality: {
    fetch: async ({ deviceIds, from, to }) => {
      const query = new URLSearchParams({ from, to });
      deviceIds.forEach((id) => query.append('deviceId', id));
      return (await fetchOrThrow(`/api/quality?${query}`)).json();
    },
    groups: [],
    maxDays: 31,
    columns: [
      { key: 'name', label: 'reportDevice', value: (row) => row.name, default: true },
      { key: 'score', label: 'qualityScore', value: (row) => row.score, format: 'number', agg: 'avg', default: true },
      { key: 'coverage', label: 'qualityCoverage', value: (row) => row.coverage, format: 'percent', agg: 'avg', default: true },
      { key: 'validity', label: 'qualityValidity', value: (row) => row.validity, format: 'percent', agg: 'avg', default: true },
      { key: 'reports', label: 'qualityReports', value: (row) => row.reports, format: 'number', agg: 'sum' },
      { key: 'reconnections', label: 'qualityReconnections', value: (row) => row.reconnections, format: 'number', agg: 'sum', default: true },
      { key: 'gapCount', label: 'qualityGaps', value: (row) => row.gapCount, format: 'number', agg: 'sum', default: true },
      { key: 'issues', label: 'qualityIssues', value: (row, ctx) => (row.issues || []).map((issue) => ctx.t(`qualityIssue${issue.charAt(0).toUpperCase()}${issue.slice(1)}`)).join(', '), default: true },
    ],
  },
  maintenance: {
    fetch: async ({ deviceIds }) => {
      const query = new URLSearchParams();
      deviceIds.forEach((id) => query.append('deviceId', id));
      return (await (await fetchOrThrow(`/api/maintenance-plans/status?${query}`)).json()).items;
    },
    groups: ['device'],
    noPeriod: true,
    columns: [
      { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
      { key: 'name', label: 'maintenancePlan', value: (row) => row.name, default: true },
      { key: 'state', label: 'maintenanceState', value: (row, ctx) => ctx.t(`maintenanceState${row.state.charAt(0).toUpperCase()}${row.state.slice(1)}`), default: true },
      { key: 'progress', label: 'maintenanceProgress', value: (row) => row.progress * 100, format: 'percent', agg: 'avg', default: true },
      { key: 'estimatedDate', label: 'maintenanceEstimated', value: (row) => row.estimatedDate, format: 'date', default: true },
      { key: 'lastServiceTime', label: 'maintenanceLastService', value: (row) => row.lastServiceTime, format: 'date' },
      { key: 'lastServiceCost', label: 'expenseAmount', value: (row) => row.lastServiceCost, format: 'money', agg: 'sum' },
    ],
  },
};

// sensor statistics of every unit, one row per unit and sensor
const sensorRows = async ({ deviceIds, from, to }) => {
  const query = new URLSearchParams({ from, to });
  deviceIds.forEach((id) => query.append('deviceId', id));
  const report = await (await fetchOrThrow(`/api/sensors/report?${query}`)).json();
  return report.devices.flatMap((device) => device.sensors.map((sensor) => ({ ...sensor, deviceId: device.deviceId, deviceName: device.deviceName })));
};

// digital sensors are summed up by time on and activations instead of numbers
const withUnit = (value, row) => (value === undefined || value === null || row.onTime !== undefined ? null : `${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 2 })}${row.unit ? ` ${row.unit}` : ''}`);

SOURCES.sensors = {
  fetch: sensorRows,
  groups: ['device'],
  columns: [
    { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
    { key: 'name', label: 'sharedName', value: (row) => row.name, default: true },
    { key: 'type', label: 'sensorType', value: (row, ctx) => ctx.t(`sensorType${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}`) },
    { key: 'min', label: 'opsMin', value: (row) => withUnit(row.min, row), default: true },
    { key: 'average', label: 'opsAverage', value: (row) => withUnit(row.average, row), default: true },
    { key: 'max', label: 'opsMax', value: (row) => withUnit(row.max, row), default: true },
    { key: 'last', label: 'opsLast', value: (row) => (typeof row.last === 'string' ? row.last : withUnit(row.last, row)) },
    { key: 'total', label: 'opsPeriodTotal', value: (row) => withUnit(row.total, row), default: true },
    { key: 'onTime', label: 'opsOnTime', value: (row) => row.onTime, format: 'duration', agg: 'sum', default: true },
    { key: 'activations', label: 'opsActivations', value: (row) => row.activations, format: 'number', agg: 'sum', default: true },
    { key: 'count', label: 'opsReadings', value: (row) => row.count, format: 'number', agg: 'sum' },
  ],
};

SOURCES.customAlerts = {
  fetch: async ({ deviceIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((id) => query.append('deviceId', id));
    return (await (await fetchOrThrow(`/api/alert-rules/report?${query}`)).json()).items;
  },
  groups: ['device', 'day', 'rule'],
  columns: [
    { key: 'eventTime', label: 'positionFixTime', value: (row) => row.eventTime, format: 'datetime', default: true },
    { key: 'ruleName', label: 'ruleTitleColumn', value: (row) => row.ruleName, default: true },
    { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
    { key: 'severity', label: 'rulePriority', value: (row, ctx) => ctx.t(`alertSeverity${(row.severity || 'medium').charAt(0).toUpperCase()}${(row.severity || 'medium').slice(1)}`), default: true },
    { key: 'message', label: 'ruleMessage', value: (row) => row.message, default: true },
    { key: 'value', label: 'opsValue', value: (row) => row.value },
    { key: 'status', label: 'alertStatusTitle', value: (row, ctx) => ctx.t(`alertStatus${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`) },
    { key: 'count', label: 'opsTotalAlerts', value: () => 1, format: 'number', agg: 'sum' },
  ],
};

const LEVEL_KEY = (level) => `geofenceLevel${level.charAt(0).toUpperCase()}${level.slice(1)}`;

SOURCES.geofenceSpeed = {
  fetch: async ({ deviceIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((id) => query.append('deviceId', id));
    // like the report, episodes within tolerance are not counted as speeding
    return (await (await fetchOrThrow(`/api/geofence-speed/report?${query}`)).json()).episodes.filter((episode) => episode.level !== 'tolerance');
  },
  groups: ['device', 'day', 'geofence', 'level'],
  columns: [
    { key: 'start', label: 'reportStartTime', value: (row) => row.start, format: 'datetime', default: true },
    { key: 'deviceName', label: 'reportDevice', value: (row) => row.deviceName, default: true },
    { key: 'geofenceName', label: 'sharedGeofence', value: (row) => row.geofenceName, default: true },
    { key: 'speedLimit', label: 'geofenceSpeedLimit', value: (row) => `${row.speedLimit} km/h`, default: true },
    { key: 'maxSpeed', label: 'reportMaximumSpeed', value: (row) => `${row.maxSpeed} km/h`, default: true },
    { key: 'maxExcess', label: 'geofenceExcess', value: (row) => row.maxExcess, format: 'number', agg: 'max', default: true },
    { key: 'level', label: 'geofenceLevel', value: (row, ctx) => ctx.t(LEVEL_KEY(row.level)), default: true },
    { key: 'duration', label: 'reportDuration', value: (row) => row.duration, format: 'duration', agg: 'sum' },
    { key: 'mild', label: 'geofenceLevelMild', value: (row) => (row.level === 'mild' ? 1 : 0), format: 'number', agg: 'sum' },
    { key: 'danger', label: 'geofenceLevelDanger', value: (row) => (row.level === 'danger' ? 1 : 0), format: 'number', agg: 'sum' },
    { key: 'critical', label: 'geofenceLevelCritical', value: (row) => (row.level === 'critical' ? 1 : 0), format: 'number', agg: 'sum' },
    { key: 'count', label: 'geofencePoints', value: (row) => row.count, format: 'number', agg: 'sum' },
  ],
};

export const formatValue = (value, format, ctx) => {
  if (value === null || value === undefined || value === '') return '';
  switch (format) {
    case 'datetime': return dayjs(value).format('DD/MM/YYYY HH:mm');
    case 'date': return dayjs(value).format('DD/MM/YYYY');
    case 'distance': return `${(value / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`;
    case 'speed': return `${Math.round(value * 1.852)} km/h`;
    case 'duration': return formatPeriod(value);
    case 'money': return `${ctx.currency} ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent': return `${Math.round(value)} %`;
    case 'number': return Number(value).toLocaleString('es-PE', { maximumFractionDigits: 1 });
    default: return String(value);
  }
};

const aggregate = (values, agg) => {
  const numbers = values.filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (!numbers.length) return null;
  switch (agg) {
    case 'sum': return numbers.reduce((a, b) => a + b, 0);
    case 'avg': return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'max': return Math.max(...numbers);
    case 'min': return Math.min(...numbers);
    default: return null;
  }
};

// Builds the table: raw values per column, optional grouping (with count), sorting and totals
export const buildTable = (rows, source, config, ctx) => {
  const columns = config.columns.map((key) => source.columns.find((column) => column.key === key)).filter(Boolean);
  let data = rows.map((row) => ({ raw: row, values: Object.fromEntries(columns.map((column) => [column.key, column.value(row, ctx)])) }));
  let shown = columns;
  if (config.groupBy && config.groupBy !== 'none') {
    const keyOf = (item) => {
      const row = item.raw;
      switch (config.groupBy) {
        case 'device': return ctx.devices[row.deviceId]?.name || row.deviceName || row.name || '—';
        case 'day': return dayjs(row.startTime || row.eventTime || row.expenseTime || row.start).format('YYYY-MM-DD');
        case 'driver': return row.driverName || '—';
        case 'type': return item.values.type || row.type || '—';
        case 'rule': return row.ruleName || '—';
        case 'geofence': return row.geofenceName || '—';
        case 'level': return ctx.t(LEVEL_KEY(row.level || 'mild'));
        default: return '—';
      }
    };
    const groups = new Map();
    data.forEach((item) => {
      const key = keyOf(item);
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    const numeric = columns.filter((column) => column.agg);
    shown = [
      { key: 'group', label: `reportGroupBy${config.groupBy.charAt(0).toUpperCase()}${config.groupBy.slice(1)}` },
      { key: 'count', label: 'reportCount', format: 'number', agg: 'sum' },
      ...numeric,
    ];
    data = [...groups.entries()].map(([key, items]) => ({
      values: {
        group: key,
        count: items.length,
        ...Object.fromEntries(numeric.map((column) => [column.key, aggregate(items.map((item) => item.values[column.key]), column.agg)])),
      },
    }));
  }
  if (config.sortBy && shown.some((column) => column.key === config.sortBy)) {
    const direction = config.sortDesc ? -1 : 1;
    data.sort((a, b) => {
      const [x, y] = [a.values[config.sortBy], b.values[config.sortBy]];
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'number') return (x - y) * direction;
      return String(x).localeCompare(String(y)) * direction;
    });
  }
  const totals = config.totals ? Object.fromEntries(shown.map((column) => [
    column.key, column.agg ? aggregate(data.map((item) => item.values[column.key]), column.agg === 'avg' ? 'avg' : column.agg) : null,
  ])) : null;
  return { columns: shown, data, totals };
};
