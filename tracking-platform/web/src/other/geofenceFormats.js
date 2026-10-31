import { kml as kmlToGeoJson, gpx as gpxToGeoJson } from '@tmcw/togeojson';
import { parse as parseWkt, stringify as stringifyWkt } from 'wellknown';
import circle from '@turf/circle';
import JSZip from 'jszip';

// Import and export of geofences in common GIS formats. Imported shapes become Traccar geofences: points become
// circles (with their radius property or a default one), polygons keep their outer ring, lines become route
// corridors, and shapes too detailed for the geofence area column are simplified to fit

export const MAX_AREA = 4000;
export const IMPORT_ACCEPT = '.geojson,.json,.kml,.kmz,.gpx,.wkt,.txt,.csv,.zip,.shp';

export const EXPORT_FORMATS = [
  { id: 'geojson', label: 'GeoJSON', extension: 'geojson', description: 'QGIS, ArcGIS, web' },
  { id: 'kml', label: 'KML', extension: 'kml', description: 'Google Earth, Google My Maps' },
  { id: 'kmz', label: 'KMZ', extension: 'kmz', description: 'Google Earth (comprimido)' },
  { id: 'shp', label: 'Shapefile', extension: 'zip', description: 'ArcGIS, QGIS (WGS84)' },
  { id: 'gpx', label: 'GPX', extension: 'gpx', description: 'Navegadores GPS, Garmin' },
  { id: 'csv', label: 'CSV', extension: 'csv', description: 'Excel, Google Sheets' },
  { id: 'wkt', label: 'WKT', extension: 'wkt', description: 'Bases de datos, PostGIS' },
];

const EARTH = 6371008.8;
const rad = Math.PI / 180;

const round = (value) => Math.round(value * 1e6) / 1e6;

// ---------- geometry helpers ----------

