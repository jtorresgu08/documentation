import { useSyncExternalStore } from 'react';

// Floating panels over the platform (alerts, unit follow-up, quick replay, video…), kept outside the pages so they
// stay open while navigating. The array order is the stacking order: the last one is drawn on top. Each panel keeps
// its kind, its props (unit, filters), its geometry and whether it is minimized, which is what a workspace saves;
// "data" is transient state a panel shares with the map layers (route, measured points…).
const MAX_PANELS = 10;
let panels = [];
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

export const panelId = (kind, props = {}) => (props.deviceId ? `${kind}-${props.deviceId}` : kind);

export const openPanel = (kind, props = {}, options = {}) => {
  const id = options.id || panelId(kind, props);
  const existing = panels.find((item) => item.id === id);
  if (existing) {
    const updated = { ...existing, props: { ...existing.props, ...props }, minimized: false };
    panels = [...panels.filter((item) => item !== existing), updated];
  } else {
    const cascade = panels.length % 6;
    panels = [...panels.slice(-(MAX_PANELS - 1)), {
      id, kind, props, cascade, geometry: options.geometry || null, minimized: Boolean(options.minimized), data: null,
    }];
  }
  notify();
  return id;
};

export const focusPanel = (id) => {
  const existing = panels.find((item) => item.id === id);
  if (existing && panels[panels.length - 1] !== existing) {
    panels = [...panels.filter((item) => item !== existing), existing];
    notify();
  }
};

export const updatePanel = (id, changes) => {
  let changed = false;
  panels = panels.map((item) => {
    if (item.id === id) {
      changed = true;
      return { ...item, ...changes };
    }
    return item;
  });
  if (changed) notify();
};

export const setPanelData = (id, data) => updatePanel(id, { data });

export const closePanel = (id) => {
  panels = panels.filter((item) => item.id !== id);
  notify();
};

export const closeAllPanels = () => {
  panels = [];
  notify();
};

export const getPanels = () => panels;

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePanels = () => useSyncExternalStore(subscribe, () => panels);

// what a workspace keeps of the open panels
export const snapshotPanels = () => panels.map(({
  kind, props, geometry, minimized,
}) => ({
  kind, props, geometry, minimized,
}));

export const restorePanels = (saved) => {
  panels = [];
  (saved || []).forEach((item, index) => {
    const id = panelId(item.kind, item.props);
    panels.push({
      id, kind: item.kind, props: item.props || {}, cascade: index % 6, geometry: item.geometry || null, minimized: Boolean(item.minimized), data: null,
    });
  });
  notify();
};
