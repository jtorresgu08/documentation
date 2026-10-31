// Kinds of custom alerts (Wialon style), the events an "event" rule can listen to and ready-made rules

export const RULE_TYPES = [
  'speed', 'sensor', 'parameter', 'digital', 'geofence', 'idle', 'stop', 'connection', 'gps', 'fuel', 'event', 'driver', 'proximity',
];

export const OPERATORS = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'between', 'outside', 'change'];

export const RULE_EVENTS = [
  'alarm:sos', 'alarm:powerCut', 'alarm:lowBattery', 'alarm:tampering', 'alarm:vibration', 'alarm:door', 'alarm:accident',
  'alarm:fatigueDriving', 'alarm:hardBraking', 'alarm:hardAcceleration', 'alarm:hardCornering', 'alarm:jamming',
  'deviceFuelDrop', 'deviceFuelIncrease', 'driverChanged', 'ignitionOn', 'ignitionOff', 'geofenceEnter', 'geofenceExit',
  'deviceOverspeed', 'deviceOffline', 'deviceOnline', 'media', 'maintenance',
];

export const EXTRA_KINDS = ['speed', 'ignition', 'motion', 'sensor', 'parameter', 'geofence'];

export const VARIABLES = ['unit', 'rule', 'detail', 'value', 'speed', 'address', 'time', 'driver', 'geofence', 'lat', 'lon'];

export const DAYS = [1, 2, 3, 4, 5, 6, 7];

export const emptyRule = () => ({
  name: '',
  enabled: true,
  config: {
    type: 'speed',
    condition: { limit: 90 },
    extra: [],
    all: true,
    deviceIds: [],
    groupIds: [],
    schedule: null,
    minDuration: 0,
    cooldown: 10,
    maxPerDay: 0,
    severity: 'high',
    channels: ['web'],
    emails: '',
    phones: '',
    command: null,
    message: '',
  },
});

const preset = (name, config) => ({ name, config: { ...emptyRule().config, ...config } });

export const RULE_TEMPLATES = [
  preset('ruleTplSpeed', { type: 'speed', condition: { limit: 90 }, minDuration: 30, severity: 'high', message: '{unit} excedió la velocidad: {detail} en {address}' }),
  preset('ruleTplIdle', { type: 'idle', condition: { minutes: 10 }, severity: 'medium', message: '{unit} lleva más de 10 min en ralentí en {address}' }),
  preset('ruleTplDoor', { type: 'digital', condition: { sensorType: 'door', state: 'on' }, extra: [{ kind: 'speed', op: 'gt', value: 5 }], severity: 'critical', message: '{unit}: puerta abierta en movimiento ({speed} km/h)' }),
  preset('ruleTplColdChain', { type: 'sensor', condition: { sensorType: 'temperature', op: 'outside', min: 2, max: 8 }, minDuration: 300, severity: 'critical', message: '{unit}: temperatura fuera de rango, {detail}' }),
  preset('ruleTplLowFuel', { type: 'fuel', condition: { op: 'lt', value: 50 }, minDuration: 120, severity: 'medium', message: '{unit}: combustible bajo, {detail}' }),
  preset('ruleTplDrain', { type: 'event', condition: { events: ['deviceFuelDrop'] }, severity: 'critical', message: '{unit}: posible robo de combustible en {address}' }),
  preset('ruleTplOffline', { type: 'connection', condition: { minutes: 30 }, severity: 'high', message: '{unit} sin conexión: {detail}' }),
  preset('ruleTplAfterHours', { type: 'digital', condition: { param: 'ignition', state: 'on' }, schedule: { days: [1, 2, 3, 4, 5], from: '06:00', to: '20:00', invert: true }, severity: 'high', message: '{unit} encendida fuera de horario ({time})' }),
  preset('ruleTplSos', { type: 'event', condition: { events: ['alarm:sos', 'alarm:accident'] }, severity: 'critical', cooldown: 0, message: '🚨 {unit}: {detail} en {address}' }),
  preset('ruleTplDriver', { type: 'driver', condition: { minutes: 2 }, severity: 'medium', message: '{unit} encendida sin conductor identificado' }),
  preset('ruleTplGeofenceExit', { type: 'geofence', condition: { mode: 'exit', geofenceIds: [] }, severity: 'high', message: '{unit} salió de {geofence}' }),
  preset('ruleTplLongStop', { type: 'stop', condition: { minutes: 30, where: 'outside', geofenceIds: [] }, severity: 'medium', message: '{unit} detenida más de 30 min fuera de geocercas en {address}' }),
];