// Douglas-Peucker in meters (local equirectangular projection)
const simplifyLine = (points, tolerance) => {
  if (points.length <= 2) return points;
  const lat0 = points[0][1] * rad;
  const xy = points.map(([lon, lat]) => [lon * rad * Math.cos(lat0) * EARTH, lat * rad * EARTH]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = xy[first];
    const [bx, by] = xy[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    let index = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = xy[i];
      let t = length ? ((px - ax) * dx + (py - ay) * dy) / length : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return sum / 2; // > 0 clockwise
};

const closeRing = (ring) => {
  const [first] = ring;
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
};

const latLon = (points) => points.map(([lon, lat]) => `${round(lat)} ${round(lon)}`).join(', ');

const areaOf = (type, points) => (type === 'polygon' ? `POLYGON ((${latLon(points)}))` : `LINESTRING (${latLon(points)})`);

// Traccar area (lat lon order) to a GeoJSON geometry; circles as 64-step polygons
export const areaToGeometry = (area) => {
  const circleMatch = /^\s*CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i.exec(area);
  if (circleMatch) {
    const [, lat, lon, radius] = circleMatch.map(Number);
    return {
      geometry: circle([lon, lat], radius, { steps: 64, units: 'meters' }).geometry,
      center: [lon, lat],
      radius,
    };
  }
  const geometry = parseWkt(area);
  if (!geometry) return null;
  const swap = (coordinates) => (typeof coordinates[0] === 'number' ? [coordinates[1], coordinates[0]] : coordinates.map(swap));
  return { geometry: { type: geometry.type, coordinates: swap(geometry.coordinates) } };
};

// ---------- import ----------

const pick = (properties, keys) => {
  const lower = Object.fromEntries(Object.entries(properties || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const key = keys.find((name) => lower[name.toLowerCase()] !== undefined && lower[name.toLowerCase()] !== '' && lower[name.toLowerCase()] !== null);
  return key ? lower[key.toLowerCase()] : undefined;
};

const number = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const result = Number(String(value).replace(',', '.'));
  return Number.isFinite(result) ? result : undefined;
};

const color = (value) => {
  if (!value) return undefined;
  const text = String(value).trim();
  return /^#?[0-9a-f]{6}$/i.test(text) ? `#${text.replace('#', '')}` : undefined;
};

const NAME_KEYS = ['name', 'nombre', 'title', 'titulo', 'label', 'etiqueta', 'id'];
const DESCRIPTION_KEYS = ['description', 'descripcion', 'descr', 'desc', 'comment'];

// a GeoJSON feature to geofence candidates (multi-geometries are split)
const featureToItems = (feature, options, index) => {
  const properties = feature.properties || {};
  const baseName = String(pick(properties, NAME_KEYS) ?? `${options.namePrefix} ${index + 1}`).trim();
  const description = pick(properties, DESCRIPTION_KEYS);
  const attributes = {};
  if (properties.attributes && typeof properties.attributes === 'object') {
    Object.assign(attributes, properties.attributes);
  } else if (typeof properties.attributes === 'string') {
    try {
      Object.assign(attributes, JSON.parse(properties.attributes));
    } catch {
      // not our own attributes
    }
  }
  const featureColor = color(pick(properties, ['color', 'stroke', 'fill']));
  if (featureColor && !attributes.color) attributes.color = featureColor;
  const speed = number(pick(properties, ['speedLimitKmh', 'speed_limit', 'speedlimit', 'speed', 'velocidad', 'velocidad_max', 'limite']));
  if (speed && !attributes.speedLimitKmh) attributes.speedLimitKmh = speed;
  const corridor = number(pick(properties, ['polylineDistance', 'corridor', 'ancho', 'width', 'buffer']));
  const radius = number(pick(properties, ['radius', 'radio']));
  const shape = String(pick(properties, ['shape', 'type', 'tipo', 'forma']) || '').toLowerCase();
  const center = Array.isArray(properties.center) ? properties.center : null;

  const items = [];
  const geometries = [];
  const flatten = (geometry) => {
    if (!geometry) return;
    if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(flatten);
    else if (geometry.type.startsWith('Multi')) geometry.coordinates.forEach((coordinates) => geometries.push({ type: geometry.type.slice(5), coordinates }));
    else geometries.push(geometry);
  };
  flatten(feature.geometry);

  geometries.forEach((geometry, part) => {
    const name = geometries.length > 1 ? `${baseName} (${part + 1})` : baseName;
    const warnings = [];
    let item;
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const r = radius || options.pointRadius;
      item = { type: 'circle', area: `CIRCLE (${round(lat)} ${round(lon)}, ${Math.round(r * 10) / 10})`, preview: circle([lon, lat], r, { steps: 48, units: 'meters' }).geometry };
    } else if (geometry.type === 'Polygon' || (geometry.type === 'LineString' && (shape === 'polygon' || shape === 'circle'))) {
      let ring = closeRing(geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates);
      if (geometry.type === 'Polygon' && geometry.coordinates.length > 1) warnings.push('holes');
      if ((shape === 'circle' || shape === 'círculo') && radius) {
        const middle = center || ring.slice(0, -1).reduce((sum, [lon, lat]) => [sum[0] + lon / (ring.length - 1), sum[1] + lat / (ring.length - 1)], [0, 0]);
        item = { type: 'circle', area: `CIRCLE (${round(middle[1])} ${round(middle[0])}, ${radius})`, preview: circle(middle, radius, { steps: 48, units: 'meters' }).geometry };
      } else {
        let tolerance = 1;
        const original = ring.length;
        while (areaOf('polygon', ring).length > MAX_AREA && tolerance < 100000) {
          ring = closeRing(simplifyLine(ring, tolerance));
          tolerance *= 1.5;
        }
        if (ring.length < original) warnings.push('simplified');
        item = { type: 'polygon', area: areaOf('polygon', ring), preview: { type: 'Polygon', coordinates: [ring] } };
      }
    } else if (geometry.type === 'LineString') {
      let points = geometry.coordinates;
      const original = points.length;
      let tolerance = 1;
      while (areaOf('line', points).length > MAX_AREA && tolerance < 100000) {
        points = simplifyLine(points, tolerance);
        tolerance *= 1.5;
      }
      if (points.length < original) warnings.push('simplified');
      item = { type: 'line', area: areaOf('line', points), preview: { type: 'LineString', coordinates: points } };
      if (!attributes.polylineDistance) attributes.polylineDistance = corridor || options.corridor;
    }
    if (item) {
      const points = item.preview.type === 'Polygon' ? item.preview.coordinates[0] : item.preview.coordinates;
      if (points.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) {
        warnings.push('projection');
      }
      items.push({
        ...item, name, description: description ? String(description) : undefined, attributes: { ...attributes }, warnings,
      });
    }
  });
  return items;
};

const geoJsonToItems = (data, options) => {
  let features = [];
  if (data.type === 'FeatureCollection') features = data.features;
  else if (data.type === 'Feature') features = [data];
  else if (data.type) features = [{ type: 'Feature', geometry: data, properties: {} }];
  return features.flatMap((feature, index) => featureToItems(feature, options, index));
};

const parseXml = (text) => {
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  if (dom.getElementsByTagName('parsererror').length) throw new Error('XML');
  return dom;
};

// CSV with , ; or tab separators and quoted values
export const parseCsv = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0];
  const separator = [';', '\t', ','].reduce((best, candidate) => (firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best), ',');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const nonEmpty = rows.filter((cells) => cells.some((cell) => cell.trim()));
  const header = (nonEmpty.shift() || []).map((cell) => cell.trim());
  return nonEmpty.map((cells) => Object.fromEntries(header.map((key, index) => [key, (cells[index] || '').trim()])));
};

