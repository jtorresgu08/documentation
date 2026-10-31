import {
  closePanel, focusPanel, openPanel, panelId,
} from './floatingPanels';

// Floating live video windows, one per unit: a kind of floating panel, so they share the stacking order, the
// workspaces and stay open while navigating.
export const openVideoWindow = (deviceId) => openPanel('video', { deviceId });

export const focusVideoWindow = (deviceId) => focusPanel(panelId('video', { deviceId }));

export const closeVideoWindow = (deviceId) => closePanel(panelId('video', { deviceId }));
