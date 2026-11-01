import { useEffect, useState } from 'react';
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField,
} from '@mui/material';
import { useTranslation } from './LocalizationProvider';
import GoogleEmbed from './GoogleEmbed';

export const NEARBY = ['googleNearFuel', 'googleNearWorkshop', 'googleNearTires', 'googleNearHospital', 'googleNearPolice', 'googleNearHotel'];

// Google views of where a unit is: satellite, map, Street View looking where it heads, and places nearby (fuel,
// workshops, hospitals...) for the control room
const GoogleViewDialog = ({
  open, initialTab = 'satellite', position, googleKey, title, onClose,
}) => {
  const t = useTranslation();
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setQuery(t(NEARBY[0]));
    }
  }, [open, initialTab]);

  if (!open || !position) return null;
  const location = { latitude: position.latitude, longitude: position.longitude };
  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle sx={{ pb: 0 }}>{`${t('googleViews')} · ${title}`}</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 1.5 }} variant="scrollable">
          <Tab value="satellite" label={t('googleSatellite')} />
          <Tab value="map" label={t('googleMap')} />
          <Tab value="streetview" label="Street View" />
          <Tab value="search" label={t('googleNearby')} />
        </Tabs>
        {tab === 'search' && (
          <Stack spacing={1} sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {NEARBY.map((key) => <Chip key={key} label={t(key)} color={query === t(key) ? 'primary' : 'default'} onClick={() => setQuery(t(key))} />)}
            </Stack>
            <TextField size="small" label={t('googleSearch')} value={query} onChange={(event) => setQuery(event.target.value)} />
          </Stack>
        )}
        <GoogleEmbed
          googleKey={googleKey}
          height={tab === 'search' ? 380 : 440}
          title={title}
          mode={tab === 'satellite' || tab === 'map' ? 'place' : tab}
          maptype={tab === 'map' ? 'roadmap' : 'satellite'}
          location={location}
          heading={position.course}
          query={query || t(NEARBY[0])}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoogleViewDialog;
