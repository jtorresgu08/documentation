import dayjs from 'dayjs';

export const STOP_COLORS = {
  pending: '#2563c9', arrived: '#e79a2b', delivered: '#2f9e5b', failed: '#d9534f', skipped: '#8a93a3',
};

export const TRIP_COLORS = {
  planned: 'default', inProgress: 'primary', completed: 'success', cancelled: 'error',
};

export const FAILURE_REASONS = ['dispatchReasonAbsent', 'dispatchReasonAddress', 'dispatchReasonRejected', 'dispatchReasonClosed', 'dispatchReasonDamaged', 'dispatchReasonOther'];

export const stopLabel = (t, status) => t(`dispatchStop${status.charAt(0).toUpperCase()}${status.slice(1)}`);
export const tripLabel = (t, status) => t(`dispatchTrip${status.charAt(0).toUpperCase()}${status.slice(1)}`);

export const formatHour = (value) => (value ? dayjs(value).format('HH:mm') : '');

export const formatWindow = (stop) => {
  if (!stop.windowStart && !stop.windowEnd) return '';
  return `${formatHour(stop.windowStart) || '…'} – ${formatHour(stop.windowEnd) || '…'}`;
};

export const meters = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
};

const point = (stop) => [Number(stop.longitude), Number(stop.latitude)];

export const routeLength = (stops, start) => {
  const points = [...(start ? [start] : []), ...stops.map(point)];
  return points.slice(1).reduce((sum, item, index) => sum + meters(points[index], item), 0);
};

// visiting order: nearest neighbour from the start (unit position or first stop), improved with 2-opt; stops already
// done keep their place at the beginning
export const optimizeStops = (stops, start) => {
  const fixed = stops.filter((stop) => stop.status && stop.status !== 'pending');
  const open = stops.filter((stop) => !stop.status || stop.status === 'pending');
  if (open.length < 3) return stops;
  let current = start || point(open[0]);
  const remaining = [...open];
  const order = [];
  while (remaining.length) {
    let best = 0;
    remaining.forEach((stop, index) => {
      if (meters(current, point(stop)) < meters(current, point(remaining[best]))) best = index;
    });
    const [next] = remaining.splice(best, 1);
    order.push(next);
    current = point(next);
  }
  let improved = true;
  let route = order;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i += 1) {
      for (let j = i + 1; j < route.length; j += 1) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (routeLength(candidate, start) + 1 < routeLength(route, start)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return [...fixed, ...route];
};

// "lat, lon" or "lat lon"
export const parseCoordinates = (text) => {
  const parts = String(text || '').trim().split(/[\s,;]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN) || Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null;
  return { latitude: parts[0], longitude: parts[1] };
};

// HH:mm on the planned date, as ISO
export const timeOnDate = (date, time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return null;
  return dayjs(date).hour(hours).minute(minutes || 0).second(0).millisecond(0).toISOString();
};

// compress a photo before upload (max 1280 px, JPEG)
export const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    image.onerror = reject;
    image.src = reader.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
