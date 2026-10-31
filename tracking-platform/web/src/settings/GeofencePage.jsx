import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Button,
  Typography,
  TextField,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  Stack,
  Switch,
  Box,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SpeedIcon from '@mui/icons-material/Speed';
import fetchOrThrow from '../common/util/fetchOrThrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditItemView from './components/EditItemView';
import EditAttributesAccordion from './components/EditAttributesAccordion';
import { useTranslation } from '../common/components/LocalizationProvider';
import useGeofenceAttributes from '../common/attributes/useGeofenceAttributes';
import SettingsMenu from './components/SettingsMenu';
import SelectField from '../common/components/SelectField';
import { geofencesActions } from '../store';
import useSettingsStyles from './common/useSettingsStyles';

const GeofencePage = () => {
  const { classes } = useSettingsStyles();
  const dispatch = useDispatch();
  const t = useTranslation();

  const geofenceAttributes = useGeofenceAttributes(t);

  const [item, setItem] = useState();

  const onItemSaved = (result) => {
    dispatch(geofencesActions.update([result]));
  };

  const validate = () => item && item.name;

  // own speed limit (km/h) with levels: under the mild threshold it is tolerance, then mild, dangerous, critical
  const [alertReady, setAlertReady] = useState(null);
  useEffect(() => {
    fetchOrThrow('/api/notifications').then((response) => response.json())
      .then((items) => setAlertReady(items.some((notification) => notification.type === 'geofenceOverspeed'))).catch(() => {});
  }, []);
  const createAlert = async () => {
    await fetchOrThrow('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'geofenceOverspeed', always: true, notificators: 'web', attributes: {} }),
    });
    setAlertReady(true);
  };
  const setAttribute = (key, value) => {
    const attributes = { ...item.attributes };
    if (value === undefined || value === '' || value === null) delete attributes[key]; else attributes[key] = value;
    setItem({ ...item, attributes });
  };
  const levels = (item?.attributes?.speedLevels || '5,10,15').split(',').map((value) => value.trim());
  const setLevel = (index, value) => {
    const next = [...levels];
    next[index] = value;
    setAttribute('speedLevels', next.join(','));
  };
  const limit = item?.attributes?.speedLimitKmh;

  return (
    <EditItemView
      endpoint="geofences"
      item={item}
      setItem={setItem}
      validate={validate}
      onItemSaved={onItemSaved}
      menu={<SettingsMenu />}
      breadcrumbs={['settingsTitle', 'sharedGeofence']}
    >
      {item && (
        <>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                {t('sharedRequired')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.name || ''}
                onChange={(event) => setItem({ ...item, name: event.target.value })}
                label={t('sharedName')}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle1">
                {t('sharedExtra')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <TextField
                value={item.description || ''}
                onChange={(event) => setItem({ ...item, description: event.target.value })}
                label={t('sharedDescription')}
              />
              <SelectField
                value={item.calendarId}
                onChange={(event) => setItem({ ...item, calendarId: Number(event.target.value) })}
                endpoint="/api/calendars"
                label={t('sharedCalendar')}
              />
              <FormControlLabel
                control={<Checkbox checked={item.attributes.hide} onChange={(e) => setItem({ ...item, attributes: { ...item.attributes, hide: e.target.checked } })} />}
                label={t('sharedFilterMap')}
              />
            </AccordionDetails>
          </Accordion>
          <Accordion defaultExpanded={Boolean(item.attributes.speedLimitKmh)}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <SpeedIcon fontSize="small" color={limit ? 'primary' : 'action'} />
                <Typography variant="subtitle1">{t('geofenceSpeedTitle')}</Typography>
                {limit && <Typography variant="body2" color="primary" fontWeight={700}>{`${limit} km/h`}</Typography>}
              </Stack>
            </AccordionSummary>
            <AccordionDetails className={classes.details}>
              <FormControlLabel
                control={<Switch checked={Boolean(limit)} onChange={(event) => setAttribute('speedLimitKmh', event.target.checked ? 40 : undefined)} />}
                label={t('geofenceSpeedUse')}
              />
              {limit && (
                <>
                  <TextField
                    type="number"
                    label={t('geofenceSpeedLimit')}
                    value={limit}
                    onChange={(event) => setAttribute('speedLimitKmh', event.target.value === '' ? '' : Number(event.target.value))}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }}
                  />
                  <Typography variant="body2" color="text.secondary">{t('geofenceSpeedLevelsHelp')}</Typography>
                  <Stack direction="row" spacing={1}>
                    {[['geofenceLevelMild', '#f9a825'], ['geofenceLevelDanger', '#e65100'], ['geofenceLevelCritical', '#c62828']].map(([key, color], index) => (
                      <TextField
                        key={key}
                        type="number"
                        label={t(key)}
                        value={levels[index] ?? ''}
                        onChange={(event) => setLevel(index, event.target.value)}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">+</InputAdornment>, endAdornment: <InputAdornment position="end">km/h</InputAdornment> } }}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: alpha(color, 0.06) }, '& label': { color } }}
                      />
                    ))}
                  </Stack>
                  <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                    {[['#9e9e9e', 1], ['#f9a825', 1], ['#e65100', 1], ['#c62828', 1]].map(([color], index) => <Box key={color} sx={{ flex: 1, bgcolor: color, opacity: index ? 1 : 0.4 }} />)}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {`${t('geofenceLevelTolerance')}: ${limit}–${Number(limit) + Number(levels[0] || 5)} km/h · ${t('geofenceLevelMild')}: +${levels[0]} · ${t('geofenceLevelDanger')}: +${levels[1]} · ${t('geofenceLevelCritical')}: +${levels[2]} ${t('geofenceOrMore')}`}
                  </Typography>
                  <FormControlLabel
                    control={<Switch checked={item.attributes.speedAlert !== false} onChange={(event) => setAttribute('speedAlert', event.target.checked ? undefined : false)} />}
                    label={t('geofenceSpeedNotify')}
                  />
                  {item.attributes.speedAlert !== false && alertReady === false && (
                    <Alert severity="info" action={<Button size="small" onClick={createAlert}>{t('geofenceSpeedCreateAlert')}</Button>}>{t('geofenceSpeedNoAlert')}</Alert>
                  )}
                  {item.attributes.speedAlert !== false && alertReady && <Alert severity="success">{t('geofenceSpeedAlertReady')}</Alert>}
                </>
              )}
            </AccordionDetails>
          </Accordion>
          <EditAttributesAccordion
            attributes={item.attributes}
            setAttributes={(attributes) => setItem({ ...item, attributes })}
            definitions={geofenceAttributes}
          />
        </>
      )}
    </EditItemView>
  );
};

export default GeofencePage;
