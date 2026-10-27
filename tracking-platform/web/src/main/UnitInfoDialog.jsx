import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Table, TableBody, TableCell, TableRow,
  Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import {
  INFO_PREFIX, UNIT_INFO_FIELDS, formatSensorValue, fuelSensors, infoLabelKey, parseSensors, sensorValue,
} from '../common/util/sensors';

const Section = ({ title, rows }) => (rows.length > 0 && (
  <Grid size={{ xs: 12, md: 6 }}>
    <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>{title}</Typography>
    <Table size="small">
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell sx={{ color: 'text.secondary', width: '45%' }}>{label}</TableCell>
            <TableCell sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Grid>
));

// Unit information card, Wialon style: device, SIM, vehicle and installation data plus live sensor values
const UnitInfoDialog = ({ deviceId, onClose }) => {
  const t = useTranslation();
  const navigate = useNavigate();

  const device = useSelector((state) => state.devices.items[deviceId]);
  const position = useSelector((state) => state.session.positions[deviceId]);
  const group = useSelector((state) => state.groups.items[device?.groupId]);

  if (!device) {
    return null;
  }

  const attributes = device.attributes || {};
  const info = (key) => attributes[INFO_PREFIX + key];
  const present = (rows) => rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const infoRows = (section) => present(UNIT_INFO_FIELDS
    .filter((field) => field.section === section)
    .map((field) => [t(infoLabelKey(field.key)), info(field.key)]));

  const deviceRows = present([
    [t('deviceIdentifier'), device.uniqueId],
    [t('deviceModel'), device.model],
    [t('addDeviceProtocol'), position?.protocol],
    [t('groupParent'), group?.name],
    [t('deviceContact'), device.contact],
    [t('deviceLastUpdate'), device.lastUpdate && dayjs(device.lastUpdate).format('YYYY-MM-DD HH:mm:ss')],
    [t('positionFixTime'), position && dayjs(position.fixTime).format('YYYY-MM-DD HH:mm:ss')],
    [t('userExpirationTime'), device.expirationTime && dayjs(device.expirationTime).format('YYYY-MM-DD')],
  ]);
  const simRows = present([
    [t('unitInfoSimNumber'), device.phone],
    [t('unitInfoIccid'), info('iccid') || position?.attributes?.iccid],
    [t('unitInfoSimOperator'), info('simOperator')],
  ]);
  const sensors = parseSensors(device);
  const sensorRows = sensors.map((sensor) => [sensor.name, formatSensorValue(sensor, sensorValue(sensor, position), t)]);
  const vehicleRows = infoRows('vehicle');
  const installationRows = infoRows('installation');

  const sections = [
    [t('unitInfoDevice'), deviceRows],
    [t('unitInfoSim'), simRows],
    [t('unitInfoVehicle'), vehicleRows],
    [t('unitInfoInstallation'), installationRows],
    [t('sensorsTitle'), sensorRows],
  ];

  const copy = () => navigator.clipboard?.writeText([
    device.name,
    ...sections.filter(([, rows]) => rows.length).map(([title, rows]) => (
      `\n${title}\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`)),
  ].join('\n'));

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flexGrow: 1 }}>{device.name}</span>
        <Tooltip title={t('addDeviceCopy')}>
          <IconButton onClick={copy}><ContentCopyIcon /></IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={3}>
          {sections.map(([title, rows]) => <Section key={title} title={title} rows={rows} />)}
        </Grid>
        {!vehicleRows.length && !sensors.length && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{t('unitInfoEmpty')}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        {fuelSensors(device).length > 0 && (
          <Button startIcon={<LocalGasStationIcon />} onClick={() => navigate(`/reports/fuel?deviceId=${device.id}`)}>
            {t('fuelTitle')}
          </Button>
        )}
        <Button onClick={() => navigate(`/settings/device/${device.id}`)}>{t('sharedEdit')}</Button>
        <Button variant="contained" onClick={onClose}>{t('unitInfoClose')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default UnitInfoDialog;