const csvToItems = (text, options) => {
  const rows = parseCsv(text);
  const features = rows.map((row) => {
    const area = pick(row, ['area']);
    const wkt = pick(row, ['wkt', 'geometry', 'geometria', 'the_geom', 'geom']);
    const lat = number(pick(row, ['latitude', 'latitud', 'lat', 'y']));
    const lon = number(pick(row, ['longitude', 'longitud', 'lon', 'lng', 'long', 'x']));
    const properties = { ...row };
    if (row.attributes) {
      try {
        properties.attributes = JSON.parse(row.attributes);
      } catch {
        delete properties.attributes;
      }
    }
    if (area) {
      const parsed = areaToGeometry(area);
      if (parsed?.center) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: parsed.center }, properties: { ...properties, radius: parsed.radius } };
      }
      return parsed && { type: 'Feature', geometry: parsed.geometry, properties };
    }
    if (wkt) {
      const geometry = parseWkt(wkt);
      return geometry && { type: 'Feature', geometry, properties };
    }
    if (lat !== undefined && lon !== undefined) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties };
    }
    return null;
  }).filter(Boolean);
  if (rows.length && !features.length) throw new Error('csvColumns');
  return geoJsonToItems({ type: 'FeatureCollection', features }, options);
};

const wktToItems = (text, options) => {
  const features = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const match = /^(.*?)\s*[;\t|]\s*((?:POINT|LINESTRING|POLYGON|MULTI\w+|GEOMETRYCOLLECTION|CIRCLE)\s*\(.*)$/i.exec(line);
    const name = match ? match[1] : undefined;
    const wkt = match ? match[2] : line;
    if (/^CIRCLE/i.test(wkt)) {
      const parsed = areaToGeometry(wkt);
      return parsed && { type: 'Feature', geometry: { type: 'Point', coordinates: parsed.center }, properties: { name, radius: parsed.radius } };
    }
    const geometry = parseWkt(wkt);
    return geometry && { type: 'Feature', geometry, properties: { name } };
  }).filter(Boolean);
  return geoJsonToItems({ type: 'FeatureCollection', features }, options);
};

// ---------- shapefile ----------

// WGS84 UTM to latitude / longitude (zones like "WGS_1984_UTM_Zone_18S", common in Peru)
const utmToLonLat = (x, y, zone, south) => {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const xx = x - 500000;
  const yy = south ? y - 10000000 : y;
  const m = yy / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = xx / (n1 * k0);
  const lat = phi1 - ((n1 * Math.tan(phi1)) / r1) * ((d * d) / 2
    - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24
    + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6
    + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) / Math.cos(phi1);
  return [((zone - 1) * 6 - 180 + 3) + lon / rad, lat / rad];
};

const projectionOf = (prj) => {
  if (!prj) return null;
  const utm = /UTM[_ ]Zone[_ ](\d+)([NS])?/i.exec(prj) || /UTM zone (\d+)([NS])/i.exec(prj);
  if (utm) {
    const south = (utm[2] || '').toUpperCase() === 'S' || /south/i.test(prj) || /false_northing",\s*10000000/i.test(prj);
    return (x, y) => utmToLonLat(x, y, Number(utm[1]), south);
  }
  if (/^PROJCS/i.test(prj.trim())) throw new Error('projection');
  return null;
};

