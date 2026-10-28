import { useSyncExternalStore } from 'react';

// lets the selected unit card toggle "follow" on the live map, whose toolbar owns the setting
let state = { active: false, toggle: null };
const listeners = new Set();

export const publishMapFollow = (active, toggle) => {
  if (state.active !== active || state.toggle !== toggle) {
    state = { active, toggle };
    listeners.forEach((listener) => listener());
  }
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useMapFollow = () => useSyncExternalStore(subscribe, () => state);
