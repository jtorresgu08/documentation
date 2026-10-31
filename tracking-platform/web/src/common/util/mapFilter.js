import { useSyncExternalStore } from 'react';

// A filter a floating panel puts on the main map and device list ("only units in motion", "only units with
// problems"…): a label to show and the units to keep. null shows everything.
let filter = null;
const listeners = new Set();

export const setMapFilter = (value) => {
  filter = value;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMapFilter = () => useSyncExternalStore(subscribe, () => filter);
