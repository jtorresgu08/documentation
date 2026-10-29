import dayjs from 'dayjs';
import fetchOrThrow from '../common/util/fetchOrThrow';

// Camera events stored in the platform (photos, videos and the ADAS / DMS alarms that produced them), shared by the
// cameras page and the floating video window

export const PERIODS = { day: 1, week: 7, month: 30 };
const DMS_ALARMS = ['fatigueDriving', 'phoneCall', 'smoking', 'distraction', 'driverAbnormal'];
const ADAS_ALARMS = ['forwardCollision', 'laneDeparture', 'vehicleDistance', 'pedestrianCollision', 'frequentLaneChange',
  'roadSignOverLimit', 'obstacle'];

export const alarmFamily = (alarm) => {
  if (DMS_ALARMS.includes(alarm)) {
    return 'DMS';
  }
  return ADAS_ALARMS.includes(alarm) ? 'ADAS' : null;
};

export const mediaUrl = (device, file) => `/api/media/${device.uniqueId}/${file}`;

export const MediaView = ({ device, item, large }) => (item.type === 'video' ? (
  <video
    src={mediaUrl(device, item.file)}
    controls={large}
    muted
    preload="metadata"
    style={{
      width: '100%', height: large ? 'auto' : '100%', objectFit: 'cover', background: '#000', display: 'block',
    }}
  />
) : (
  <img
    src={mediaUrl(device, item.file)}
    alt=""
    loading="lazy"
    style={{
      width: '100%', height: large ? 'auto' : '100%', objectFit: 'cover', display: 'block',
    }}
  />
));

// Groups media events with the alarm that produced them: same alarm number (JT/T 808) or file listed in the
// alarm (Jimi GT06 cameras report the event file names in the alarm and upload them over HTTP afterwards)
export const groupEvents = (events, positions) => {
  const groups = new Map();
  const jimiFiles = new Map();
  events.filter((event) => event.type === 'alarm').forEach((event) => {
    const files = positions[event.positionId]?.attributes.eventFiles;
    if (files) {
      files.split(/[,;\s]+/).filter(Boolean).forEach((name) => jimiFiles.set(name, `jimi-${event.id}`));
    }
  });
  events.forEach((event) => {
    const position = positions[event.positionId] || { attributes: {} };
    const key = position.attributes.alarmNumber
      || jimiFiles.get(position.attributes.eventFile)
      || (event.type === 'alarm' && position.attributes.eventFiles ? `jimi-${event.id}` : null)
      || `media-${event.id}`;
    const group = groups.get(key) || {
      key, time: event.eventTime, alarm: null, media: [], position,
    };
    if (event.type === 'alarm') {
      group.alarm = event.attributes.alarm;
      group.time = event.eventTime;
      group.position = position;
    } else {
      group.media.push({
        type: event.attributes.media, file: event.attributes.file, channel: positions[event.positionId]?.attributes.channel,
      });
      if (!group.alarm && position.attributes.mediaAlarm) {
        group.alarm = position.attributes.mediaAlarm;
      }
    }
    groups.set(key, group);
  });
  return [...groups.values()]
    .filter((group) => group.media.length || group.position.attributes.alarmAttachments
      || group.position.attributes.eventFiles)
    .sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
};

// Loads the media and alarm events of a unit for the last days, with their positions, grouped by alarm
export const fetchCameraEvents = async (deviceId, days) => {
  const query = new URLSearchParams({
    deviceId,
    from: dayjs().subtract(days, 'day').toISOString(),
    to: dayjs().add(1, 'minute').toISOString(),
  });
  query.append('type', 'media');
  query.append('type', 'alarm');
  const response = await fetchOrThrow(`/api/reports/events?${query}`, { headers: { Accept: 'application/json' } });
  const events = await response.json();
  const positionIds = [...new Set(events.map((event) => event.positionId).filter(Boolean))];
  const positions = {};
  for (let i = 0; i < positionIds.length; i += 100) {
    const ids = new URLSearchParams();
    positionIds.slice(i, i + 100).forEach((id) => ids.append('id', id));
    const items = await (await fetchOrThrow(`/api/positions?${ids}`)).json();
    items.forEach((position) => { positions[position.id] = position; });
  }
  return groupEvents(events, positions);
};
