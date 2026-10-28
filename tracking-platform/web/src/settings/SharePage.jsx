import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Container,
  TextField,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SettingsMenu from './components/SettingsMenu';
import { useCatchCallback } from '../reactHelper';
import useSettingsStyles from './common/useSettingsStyles';
import fetchOrThrow from '../common/util/fetchOrThrow';

const SharePage = () => {
  const navigate = useNavigate();
  const { classes } = useSettingsStyles();
  const t = useTranslation();

  const { id } = useParams();

  const device = useSelector((state) => state.devices.items[id]);

  const [expiration, setExpiration] = useState(dayjs().add(1, 'week').locale('en').format('YYYY-MM-DD'));
  const [link, setLink] = useState();
  const [destination, setDestination] = useState('');
  const [label, setLabel] = useState('');
  const [trackLink, setTrackLink] = useState();

  const handleShare = useCatchCallback(async () => {
    const expirationTime = dayjs(expiration).toISOString();
    const response = await fetchOrThrow('/api/devices/share', {
      method: 'POST',
      body: new URLSearchParams(`deviceId=${id}&expiration=${expirationTime}`),
    });
    const token = await response.text();
    setLink(`${window.location.origin}?token=${token}`);
    const [lat, lon] = destination.split(',').map((value) => Number(value.trim()));
    const params = new URLSearchParams({ token });
    if (destination && Number.isFinite(lat) && Number.isFinite(lon)) {
      params.append('dest', `${lat},${lon}`);
      if (label.trim()) {
        params.append('label', label.trim());
      }
    }
    setTrackLink(`${window.location.origin}/track?${params}`);
  }, [id, expiration, destination, label, setLink]);

  return (
    <PageLayout menu={<SettingsMenu />} breadcrumbs={['deviceShare']}>
      <Container maxWidth="xs" className={classes.container}>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">
              {t('sharedRequired')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails className={classes.details}>
            <TextField
              value={device?.name || ''}
              label={t('sharedDevice')}
              disabled
            />
            <TextField
              label={t('userExpirationTime')}
              type="date"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
            />
            <TextField
              label={t('trackDestinationCoordinates')}
              placeholder="-12.0464, -77.0428"
              helperText={t('trackDestinationHelp')}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            <TextField
              label={t('trackDestinationName')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button
              variant="outlined"
              color="primary"
              onClick={handleShare}
            >
              {t('reportShow')}
            </Button>
            <TextField
              value={link || ''}
              onChange={(e) => setLink(e.target.value)}
              label={t('sharedLink')}
              InputProps={{
                readOnly: true,
              }}
            />
            <TextField
              value={trackLink || ''}
              label={t('trackLink')}
              helperText={t('trackLinkHelp')}
              InputProps={{
                readOnly: true,
              }}
            />
            <Button variant="outlined" disabled={!trackLink} onClick={() => navigator.clipboard?.writeText(trackLink)}>
              {t('trackCopy')}
            </Button>
          </AccordionDetails>
        </Accordion>
        <div className={classes.buttons}>
          <Button
            type="button"
            color="primary"
            variant="outlined"
            onClick={() => navigate(-1)}
          >
            {t('sharedCancel')}
          </Button>
          <Button
            type="button"
            color="primary"
            variant="contained"
            onClick={() => navigator.clipboard?.writeText(link)}
            disabled={!link}
          >
            {t('sharedCopy')}
          </Button>
        </div>
      </Container>
    </PageLayout>
  );
};

export default SharePage;
