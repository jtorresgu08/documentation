import {
  Accordion, AccordionDetails, AccordionSummary, MenuItem, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../../common/components/LocalizationProvider';
import useSettingsStyles from '../common/useSettingsStyles';
import {
  CAMERA_KINDS, CAMERA_PROTOCOLS, JIMI_DEFAULT_COMMANDS, MAX_CHANNELS, dashcamKeys,
} from '../../common/util/dashcam';

// Dashcam / MDVR settings of a device, stored as device attributes
const DeviceCameraAccordion = ({ item, setItem }) => {
  const { classes } = useSettingsStyles();
  const t = useTranslation();

  const attributes = item.attributes || {};
  const kind = attributes[dashcamKeys.kind] || '';
  const protocol = attributes[dashcamKeys.protocol] || '';

  const setAttribute = (key, value) => {
    const next = { ...attributes };
    if (value === '' || value === null || value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    setItem({ ...item, attributes: next });
  };

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle1">{t('dashcamSettings')}</Typography>
      </AccordionSummary>
      <AccordionDetails className={classes.details}>
        <TextField
          select
          label={t('dashcamKind')}
          value={kind}
          onChange={(event) => setAttribute(dashcamKeys.kind, event.target.value)}
        >
          <MenuItem value="">{t('dashcamKindNone')}</MenuItem>
          {CAMERA_KINDS.map((value) => (
            <MenuItem key={value} value={value}>{t(value === 'mdvr' ? 'dashcamKindMdvr' : 'dashcamKindDashcam')}</MenuItem>
          ))}
        </TextField>
        {kind && (
          <>
            <TextField
              select
              label={t('dashcamChannels')}
              value={attributes[dashcamKeys.channels] || (protocol === 'jimi' ? 2 : 4)}
              onChange={(event) => setAttribute(dashcamKeys.channels, Number(event.target.value))}
              helperText={t('dashcamChannelsHelp')}
            >
              {Array.from({ length: MAX_CHANNELS }, (_, index) => index + 1).map((value) => (
                <MenuItem key={value} value={value}>{value}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('dashcamProtocol')}
              value={protocol}
              onChange={(event) => setAttribute(dashcamKeys.protocol, event.target.value)}
              helperText={t('dashcamProtocolHelp')}
            >
              <MenuItem value="">{t('dashcamProtocolAuto')}</MenuItem>
              {CAMERA_PROTOCOLS.map((value) => (
                <MenuItem key={value} value={value}>{t(value === 'jimi' ? 'dashcamProtocolJimi' : 'dashcamProtocolJt808')}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('dashcamChannelNames')}
              value={attributes[dashcamKeys.channelNames] || ''}
              onChange={(event) => setAttribute(dashcamKeys.channelNames, event.target.value)}
              placeholder={t('dashcamChannelNamesPlaceholder')}
            />
            <TextField
              label={t('dashcamPlayUrl')}
              value={attributes[dashcamKeys.playUrl] || ''}
              onChange={(event) => setAttribute(dashcamKeys.playUrl, event.target.value)}
              helperText={t('dashcamPlayUrlHelp')}
            />
            {protocol === 'jimi' && (
              <>
                <TextField
                  label={t('dashcamLiveCommand')}
                  value={attributes[dashcamKeys.live] || ''}
                  placeholder={JIMI_DEFAULT_COMMANDS.live}
                  onChange={(event) => setAttribute(dashcamKeys.live, event.target.value)}
                  helperText={t('dashcamCommandHelp')}
                />
                <TextField
                  label={t('dashcamLiveStopCommand')}
                  value={attributes[dashcamKeys.liveStop] || ''}
                  placeholder={JIMI_DEFAULT_COMMANDS.liveStop}
                  onChange={(event) => setAttribute(dashcamKeys.liveStop, event.target.value)}
                />
                <TextField
                  label={t('dashcamPhotoCommand')}
                  value={attributes[dashcamKeys.photo] || ''}
                  placeholder={JIMI_DEFAULT_COMMANDS.photo}
                  onChange={(event) => setAttribute(dashcamKeys.photo, event.target.value)}
                />
              </>
            )}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default DeviceCameraAccordion;
