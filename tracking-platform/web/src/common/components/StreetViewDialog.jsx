import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from './LocalizationProvider';

export const streetViewUrl = (position) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${position.latitude},${position.longitude}&heading=${Math.round(position.course || 0)}`;

// Street View where the unit is, looking where it heads: embedded with the Google key of the platform (Maps Embed API),
// otherwise the caller opens Google Maps
const StreetViewDialog = ({
  open, position, googleKey, title, onClose,
}) => {
  const t = useTranslation();
  if (!open || !position) return null;
  const src = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(googleKey)}&location=${position.latitude},${position.longitude}&heading=${Math.round(position.course || 0)}&fov=90`;
  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose}>
      <DialogTitle>{`Street View · ${title}`}</DialogTitle>
      <DialogContent sx={{ p: 0, height: { xs: 360, sm: 480 } }}>
        <iframe title="Street View" src={src} style={{ border: 0, width: '100%', height: '100%' }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </DialogContent>
      <DialogActions>
        <Button startIcon={<OpenInNewIcon />} href={streetViewUrl(position)} target="_blank" rel="noopener">{t('streetViewOpen')}</Button>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default StreetViewDialog;
