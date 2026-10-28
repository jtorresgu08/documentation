import { useSyncExternalStore } from 'react';

// unit whose information panel floats over the map; kept outside the device list so it survives row virtualization
let current = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

export const openUnitInfo = (deviceId) => {
  current = deviceId;
  notify();
};

export const closeUnitInfo = () => {
  current = null;
  notify();
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useUnitInfo = () => useSyncExternalStore(subscribe, () => current);
