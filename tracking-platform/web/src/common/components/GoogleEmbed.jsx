import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from './LocalizationProvider';

const point = (value) => `${value.latitude},${value.longitude}`;

// Embedded Google view (Maps Embed API: no charge per load, only a key restricted to the domain). Modes: view
// (satellite or map of a point), place (one marker), streetview, search (places near a point) and directions (route
// from the unit through stops). Without a key it offers the same view in Google Maps.
export const googleUrls = ({
  mode, location, heading, query, origin, destination, waypoints = [], maptype = 'satellite', zoom,
}) => {
  const embed = new URLSearchParams();
  let link;
  switch (mode) {
    case 'streetview':
      embed.set('location', point(location));
      embed.set('heading', Math.round(heading || 0));
      embed.set('fov', 90);
      link = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point(location)}&heading=${Math.round(heading || 0)}`;
      break;
    case 'search':
      embed.set('q', query);
      embed.set('center', point(location));
      embed.set('zoom', zoom || 14);
      link = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${point(location)},15z`;
      break;
    case 'directions':
      embed.set('origin', point(origin));
      embed.set('destination', point(destination));
      if (waypoints.length) embed.set('waypoints', waypoints.slice(0, 20).map(point).join('|'));
      embed.set('mode', 'driving');
      link = `https://www.google.com/maps/dir/?api=1&origin=${point(origin)}&destination=${point(destination)}${waypoints.length ? `&waypoints=${waypoints.slice(0, 9).map(point).join('|')}` : ''}&travelmode=driving`;
      break;
    case 'place':
      embed.set('q', point(location));
      embed.set('zoom', zoom || 17);
      embed.set('maptype', maptype);
      link = `https://www.google.com/maps/search/?api=1&query=${point(location)}`;
      break;
    default:
      embed.set('center', point(location));
      embed.set('zoom', zoom || 18);
      embed.set('maptype', maptype);
      link = `https://www.google.com/maps/@?api=1&map_action=map&center=${point(location)}&zoom=${zoom || 18}&basemap=${maptype === 'satellite' ? 'satellite' : 'roadmap'}`;
  }
  return { embed: `https://www.google.com/maps/embed/v1/${mode === 'place' || mode === 'streetview' || mode === 'search' || mode === 'directions' ? mode : 'view'}?${embed.toString()}`, link };
};

const GoogleEmbed = ({
  googleKey, height = 260, title = 'Google Maps', ...options
}) => {
  const t = useTranslation();
  const { embed, link } = googleUrls(options);
  if (!googleKey) {
    return (
      <Box sx={{
        height, borderRadius: 2, border: '1px dashed', borderColor: 'divider', display: 'grid', placeItems: 'center', textAlign: 'center', p: 2, bgcolor: 'action.hover',
      }}
      >
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('googleNoKey')}</Typography>
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} href={link} target="_blank" rel="noopener">{t('streetViewOpen')}</Button>
        </Box>
      </Box>
    );
  }
  return (
    <Box sx={{ position: 'relative', height, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover' }}>
      <iframe title={title} src={`${embed}&key=${encodeURIComponent(googleKey)}`} style={{ border: 0, width: '100%', height: '100%' }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <Button size="small" variant="contained" color="inherit" href={link} target="_blank" rel="noopener" startIcon={<OpenInNewIcon />} sx={{ position: 'absolute', right: 8, bottom: 8, bgcolor: 'background.paper', boxShadow: 2 }}>
        Google Maps
      </Button>
    </Box>
  );
};

export default GoogleEmbed;
