// on time between 1 minute early and 5 late, the same window as the punctuality report
export const delayState = (minutes) => {
  if (minutes === null || minutes === undefined) return null;
  if (minutes > 5) return 'late';
  if (minutes < -1) return 'early';
  return 'onTime';
};

export const STATE_COLORS = { onTime: '#2f9e5b', late: '#e67e22', early: '#2563c9' };

export const delayTone = (minutes) => STATE_COLORS[delayState(minutes)];

export const formatDelay = (t, minutes) => {
  const state = delayState(minutes);
  if (!state) return '—';
  const value = `${minutes > 0 ? '+' : ''}${minutes} min`;
  return `${t(`transitState${state.charAt(0).toUpperCase()}${state.slice(1)}`)} · ${value}`;
};
