import { useSyncExternalStore } from 'react';

// Floating live video windows, one per unit, kept outside the pages so they stay open while navigating.
// The last focused window is drawn on top.
const MAX_WINDOWS = 4;
let windows = [];
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

export const openVideoWindow = (deviceId) => {
  const existing = windows.find((item) => item.deviceId === deviceId);
  if (existing) {
    windows = [...windows.filter((item) => item !== existing), existing];
  } else {
    const index = windows.length;
    windows = [...windows.slice(-(MAX_WINDOWS - 1)), { deviceId, cascade: index }];
  }
  notify();
};

export const focusVideoWindow = (deviceId) => {
  const existing = windows.find((item) => item.deviceId === deviceId);
  if (existing && windows[windows.length - 1] !== existing) {
    windows = [...windows.filter((item) => item !== existing), existing];
    notify();
  }
};

export const closeVideoWindow = (deviceId) => {
  windows = windows.filter((item) => item.deviceId !== deviceId);
  notify();
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useVideoWindows = () => useSyncExternalStore(subscribe, () => windows);
