// Unit sensors (WOX / GPS-Server style) and unit information (Wialon style), stored as device attributes:
// "sensors" holds a JSON array the server reads to compute values ("sensor.<id>" in each position) and to detect
// fuel fills and drains; "info.*" holds the vehicle and SIM data.

export const SENSORS_ATTRIBUTE = 'sensors';
export const INFO_PREFIX = 'info.';

export const SENSOR_TYPES = {
  fuel: { unit: 'L', decimals: 1 },
  temperature: { unit: '°C', decimals: 1 },
  voltage: { unit: 'V', decimals: 2 },
  binary: { unit: '', decimals: 0 },
  numeric: { unit: '', decimals: 2 },
};

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

export const isHiddenAttribute = (key) => key === SENSORS_ATTRIBUTE || key.startsWith(INFO_PREFIX) || key.startsWith('dashcam.');

// same conversion as the server, for the live preview in the editor
export const convertRaw = (sensor, raw) => {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) {
    return null;
  }
  const value = typeof raw === 'boolean' ? Number(raw) : Number(raw);
  if (sensor.type === 'binary') {
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
  if (sensor.type === 'binary') {
    return value ? (sensor.onLabel || t('sensorOn')) : (sensor.offLabel || t('sensorOff'));
  }
  const decimals = SENSOR_TYPES[sensor.type]?.decimals ?? 2;
  return `${Number(value).toFixed(decimals)}${sensor.unit ? ` ${sensor.unit}` : ''}`;
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