const readDbf = (buffer, encoding) => {
  if (!buffer) return [];
  const view = new DataView(buffer);
  const count = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const fields = [];
  for (let offset = 32; offset < headerLength - 1 && view.getUint8(offset) !== 0x0d; offset += 32) {
    const nameBytes = new Uint8Array(buffer, offset, 11);
    const name = String.fromCharCode(...nameBytes.slice(0, nameBytes.indexOf(0) >= 0 ? nameBytes.indexOf(0) : 11));
    fields.push({ name, type: String.fromCharCode(view.getUint8(offset + 11)), length: view.getUint8(offset + 16) });
  }
  const decoder = new TextDecoder(encoding);
  const records = [];
  for (let i = 0; i < count; i += 1) {
    let offset = headerLength + i * recordLength + 1;
    const record = {};
    fields.forEach((field) => {
      const text = decoder.decode(new Uint8Array(buffer, offset, field.length)).trim();
      record[field.name] = field.type === 'N' || field.type === 'F' ? number(text) : text;
      offset += field.length;
    });
    records.push(record);
  }
  return records;
};

const readShp = (buffer, project) => {
  const view = new DataView(buffer);
  const shapes = [];
  let offset = 100;
  const point = (at) => {
    const x = view.getFloat64(at, true);
    const y = view.getFloat64(at + 8, true);
    return project ? project(x, y) : [x, y];
  };
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getInt32(offset + 4) * 2;
    const start = offset + 8;
    const type = view.getInt32(start, true);
    const base = type % 10;
    let geometry = null;
    if (base === 1) {
      geometry = { type: 'Point', coordinates: point(start + 4) };
    } else if (base === 3 || base === 5) {
      const partCount = view.getInt32(start + 36, true);
      const pointCount = view.getInt32(start + 40, true);
      const parts = [];
      for (let i = 0; i < partCount; i += 1) parts.push(view.getInt32(start + 44 + i * 4, true));
      const pointsStart = start + 44 + partCount * 4;
      const lines = parts.map((first, i) => {
        const last = i + 1 < partCount ? parts[i + 1] : pointCount;
        const coordinates = [];
        for (let p = first; p < last; p += 1) coordinates.push(point(pointsStart + p * 16));
        return coordinates;
      });
      if (base === 3) {
        geometry = lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
      } else {
        // clockwise rings are outer rings, counter-clockwise ones holes of the previous outer ring
        const polygons = [];
        lines.forEach((ring) => {
          if (ringArea(ring) >= 0 || !polygons.length) polygons.push([ring]);
          else polygons[polygons.length - 1].push(ring);
        });
        geometry = polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
      }
    } else if (base === 8) {
      const pointCount = view.getInt32(start + 36, true);
      const coordinates = [];
      for (let p = 0; p < pointCount; p += 1) coordinates.push(point(start + 40 + p * 16));
      geometry = { type: 'MultiPoint', coordinates };
    }
    shapes.push(geometry);
    offset = start + length;
  }
  return shapes;
};

const shapefileToItems = async (files, options) => {
  const layers = Object.keys(files).filter((name) => name.toLowerCase().endsWith('.shp'));
  if (!layers.length) throw new Error('noShp');
  const items = [];
  layers.forEach((layer) => {
    const base = layer.slice(0, -4);
    const sibling = (extension) => files[Object.keys(files).find((name) => name.toLowerCase() === `${base}.${extension}`.toLowerCase())];
    const cpg = sibling('cpg') ? new TextDecoder().decode(sibling('cpg')).trim() : '';
    const encoding = /utf-?8/i.test(cpg) || !cpg ? 'utf-8' : 'windows-1252';
    const prj = sibling('prj') ? new TextDecoder().decode(sibling('prj')) : '';
    const shapes = readShp(files[layer], projectionOf(prj));
    const records = readDbf(sibling('dbf'), encoding);
    const features = shapes.map((geometry, index) => geometry && { type: 'Feature', geometry, properties: records[index] || {} }).filter(Boolean);
    items.push(...geoJsonToItems({ type: 'FeatureCollection', features }, options));
  });
  return items;
};

