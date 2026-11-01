import { SENSOR_TYPES } from './sensors';

// Fuel volume unit of each vehicle (device attribute "fuelUnit"): liters or US gallons. Sensors, tank capacity and
// fuel expenses of the vehicle are in its unit; fleet totals follow the user's volume preference.
export const LITERS_PER_GALLON = 3.785411784;
export const FUEL_UNITS = ['L', 'gal'];

export const normalizeFuelUnit = (unit) => (String(unit || '').toLowerCase().startsWith('gal') || unit === 'usGal' ? 'gal' : 'L');
export const deviceFuelUnit = (device) => normalizeFuelUnit(device?.attributes?.fuelUnit);
export const isFuelSensor = (sensor) => SENSOR_TYPES[sensor?.type]?.group === 'fuel';
const liters = (unit) => (normalizeFuelUnit(unit) === 'gal' ? LITERS_PER_GALLON : 1);

export const convertVolume = (value, from, to) => (value === null || value === undefined || value === '' ? value : (Number(value) * liters(from)) / liters(to));

// a fuel sensor re-expressed in another unit: calibration outputs (or multiplier and offset), tank capacity, fill and
// drain thresholds, bounds and consumption rates, so the readings stay the same quantity of fuel
export const convertFuelSensor = (sensor, to) => {
  const from = normalizeFuelUnit(sensor.unit);
  if (from === normalizeFuelUnit(to)) return { ...sensor, unit: normalizeFuelUnit(to) };
  const scale = (value) => (value === null || value === undefined || value === '' ? value : Math.round(convertVolume(value, from, to) * 10000) / 10000);
  const calibrated = (sensor.calibration || []).filter((point) => point && point.length >= 2).length >= 2;
  const result = {
    ...sensor,
    unit: normalizeFuelUnit(to),
    calibration: calibrated ? sensor.calibration.map(([x, y]) => [x, scale(y)]) : sensor.calibration,
  };
  if (!calibrated) {
    result.multiplier = scale(sensor.multiplier ?? 1);
    result.offset = scale(sensor.offset ?? 0);
  }
  ['tankCapacity', 'minFill', 'minDrain', 'threshold', 'lowerBound', 'upperBound', 'rate', 'idleRate'].forEach((key) => {
    if (key in sensor) result[key] = scale(sensor[key]);
  });
  return result;
};

export const fuelUnitLabel = (unit, t) => t(normalizeFuelUnit(unit) === 'gal' ? 'fuelUnitGallons' : 'fuelUnitLiters');
