// Unit sensors (WOX / GPS-Server style) and unit information (Wialon style), stored as device attributes:
// "sensors" holds a JSON array the server reads to compute values ("sensor.<id>" in each position) and to detect
// fuel fills and drains; "info.*" holds the vehicle and SIM data.

export const SENSORS_ATTRIBUTE = 'sensors';
export const INFO_PREFIX = 'info.';

// Sensor types, Wialon style, by group. digital: read as on / off; text: driver or trailer code; accumulate: how the
// server adds each message to the total (increment, positive difference of a counter, time while on)
export const SENSOR_TYPES = {
  mileage: { group: 'mileage', unit: 'km', decimals: 1 },
  mileageRelative: { group: 'mileage', unit: 'km', decimals: 1, accumulate: 'increment' },
  ignition: { group: 'digital', digital: true },
  binary: { group: 'digital', digital: true },
  panic: { group: 'digital', digital: true },
  door: { group: 'digital', digital: true },
  seatbelt: { group: 'digital', digital: true },
  pto: { group: 'digital', digital: true },
  privateMode: { group: 'digital', digital: true },
  motion: { group: 'digital', digital: true },
  engineHours: { group: 'engine', unit: 'h', decimals: 1 },
  engineHoursRelative: { group: 'engine', unit: 'h', decimals: 1, accumulate: 'time' },
  rpm: { group: 'engine', unit: 'rpm', decimals: 0 },
  engineEfficiency: { group: 'engine', digital: true, threshold: true },
  fuel: { group: 'fuel', unit: 'L', decimals: 1 },
  fuelImpulse: { group: 'fuel', unit: 'L', decimals: 1, accumulate: 'delta' },
  fuelAbsolute: { group: 'fuel', unit: 'L', decimals: 1 },
  fuelInstant: { group: 'fuel', unit: 'L/h', decimals: 1 },
  fuelCalculated: { group: 'fuel', unit: 'L', decimals: 1, calculated: true },
  temperature: { group: 'gauges', unit: '°C', decimals: 1 },
  voltage: { group: 'gauges', unit: 'V', decimals: 2 },
  weight: { group: 'gauges', unit: 'kg', decimals: 0 },
  accelerometer: { group: 'gauges', unit: 'g', decimals: 2 },
  tirePressure: { group: 'gauges', unit: 'bar', decimals: 1 },
  humidity: { group: 'gauges', unit: '%', decimals: 0 },
  counter: { group: 'gauges', unit: '', decimals: 0, accumulate: 'increment' },
  numeric: { group: 'gauges', unit: '', decimals: 2 },
  driver: { group: 'binding', text: true },
  trailer: { group: 'binding', text: true },
  passengers: { group: 'binding', unit: '', decimals: 0 },
};

export const SENSOR_GROUPS = ['mileage', 'digital', 'engine', 'fuel', 'gauges', 'binding'];

export const VALIDATIONS = ['nonZero', 'and', 'or', 'sum', 'subtract', 'multiply', 'divide', 'replace'];

const sensor = (name, type, extra) => ({
  id: Math.random().toString(36).slice(2, 8), name, type, source: '', unit: SENSOR_TYPES[type].unit || '', multiplier: 1, offset: 0, calibration: [], ...extra,
});

