// Camera configuration kept in device attributes: kind (dashcam / MDVR), channel count (1-12), protocol and,
// for Jimi GT06 cameras, the text commands sent to the device.

export const MAX_CHANNELS = 12;

export const CAMERA_KINDS = ['dashcam', 'mdvr'];

export const CAMERA_PROTOCOLS = ['jt808', 'jimi'];

export const JIMI_DEFAULT_COMMANDS = {
  live: 'RTMP,ON,{camera}',
  liveStop: 'RTMP,OFF,{camera}',
  photo: 'PICTURE,{camera}',
};

const KEYS = {
  kind: 'dashcam.kind',
  channels: 'dashcam.channels',
  protocol: 'dashcam.protocol',
  channelNames: 'dashcam.channelNames',
  playUrl: 'dashcam.playUrl',
  live: 'dashcam.liveCommand',
  liveStop: 'dashcam.liveStopCommand',
  photo: 'dashcam.photoCommand',
};

export const dashcamKeys = KEYS;

// Jimi cameras name their lenses: OUT road facing (channel 1), IN cabin (channel 2), INOUT both
export const jimiCamera = (channel) => {
  if (channel === 1) {
    return 'OUT';
  }
  return channel === 2 ? 'IN' : 'INOUT';
};

export const getCameraConfig = (device, position) => {
  const attributes = device?.attributes || {};
  const protocol = attributes[KEYS.protocol] || (position?.protocol === 'gt06' ? 'jimi' : 'jt808');
  const channels = Math.min(MAX_CHANNELS, Math.max(1, Number(attributes[KEYS.channels]) || (protocol === 'jimi' ? 2 : 4)));
  const names = (attributes[KEYS.channelNames] || '').split(',').map((name) => name.trim());
  return {
    kind: attributes[KEYS.kind] || null,
    protocol,
    channels,
    channelName: (channel) => names[channel - 1] || null,
    playUrl: attributes[KEYS.playUrl] || null,
    commands: {
      live: attributes[KEYS.live] || JIMI_DEFAULT_COMMANDS.live,
      liveStop: attributes[KEYS.liveStop] || JIMI_DEFAULT_COMMANDS.liveStop,
      photo: attributes[KEYS.photo] || JIMI_DEFAULT_COMMANDS.photo,
    },
  };
};

// Command to send for an action ('live', 'liveStop', 'photo') on a channel
export const buildCameraCommand = (deviceId, config, action, channel) => {
  if (config.protocol === 'jimi') {
    const data = config.commands[action]
      .replaceAll('{camera}', jimiCamera(channel))
      .replaceAll('{channel}', channel);
    return { deviceId, type: 'custom', attributes: { data } };
  }
  const type = { live: 'liveVideo', liveStop: 'liveVideoStop', photo: 'requestPhoto' }[action];
  return { deviceId, type, attributes: { index: channel } };
};
