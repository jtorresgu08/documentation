import { prefixString } from '../common/util/stringUtils';
import { formatAlarm } from '../common/util/formatter';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_COLORS = {
  critical: '#c62828',
  high: '#e65100',
  medium: '#1565c0',
  low: '#607d8b',
};

export const STATUSES = ['new', 'ack', 'resolved', 'dismissed'];

export const STATUS_COLORS = {
  new: '#c62828',
  ack: '#e65100',
  resolved: '#2e7d32',
  dismissed: '#607d8b',
};

export const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Readable title of an event: alarm name, maintenance plan with its state, or the event type
export const alertTitle = (item, t) => {
  if (item.type === 'alarm' && item.attributes?.alarm) {
    return formatAlarm(item.attributes.alarm, t);
  }
  if (item.type === 'ruleTriggered' && item.attributes?.ruleName) {
    return item.attributes.ruleName;
  }
  if (item.type === 'maintenance' && item.attributes?.name) {
    const state = item.attributes.state ? ` · ${t(`maintenanceState${capitalize(item.attributes.state)}`)}` : '';
    return `${item.attributes.name}${state}`;
  }
  return t(prefixString('event', item.type));
};

// Short beep for a new critical alert
export const playAlertSound = () => {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((delay) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.2);
    });
  } catch {
    // audio not available
  }
};
