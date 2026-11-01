// platform modules a plan can include, with their translation keys
export const MODULE_LABELS = {
  video: 'moduleVideo',
  fuel: 'moduleFuel',
  sensors: 'moduleSensors',
  alerts: 'moduleAlerts',
  geofenceSpeed: 'moduleGeofenceSpeed',
  routes: 'moduleRoutes',
  whatsapp: 'moduleWhatsapp',
  chat: 'moduleChat',
  driving: 'moduleDriving',
  expenses: 'moduleExpenses',
  maintenance: 'moduleMaintenance',
  reports: 'moduleReports',
  dispatch: 'moduleDispatch',
  transit: 'moduleTransit',
  tpms: 'moduleTpms',
  assets: 'moduleAssets',
  agro: 'moduleAgro',
  deviceConfig: 'moduleDeviceConfig',
  whitelabel: 'moduleWhitelabel',
};

export const moduleLabel = (t, module) => (MODULE_LABELS[module] ? t(MODULE_LABELS[module]) : module);
