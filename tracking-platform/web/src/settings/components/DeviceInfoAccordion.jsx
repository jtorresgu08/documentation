import {
  Accordion, AccordionDetails, AccordionSummary, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../../common/components/LocalizationProvider';
import useSettingsStyles from '../common/useSettingsStyles';
import { INFO_PREFIX, UNIT_INFO_FIELDS, infoLabelKey } from '../../common/util/sensors';

// Unit information, Wialon style: vehicle, SIM and installation data kept as "info.*" device attributes
const DeviceInfoAccordion = ({ item, setItem }) => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();

  const attributes = item.attributes || {};

  const setInfo = (key, value) => {
    const next = { ...attributes };
    if (value === '' || value === null || value === undefined) {
      delete next[INFO_PREFIX + key];
    } else {
      next[INFO_PREFIX + key] = value;
    }
    setItem({ ...item, attributes: next });
  };

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1">{t('unitInfoTitle')}</Typography>
      </AccordionSummary>
      <AccordionDetails className={classes.details}>
        <TextField
          value={item.phone || ''}
          onChange={(event) => setItem({ ...item, phone: event.target.value })}
          label={t('unitInfoSimNumber')}
        />
        {UNIT_INFO_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={t(infoLabelKey(field.key))}
            type={field.type || 'text'}
            multiline={field.multiline}
            minRows={field.multiline ? 2 : undefined}
            slotProps={field.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
            value={attributes[INFO_PREFIX + field.key] ?? ''}
            onChange={(event) => setInfo(
              field.key,
              field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value,
            )}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
};

export default DeviceInfoAccordion;