// reads a file into geofence candidates; throws Error(code) for unsupported content
export const readGeofenceFile = async (file, options) => {
  const name = file.name.toLowerCase();
  const extension = name.split('.').pop();
  if (extension === 'zip' || extension === 'kmz') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX'));
    const kmlEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.kml'));
    if (kmlEntry && !entries.some((entry) => entry.name.toLowerCase().endsWith('.shp'))) {
      return geoJsonToItems(kmlToGeoJson(parseXml(await kmlEntry.async('string'))), options);
    }
    const files = {};
    await Promise.all(entries.map(async (entry) => {
      files[entry.name] = await entry.async('arraybuffer');
    }));
    if (!Object.keys(files).some((key) => key.toLowerCase().endsWith('.shp'))) {
      const inner = entries.find((entry) => /\.(geojson|json|gpx|csv|wkt)$/i.test(entry.name));
      if (inner) {
        return readGeofenceFile(new File([await inner.async('blob')], inner.name), options);
      }
    }
    return shapefileToItems(files, options);
  }
  if (extension === 'shp') {
    return shapefileToItems({ [file.name]: await file.arrayBuffer() }, options);
  }
  const text = await file.text();
  if (extension === 'kml') return geoJsonToItems(kmlToGeoJson(parseXml(text)), options);
  if (extension === 'gpx') return geoJsonToItems(gpxToGeoJson(parseXml(text)), options);
  if (extension === 'csv') return csvToItems(text, options);
  if (extension === 'wkt' || extension === 'txt') return wktToItems(text, options);
  if (extension === 'geojson' || extension === 'json') return geoJsonToItems(JSON.parse(text), options);
  throw new Error('format');
};

// ---------- export ----------

const exportItems = (geofences) => geofences.map((geofence) => {
  const parsed = areaToGeometry(geofence.area);
  if (!parsed) return null;
  const tidy = (value) => (typeof value[0] === 'number' ? value.map(round) : value.map(tidy));
  parsed.geometry.coordinates = tidy(parsed.geometry.coordinates);
  const attributes = geofence.attributes || {};
  let type = 'polygon';
  if (parsed.center) type = 'circle';
  else if (parsed.geometry.type === 'LineString') type = 'line';
  return {
    geofence, geometry: parsed.geometry, center: parsed.center, radius: parsed.radius, type, attributes,
  };
}).filter(Boolean);

const escapeXml = (value) => String(value ?? '').replace(/[<>&'"]/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
}[char]));

const coordinates = (points) => points.map(([lon, lat]) => `${round(lon)},${round(lat)}`).join(' ');

const toGeoJson = (items) => JSON.stringify({
  type: 'FeatureCollection',
  features: items.map(({
    geofence, geometry, center, radius, type, attributes,
  }) => ({
    type: 'Feature',
    geometry,
    properties: {
      name: geofence.name,
      description: geofence.description || undefined,
      type,
      ...(center ? { center, radius } : {}),
      color: attributes.color,
      speedLimitKmh: attributes.speedLimitKmh,
      polylineDistance: attributes.polylineDistance,
      attributes,
    },
  })),
}, null, 2);

// KML colors are aabbggrr
const kmlColor = (hex, alpha) => {
  const value = (hex || '#2563c9').replace('#', '');
  return `${alpha}${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`;
};

