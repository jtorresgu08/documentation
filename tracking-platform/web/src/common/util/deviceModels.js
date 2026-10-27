// Common GPS trackers and cameras: the protocol (and so the server port) each one uses, its map icon and, for
// cameras, the default camera settings. Ports are the Traccar defaults for each protocol. deviceModel is the exact
// code saved as the unit model when the decoder reads model specific parameters (Teltonika FMB / FT platform).
// Teltonika SMS start with the SMS credentials: FMB '<login> <password> ' (two spaces when empty), FT platform
// '<password> ' (one space).

const models = [
  { brand: 'Concox / Jimi', model: 'GT06N, GT800, JM-VL01, JM-VL03, AT4', protocol: 'gt06', port: 5023, category: 'car', sms: 'SERVER,1,{host},{port},0#' },
  { brand: 'Jimi IoT', model: 'JC400 / JC400P / JC261 (dashcam)', protocol: 'gt06', port: 5023, category: 'car', sms: 'SERVER,1,{host},{port},0#', camera: { kind: 'dashcam', protocol: 'jimi', channels: 2 } },
  { brand: 'Jimi IoT', model: 'JC450 / JC181 / JC371 / JC182 / JC451 (dashcam JT808)', protocol: 'huabao', port: 5015, category: 'car', camera: { kind: 'dashcam', protocol: 'jt808', channels: 2 } },
  { brand: 'MDVR', model: 'MDVR JT808 / JT1078 (Howen, Streamax, genérico)', protocol: 'huabao', port: 5015, category: 'bus', camera: { kind: 'mdvr', protocol: 'jt808', channels: 4 } },
  { brand: 'JT808', model: 'Rastreador JT/T 808 genérico', protocol: 'huabao', port: 5015, category: 'car' },
  { brand: 'Teltonika', model: 'FMB920', deviceModel: 'FMB920', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FMB120', deviceModel: 'FMB120', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FMB130', deviceModel: 'FMB130', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FMB140', deviceModel: 'FMB140', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Teltonika', model: 'FMC130', deviceModel: 'FMC130', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FMC920', deviceModel: 'FMC920', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FMC150', deviceModel: 'FMC150', protocol: 'teltonika', port: 5027, sms: '  setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Teltonika', model: 'FTC920 (plataforma FT)', deviceModel: 'FTC920', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FTC921 (plataforma FT)', deviceModel: 'FTC921', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FTC961 (plataforma FT)', deviceModel: 'FTC961', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'car' },
  { brand: 'Teltonika', model: 'FTC965 (plataforma FT)', deviceModel: 'FTC965', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Teltonika', model: 'FTC968 (plataforma FT)', deviceModel: 'FTC968', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Teltonika', model: 'FTM880 (plataforma FT)', deviceModel: 'FTM880', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Teltonika', model: 'FTC880 (plataforma FT)', deviceModel: 'FTC880', protocol: 'teltonika', port: 5027, sms: ' setparam 2004:{host};2005:{port};2006:0', category: 'truck' },
  { brand: 'Coban', model: 'TK103, TK303, GPS-103', protocol: 'gps103', port: 5001, category: 'car', sms: 'adminip123456 {host} {port}' },
  { brand: 'Sinotrack', model: 'ST-901, ST-906, ST-907 (H02)', protocol: 'h02', port: 5013, category: 'car', sms: '8040000 {host} {port}' },
  { brand: 'Queclink', model: 'GV300, GV55, GV500, GL300', protocol: 'gl200', port: 5004, category: 'truck' },
  { brand: 'Suntech', model: 'ST300, ST310U, ST4300', protocol: 'suntech', port: 5011, category: 'truck' },
  { brand: 'Meitrack', model: 'T333, T366, MVT380', protocol: 'meitrack', port: 5020, category: 'truck' },
  { brand: 'Ruptela', model: 'FM-Eco4, FM-Pro4, HCV5', protocol: 'ruptela', port: 5046, category: 'truck' },
  { brand: 'Galileosky', model: 'Galileosky 7.0, Base Block', protocol: 'galileo', port: 5034, category: 'truck' },
  { brand: 'Topin', model: 'Relojes y GPS personales Topin', protocol: 'topin', port: 5199, category: 'person' },
  { brand: 'Relojes 3G/4G', model: 'Relojes infantiles / personales (protocolo watch)', protocol: 'watch', port: 5093, category: 'person' },
  { brand: 'App móvil', model: 'Traccar Client / app de la plataforma (OsmAnd)', protocol: 'osmand', port: 5055, category: 'person' },
];

export default models.map((item, index) => ({ id: index, ...item }));

export const instructionsFor = (model, host) => model?.sms?.replaceAll('{host}', host).replaceAll('{port}', model.port);
