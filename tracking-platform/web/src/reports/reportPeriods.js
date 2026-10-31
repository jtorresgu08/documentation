import dayjs from 'dayjs';

// Quick periods of the operation reports
export const PERIODS = ['today', 'yesterday', 'week', 'month', 'custom'];

export const periodRange = (period, custom) => {
  switch (period) {
    case 'today':
      return [dayjs().startOf('day'), dayjs()];
    case 'yesterday':
      return [dayjs().subtract(1, 'day').startOf('day'), dayjs().startOf('day')];
    case 'week':
      return [dayjs().subtract(7, 'day').startOf('day'), dayjs()];
    case 'month':
      return [dayjs().startOf('month'), dayjs()];
    default:
      return [dayjs(custom.from), dayjs(custom.to)];
  }
};

export const downloadCsv = (name, header, rows) => {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escape).join(';')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.download = `${name}-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
  link.click();
};

export const formatDuration = (ms) => {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
