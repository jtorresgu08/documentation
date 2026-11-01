import { grey } from '@mui/material/colors';
import { BRAND_PRIMARY, BRAND_SECONDARY } from '../util/brandDefaults';

const validatedColor = (color) => (/^#([0-9A-Fa-f]{3}){1,2}$/.test(color) ? color : null);

export default (server, darkMode) => ({
  mode: darkMode ? 'dark' : 'light',
  background: {
    default: darkMode ? grey[900] : grey[50],
  },
  primary: {
    main: validatedColor(server?.attributes?.colorPrimary) || (darkMode ? '#7fa8e8' : BRAND_PRIMARY),
  },
  secondary: {
    main: validatedColor(server?.attributes?.colorSecondary) || (darkMode ? '#5cc8f7' : BRAND_SECONDARY),
  },
  neutral: {
    main: grey[500],
  },
  geometry: {
    main: '#3bb2d0',
  },
});
