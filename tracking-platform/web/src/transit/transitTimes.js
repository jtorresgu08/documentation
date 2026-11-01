// Planned minutes of every stop from the first one, the same way the server calculates them: distance along the
// path (or straight between stops when there is no path) at the commercial speed, unless the stop has its own minutes

const EARTH = 6371008.8;

const toLocal = (origin) => {
  const scale = Math.cos((origin[0] * Math.PI) / 180);
  return ([lat, lon]) => [((lon - origin[1]) * Math.PI * EARTH * scale) / 180, ((lat - origin[0]) * Math.PI * EARTH) / 180];
};

const projectOnSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), offset: Math.sqrt(length2) * t };
};

// distance along the line of each stop; going forward from the previous stop, like the server (40 m tolerance)
export const stopDistances = (points, path, circular) => {
  if (!points.length || points.some((point) => !point)) return null;
  let line = path.length > 1 ? path : points.map((point) => [point.latitude, point.longitude]);
  if (circular && line.length > 1) line = [...line, line[0]];
  const local = toLocal(line[0]);
  const vertices = line.map(local);
  const starts = [0];
  for (let i = 1; i < vertices.length; i += 1) {
    starts.push(starts[i - 1] + Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1]));
  }
  let previous = null;
  const distances = points.map((point) => {
    const position = local([point.latitude, point.longitude]);
    const candidates = [];
    for (let i = 0; i < vertices.length - 1; i += 1) {
      const projection = projectOnSegment(position, vertices[i], vertices[i + 1]);
      candidates.push({ distance: projection.distance, along: starts[i] + projection.offset });
    }
    if (!candidates.length) return 0;
    const nearest = Math.min(...candidates.map((candidate) => candidate.distance));
    const forward = candidates.filter((candidate) => candidate.distance <= nearest + 40 && (previous === null || candidate.along >= previous - 1));
    const chosen = forward.length ? forward.reduce((a, b) => (b.along < a.along ? b : a)) : candidates.find((candidate) => candidate.distance === nearest);
    previous = chosen.along;
    return chosen.along;
  });
  return { distances, length: starts[starts.length - 1] };
};

// minutes from the first stop of each direction: manual value when given (0 only for the first stop of a direction),
// otherwise distance / speed; on a line with outbound and return the return counts from its terminal (returnIndex)
export const plannedMinutes = (distances, manual, speedKmh, returnIndex = -1) => {
  const speed = Number(speedKmh) > 0 ? Number(speedKmh) : 20;
  return distances.map((distance, index) => {
    const back = returnIndex > 0 && index >= returnIndex;
    const first = index === 0 || index === returnIndex;
    const base = back ? distances[returnIndex] : 0;
    const value = manual[index] === '' || manual[index] === null || manual[index] === undefined ? null : Number(manual[index]);
    if (value !== null && value >= 0 && !(!first && value === 0)) return { minutes: value, auto: false, back };
    return { minutes: (distance - base) / (speed / 3.6) / 60, auto: true, back };
  });
};

export const addMinutes = (time, minutes) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!match) return '';
  const total = (Number(match[1]) * 60 + Number(match[2]) + Math.round(minutes)) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
