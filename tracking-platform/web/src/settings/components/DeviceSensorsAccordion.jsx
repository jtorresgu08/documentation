import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Accordion, AccordionDetails, AccordionSummary, Button, IconButton, Menu, MenuItem, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from '../../common/components/LocalizationProvider';
import {
  SENSOR_TYPES, convertRaw, formatSensorValue, newSensor, parseSensors, withSensors,
} from '../../common/util/sensors';
import SensorDialog from './SensorDialog';

const typeLabelKey = (type) => `sensorType${type.charAt(0).toUpperCase()}${type.slice(1)}`;

// Sensors of the unit, WOX style; saved with the device
const DeviceSensorsAccordion = ({ item, setItem }) => {
  const t = useTranslation();
  const position = useSelector((state) => state.session.positions[item.id]);

  const sensors = parseSensors(item);
  const [editing, setEditing] = useState(null);
  const [addAnchor, setAddAnchor] = useState(null);

  const save = (sensor) => {
    const exists = sensors.some((existing) => existing.id === sensor.id);
    setItem(withSensors(item, exists
      ? sensors.map((existing) => (existing.id === sensor.id ? sensor : existing))
      : [...sensors, sensor]));
    setEditing(null);
  };

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1">{`${t('sensorsTitle')} (${sensors.length})`}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {sensors.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedName')}</TableCell>
                <TableCell>{t('sensorSource')}</TableCell>
                <TableCell>{t('sensorCurrent')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {sensors.map((sensor) => (
                <TableRow key={sensor.id}>
                  <TableCell>
                    <Typography variant="body2">{sensor.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t(typeLabelKey(sensor.type))}</Typography>
                  </TableCell>
                  <TableCell><code>{sensor.source}</code></TableCell>
                  <TableCell>{formatSensorValue(sensor, convertRaw(sensor, position?.attributes?.[sensor.source]), t)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 0 }}>
                    <IconButton size="small" onClick={() => setEditing(sensor)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setItem(withSensors(item, sensors.filter((existing) => existing.id !== sensor.id)))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={(event) => setAddAnchor(event.currentTarget)}>
          {t('sensorAdd')}
        </Button>
        <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
          {Object.keys(SENSOR_TYPES).map((type) => (
            <MenuItem
              key={type}
              onClick={() => {
                setAddAnchor(null);
                setEditing(newSensor(type));
              }}
            >
              {t(typeLabelKey(type))}
            </MenuItem>
          ))}
        </Menu>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{t('sensorsSaveHint')}</Typography>
        <SensorDialog
          open={Boolean(editing)}
          sensor={editing}
          deviceId={item.id}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </AccordionDetails>
    </Accordion>
  );
};

export default DeviceSensorsAccordion;