const toKml = (items, title) => {
  const placemarks = items.map(({
    geofence, geometry, center, radius, type, attributes,
  }) => {
    const data = {
      type, radius, center: center ? center.join(',') : undefined, speedLimitKmh: attributes.speedLimitKmh, polylineDistance: attributes.polylineDistance, color: attributes.color, attributes: JSON.stringify(attributes),
    };
    const extended = Object.entries(data).filter(([, value]) => value !== undefined && value !== '{}')
      .map(([key, value]) => `<Data name="${key}"><value>${escapeXml(value)}</value></Data>`).join('');
    const shape = geometry.type === 'LineString'
      ? `<LineString><tessellate>1</tessellate><coordinates>${coordinates(geometry.coordinates)}</coordinates></LineString>`
      : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates(geometry.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    return `    <Placemark>
      <name>${escapeXml(geofence.name)}</name>${geofence.description ? `\n      <description>${escapeXml(geofence.description)}</description>` : ''}
      <Style><LineStyle><color>${kmlColor(attributes.color, 'ff')}</color><width>${type === 'line' ? 4 : 2}</width></LineStyle><PolyStyle><color>${kmlColor(attributes.color, '40')}</color></PolyStyle></Style>
      <ExtendedData>${extended}</ExtendedData>
      ${shape}
    </Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
${placemarks}
  </Document>
</kml>
`;
};

const toGpx = (items, title) => {
  const tracks = items.map(({ geofence, geometry, type }) => {
    const points = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates[0];
    const segment = points.map(([lon, lat]) => `<trkpt lat="${round(lat)}" lon="${round(lon)}"/>`).join('');
    return `  <trk><name>${escapeXml(geofence.name)}</name>${geofence.description ? `<desc>${escapeXml(geofence.description)}</desc>` : ''}<type>${type === 'line' ? 'line' : 'polygon'}</type><trkseg>${segment}</trkseg></trk>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Andes Tracking" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(title)}</name></metadata>
${tracks}
</gpx>
`;
};

const csvValue = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (items) => {
  const header = ['name', 'description', 'type', 'latitude', 'longitude', 'radius', 'color', 'speedLimitKmh', 'polylineDistance', 'area', 'wkt', 'attributes'];
  const rows = items.map(({
    geofence, geometry, center, radius, type, attributes,
  }) => [
    geofence.name, geofence.description, type, center ? round(center[1]) : '', center ? round(center[0]) : '', radius ?? '',
    attributes.color, attributes.speedLimitKmh, attributes.polylineDistance, geofence.area, stringifyWkt(geometry), JSON.stringify(attributes),
  ].map(csvValue).join(','));
  return `\uFEFF${[header.join(','), ...rows].join('\r\n')}\r\n`;
};

const toWkt = (items) => `${items.map(({ geofence, geometry }) => `${geofence.name.replace(/[;\n]/g, ' ')};${stringifyWkt(geometry)}`).join('\n')}\n`;

// ESRI shapefile: one layer for polygons and circles, one for lines, each with .shp .shx .dbf .prj .cpg
const WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const DBF_FIELDS = [
  { name: 'NAME', type: 'C', length: 100 },
  { name: 'DESCR', type: 'C', length: 150 },
  { name: 'TYPE', type: 'C', length: 10 },
  { name: 'RADIUS', type: 'N', length: 12, decimals: 1 },
  { name: 'SPEED', type: 'N', length: 6, decimals: 0 },
  { name: 'CORRIDOR', type: 'N', length: 8, decimals: 1 },
  { name: 'COLOR', type: 'C', length: 9 },
];

const writeDbf = (records) => {
  const encoder = new TextEncoder();
  const headerLength = 32 + DBF_FIELDS.length * 32 + 1;
  const recordLength = 1 + DBF_FIELDS.reduce((sum, field) => sum + field.length, 0);
  const buffer = new ArrayBuffer(headerLength + records.length * recordLength + 1);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const now = new Date();
  view.setUint8(0, 0x03);
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, records.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  view.setUint8(29, 0x00);
  DBF_FIELDS.forEach((field, index) => {
    const offset = 32 + index * 32;
    bytes.set(encoder.encode(field.name), offset);
    view.setUint8(offset + 11, field.type.charCodeAt(0));
    view.setUint8(offset + 16, field.length);
    view.setUint8(offset + 17, field.decimals || 0);
  });
  view.setUint8(headerLength - 1, 0x0d);
  records.forEach((record, index) => {
    let offset = headerLength + index * recordLength;
    bytes[offset] = 0x20;
    offset += 1;
    DBF_FIELDS.forEach((field) => {
      const value = record[field.name];
      let encoded;
      if (field.type === 'N') {
        const text = value === undefined || value === null || value === '' ? '' : Number(value).toFixed(field.decimals);
        encoded = encoder.encode(text.padStart(field.length, ' ').slice(-field.length));
      } else {
        let text = String(value ?? '');
        encoded = encoder.encode(text);
        while (encoded.length > field.length) {
          text = text.slice(0, -1);
          encoded = encoder.encode(text);
        }
      }
      bytes.fill(0x20, offset, offset + field.length);
      bytes.set(encoded, offset);
      offset += field.length;
    });
  });
  view.setUint8(buffer.byteLength - 1, 0x1a);
  return buffer;
};

const writeShp = (shapeType, parts) => {
  // parts: array of records, each an array of rings / lines of [lon, lat]
  const recordSizes = parts.map((lines) => 44 + lines.length * 4 + lines.reduce((sum, line) => sum + line.length, 0) * 16);
  const shpLength = 100 + recordSizes.reduce((sum, size) => sum + 8 + size, 0);
  const shp = new DataView(new ArrayBuffer(shpLength));
  const shx = new DataView(new ArrayBuffer(100 + parts.length * 8));
  const all = parts.flat(2);
  const box = all.length ? [
    Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1])),
  ] : [0, 0, 0, 0];
  [[shp, shpLength], [shx, 100 + parts.length * 8]].forEach(([view, length]) => {
    view.setInt32(0, 9994);
    view.setInt32(24, length / 2);
    view.setInt32(28, 1000, true);
    view.setInt32(32, shapeType, true);
    box.forEach((value, i) => view.setFloat64(36 + i * 8, value, true));
  });
  let offset = 100;
  parts.forEach((lines, index) => {
    shx.setInt32(100 + index * 8, offset / 2);
    shx.setInt32(104 + index * 8, recordSizes[index] / 2);
    shp.setInt32(offset, index + 1);
    shp.setInt32(offset + 4, recordSizes[index] / 2);
    const start = offset + 8;
    const points = lines.flat();
    shp.setInt32(start, shapeType, true);
    [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]
      .forEach((value, i) => shp.setFloat64(start + 4 + i * 8, value, true));
    shp.setInt32(start + 36, lines.length, true);
    shp.setInt32(start + 40, points.length, true);
    let first = 0;
    lines.forEach((line, i) => {
      shp.setInt32(start + 44 + i * 4, first, true);
      first += line.length;
    });
    const pointsStart = start + 44 + lines.length * 4;
    points.forEach(([lon, lat], i) => {
      shp.setFloat64(pointsStart + i * 16, lon, true);
      shp.setFloat64(pointsStart + i * 16 + 8, lat, true);
    });
    offset = start + recordSizes[index];
  });
  return { shp: shp.buffer, shx: shx.buffer };
};

const toShapefile = async (items) => {
  const zip = new JSZip();
  const record = ({
    geofence, type, radius, attributes,
  }) => ({
    NAME: geofence.name, DESCR: geofence.description, TYPE: type, RADIUS: radius, SPEED: attributes.speedLimitKmh, CORRIDOR: attributes.polylineDistance, COLOR: attributes.color,
  });
  const layers = [
    // outer rings must be clockwise in shapefiles
    ['geocercas_areas', 5, items.filter((item) => item.type !== 'line'), (item) => [ringArea(item.geometry.coordinates[0]) >= 0 ? item.geometry.coordinates[0] : [...item.geometry.coordinates[0]].reverse()]],
    ['geocercas_rutas', 3, items.filter((item) => item.type === 'line'), (item) => [item.geometry.coordinates]],
  ];
  layers.forEach(([name, shapeType, layerItems, geometryOf]) => {
    if (!layerItems.length) return;
    const { shp, shx } = writeShp(shapeType, layerItems.map(geometryOf));
    zip.file(`${name}.shp`, shp);
    zip.file(`${name}.shx`, shx);
    zip.file(`${name}.dbf`, writeDbf(layerItems.map(record)));
    zip.file(`${name}.prj`, WGS84);
    zip.file(`${name}.cpg`, 'UTF-8');
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
};

// builds the export file for the geofences in the given format
export const exportGeofences = async (geofences, format, title = 'Geocercas') => {
  const items = exportItems(geofences);
  switch (format) {
    case 'geojson':
      return new Blob([toGeoJson(items)], { type: 'application/geo+json' });
    case 'kml':
      return new Blob([toKml(items, title)], { type: 'application/vnd.google-earth.kml+xml' });
    case 'kmz': {
      const zip = new JSZip();
      zip.file('doc.kml', toKml(items, title));
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
    }
    case 'gpx':
      return new Blob([toGpx(items, title)], { type: 'application/gpx+xml' });
    case 'csv':
      return new Blob([toCsv(items)], { type: 'text/csv;charset=utf-8' });
    case 'wkt':
      return new Blob([toWkt(items)], { type: 'text/plain;charset=utf-8' });
    case 'shp':
      return toShapefile(items);
    default:
      throw new Error('format');
  }
};