// ready-made sensor sets by device model: the usual parameters of each protocol
export const SENSOR_TEMPLATES = [
  {
    key: 'teltonika',
    sensors: () => [
      sensor('Ignición', 'ignition', { source: 'io239' }),
      sensor('Movimiento', 'motion', { source: 'io240' }),
      sensor('Voltaje externo', 'voltage', { source: 'io66', multiplier: 0.001 }),
      sensor('Batería interna', 'voltage', { source: 'io67', multiplier: 0.001 }),
      sensor('Odómetro', 'mileage', { source: 'io16', multiplier: 0.001 }),
      sensor('Horas de motor', 'engineHours', { source: 'io449', multiplier: 1 / 3600 }),
      sensor('Combustible CAN', 'fuelAbsolute', { source: 'io89', unit: '%' }),
      sensor('RPM', 'rpm', { source: 'io85' }),
      sensor('Conductor (iButton)', 'driver', { source: 'io78' }),
    ],
  },
  {
    key: 'concox',
    sensors: () => [
      sensor('Ignición', 'ignition', { source: 'ignition' }),
      sensor('Voltaje externo', 'voltage', { source: 'power' }),
      sensor('Nivel de batería', 'numeric', { source: 'batteryLevel', unit: '%' }),
      sensor('Corte de motor', 'binary', { source: 'blocked', onLabel: 'Cortado', offLabel: 'Normal' }),
    ],
  },
  {
    key: 'queclink',
    sensors: () => [
      sensor('Ignición', 'ignition', { source: 'ignition' }),
      sensor('Voltaje externo', 'voltage', { source: 'power' }),
      sensor('Odómetro', 'mileage', { source: 'odometer', multiplier: 0.001 }),
      sensor('Horas de motor', 'engineHours', { source: 'hours', multiplier: 1 / 3600000 }),
      sensor('Entrada 1', 'binary', { source: 'in1' }),
    ],
  },
  {
    key: 'can',
    sensors: () => [
      sensor('RPM', 'rpm', { source: 'rpm' }),
      sensor('Combustible CAN', 'fuelAbsolute', { source: 'fuelUsed' }),
      sensor('Consumo instantáneo', 'fuelInstant', { source: 'fuelConsumption' }),
      sensor('Temperatura de motor', 'temperature', { source: 'coolantTemp' }),
      sensor('Eficiencia del motor', 'engineEfficiency', { source: 'rpm', threshold: 600 }),
      sensor('Peso por eje', 'weight', { source: 'axleWeight' }),
    ],
  },
  {
    key: 'coldChain',
    sensors: () => [
      sensor('Temperatura cámara', 'temperature', { source: 'temp1', ranges: [{ from: -50, to: 2, color: '#1565c0' }, { from: 2, to: 8, color: '#2e7d32' }, { from: 8, to: 99, color: '#c62828' }] }),
      sensor('Humedad', 'humidity', { source: 'humidity' }),
      sensor('Puerta de carga', 'door', { source: 'in2', onLabel: 'Abierta', offLabel: 'Cerrada' }),
    ],
  },
  {
    key: 'calculatedFuel',
    sensors: () => [
      sensor('Consumo calculado', 'fuelCalculated', { rate: 30, idleRate: 2, speedThreshold: 5 }),
    ],
  },
];

export const FUEL_DEFAULTS = {
  tankCapacity: 0,
  minFill: 10,
  minDrain: 10,
  waitTime: 120,
  filter: 5,
  stoppedOnly: true,
  speedThreshold: 5,
};

export const newSensor = (type = 'fuel') => ({
  id: Math.random().toString(36).slice(2, 8),
  name: '',
  type,
  source: '',
  ...(SENSOR_TYPES[type]?.accumulate ? { accumulate: SENSOR_TYPES[type].accumulate } : {}),
  unit: SENSOR_TYPES[type].unit,
  multiplier: 1,
  offset: 0,
  calibration: [],
  ...(type === 'fuel' ? FUEL_DEFAULTS : {}),
});

export const parseSensors = (device) => {
  try {
    const sensors = JSON.parse(device?.attributes?.[SENSORS_ATTRIBUTE] || '[]');
    return Array.isArray(sensors) ? sensors : [];
  } catch {
    return [];
  }
};

export const withSensors = (device, sensors) => {
  const attributes = { ...device.attributes };
  if (sensors.length) {
    attributes[SENSORS_ATTRIBUTE] = JSON.stringify(sensors);
  } else {
    delete attributes[SENSORS_ATTRIBUTE];
  }
  return { ...device, attributes };
};

