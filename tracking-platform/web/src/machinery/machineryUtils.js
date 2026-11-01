export const STATE_COLORS = {
  work: '#2f9e5b', idle: '#e79a2b', off: '#a3abb8', noSignal: '#d9534f',
};
export const MACHINE_TYPES = ['excavator', 'loader', 'backhoe', 'dozer', 'grader', 'roller', 'dumpTruck', 'crane', 'forklift', 'generator', 'other'];
export const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
export const typeLabel = (t, type) => t(`machineType${capitalize(type || 'other')}`);
export const stateLabel = (t, state) => t(`machineState${capitalize(state)}`);
export const hoursText = (value) => (value == null ? '—' : `${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 1 })} h`);
