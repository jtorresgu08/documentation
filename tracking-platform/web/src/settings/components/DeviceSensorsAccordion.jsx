import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, IconButton, ListSubheader, Menu, MenuItem, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import { useTranslation } from '../../common/components/LocalizationProvider';
import fetchOrThrow from '../../common/util/fetchOrThrow';
import {
  SENSOR_GROUPS, SENSOR_TEMPLATES, SENSOR_TYPES, formatSensorValue, newSensor, parseSensors, sensorColor, withSensors,
} from '../../common/util/sensors';
import SensorDialog, { typeLabelKey } from './SensorDialog';

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

// Sensors of the unit, Wialon style: by group, ready-made sets by device model, order (formulas use the sensors
// above), duplicate, and the current value computed by the server; saved with the device
const DeviceSensorsAccordion = ({ item, setItem }) => {
  const t = useTranslation();

  const sensors = parseSensors(item);
  const [editing, setEditing] = useState(null);
  const [addAnchor, setAddAnchor] = useState(null);
  const [templateAnchor, setTemplateAnchor] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!item.id || !sensors.length) return undefined;
    const timer = setTimeout(() => {
      fetchOrThrow('/api/sensors/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: item.id, sensors: JSON.stringify(sensors) }),
      }).then((response) => response.json()).then((result) => setValues(result.values || {})).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [item.id, item.attributes?.sensors]);

  const store = (list) => setItem(withSensors(item, list));

  const save = (sensor) => {
    const exists = sensors.some((existing) => existing.id === sensor.id);
    store(exists ? sensors.map((existing) => (existing.id === sensor.id ? sensor : existing)) : [...sensors, sensor]);
    setEditing(null);
  };

  const move = (index, offset) => {
    const list = [...sensors];
    const [moved] = list.splice(index, 1);
    list.splice(index + offset, 0, moved);
    store(list);
  };

  const applyTemplate = (template) => {
    setTemplateAnchor(null);
    const existing = new Set(sensors.map((sensor) => `${sensor.type}:${sensor.source}`));
    store([...sensors, ...template.sensors().filter((sensor) => !existing.has(`${sensor.type}:${sensor.source}`))]);
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
              {sensors.map((sensor, index) => {
                const value = values[sensor.id];
                const color = sensorColor(sensor, value);
                return (
                  <TableRow key={sensor.id}>
                    <TableCell>
                      <Typography variant="body2">{sensor.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{`${t(typeLabelKey(sensor.type))} · #${sensor.id}`}</Typography>
                    </TableCell>
                    <TableCell><code>{sensor.formula || sensor.source || (SENSOR_TYPES[sensor.type]?.calculated ? `${sensor.rate} L/100 km` : '')}</code></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        {color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />}
                        <span>{formatSensorValue(sensor, value, t)}</span>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', px: 0 }}>
                      <IconButton size="small" disabled={!index} onClick={() => move(index, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
                      <IconButton size="small" disabled={index === sensors.length - 1} onClick={() => move(index, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
                      <Tooltip title={t('sharedDuplicate')}>
                        <IconButton size="small" onClick={() => store([...sensors, { ...sensor, id: Math.random().toString(36).slice(2, 8), name: `${sensor.name} (2)` }])}><ContentCopyIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <IconButton size="small" onClick={() => setEditing(sensor)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => store(sensors.filter((existing) => existing.id !== sensor.id))}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button startIcon={<AddIcon />} onClick={(event) => setAddAnchor(event.currentTarget)}>{t('sensorAdd')}</Button>
          <Button startIcon={<LibraryAddIcon />} onClick={(event) => setTemplateAnchor(event.currentTarget)}>{t('sensorTemplates')}</Button>
        </Stack>
        <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)} slotProps={{ paper: { sx: { maxHeight: 420 } } }}>
          {SENSOR_GROUPS.flatMap((group) => [
            <ListSubheader key={group}>{t(`sensorGroup${capitalize(group)}`)}</ListSubheader>,
            ...Object.keys(SENSOR_TYPES).filter((type) => SENSOR_TYPES[type].group === group).map((type) => (
              <MenuItem key={type} dense onClick={() => { setAddAnchor(null); setEditing(newSensor(type)); }}>{t(typeLabelKey(type))}</MenuItem>
            )),
          ])}
        </Menu>
        <Menu anchorEl={templateAnchor} open={Boolean(templateAnchor)} onClose={() => setTemplateAnchor(null)}>
          {SENSOR_TEMPLATES.map((template) => (
            <MenuItem key={template.key} onClick={() => applyTemplate(template)}>
              <Box>
                <Typography variant="body2">{t(`sensorTemplate${capitalize(template.key)}`)}</Typography>
                <Typography variant="caption" color="text.secondary">{template.sensors().map((sensor) => sensor.name).join(', ')}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{t('sensorsSaveHint')}</Typography>
        <SensorDialog
          open={Boolean(editing)}
          sensor={editing}
          sensors={sensors}
          deviceId={item.id}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      </AccordionDetails>
    </Accordion>
  );
};

export default DeviceSensorsAccordion;