export const fuelSensors = (device) => parseSensors(device).filter((sensor) => sensor.type === 'fuel');

export const isHiddenAttribute = (key) => key === SENSORS_ATTRIBUTE || key.startsWith(INFO_PREFIX) || key.startsWith('dashcam.') || key.startsWith('fuel.');

// same conversion as the server, for the live preview in the editor
export const convertRaw = (sensor, raw) => {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    return null;
  }
  const value = typeof raw === 'boolean' ? Number(raw) : Number(raw);
  if (SENSOR_TYPES[sensor.type]?.digital) {
    return (value !== 0) !== Boolean(sensor.invert) ? 1 : 0;
  }
  const points = (sensor.calibration || [])
    .filter((point) => point && point.length >= 2 && point.every((item) => item !== '' && !Number.isNaN(Number(item))))
    .map(([x, y]) => [Number(x), Number(y)])
    .sort((a, b) => a[0] - b[0]);
  if (points.length >= 2) {
    if (value <= points[0][0]) {
      return points[0][1];
    }
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (value <= x1) {
        return x1 === x0 ? y1 : y0 + ((value - x0) * (y1 - y0)) / (x1 - x0);
      }
    }
    return points[points.length - 1][1];
  }
  return value * Number(sensor.multiplier ?? 1) + Number(sensor.offset ?? 0);
};

export const formatSensorValue = (sensor, value, t) => {
  if (value === null || value === undefined) {
    return '—';
  }
  const meta = SENSOR_TYPES[sensor.type] || {};
  if (meta.digital) {
    return Number(value) ? (sensor.onLabel || t('sensorOn')) : (sensor.offLabel || t('sensorOff'));
  }
  if (meta.text || Number.isNaN(Number(value))) {
    return String(value);
  }
  const range = (sensor.ranges || []).find((item) => Number(value) >= Number(item.from) && Number(value) < Number(item.to));
  if (range?.text) {
    return range.text;
  }
  const decimals = meta.decimals ?? 2;
  return `${Number(value).toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${sensor.unit ? ` ${sensor.unit}` : ''}`;
};

// color of a value from the sensor's ranges (e.g. blue below 2 °C, green 2–8, red above)
export const sensorColor = (sensor, value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (SENSOR_TYPES[sensor.type]?.digital) {
    return Number(value) ? (sensor.onColor || '#2e7d32') : (sensor.offColor || null);
  }
  return (sensor.ranges || []).find((item) => Number(value) >= Number(item.from) && Number(value) < Number(item.to))?.color || null;
};

export const sensorValue = (sensor, position) => position?.attributes?.[`sensor.${sensor.id}`];

// Wialon "Características" / profile fields; phone (SIM number) and model are device fields
export const UNIT_INFO_FIELDS = [
  { key: 'plate', section: 'vehicle' },
  { key: 'fleetNumber', section: 'vehicle' },
  { key: 'vin', section: 'vehicle' },
  { key: 'brand', section: 'vehicle' },
  { key: 'vehicleModel', section: 'vehicle' },
  { key: 'year', section: 'vehicle', type: 'number' },
  { key: 'color', section: 'vehicle' },
  { key: 'vehicleType', section: 'vehicle' },
  { key: 'engineNumber', section: 'vehicle' },
  { key: 'fuelType', section: 'vehicle' },
  { key: 'tankCapacity', section: 'vehicle', type: 'number' },
  { key: 'fuelRate', section: 'vehicle', type: 'number' },
  { key: 'iccid', section: 'sim' },
  { key: 'simOperator', section: 'sim' },
  { key: 'installDate', section: 'installation', type: 'date' },
  { key: 'installer', section: 'installation' },
  { key: 'insurance', section: 'installation' },
  { key: 'notes', section: 'installation', multiline: true },
];

export const infoLabelKey = (key) => `unitInfo${key.charAt(0).toUpperCase()}${key.slice(1)}`;
