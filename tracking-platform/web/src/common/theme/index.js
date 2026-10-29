import { useMemo } from 'react';
import { createTheme } from '@mui/material/styles';
import palette from './palette';
import dimensions from './dimensions';
import components from './components';

// soft, low shadows so floating panels feel light
const softShadows = ['none', ...Array.from({ length: 24 }, (_, index) => {
  const level = index + 1;
  return `0 ${Math.ceil(level / 2)}px ${level * 2 + 4}px rgba(15,27,45,${Math.min(0.06 + level * 0.004, 0.14).toFixed(3)})`;
})];

export default (server, darkMode, direction) => useMemo(() => createTheme({
  typography: {
    fontFamily: 'Roboto,Segoe UI,Helvetica Neue,Arial,sans-serif',
    fontSize: 13,
  },
  shadows: softShadows,
  palette: palette(server, darkMode),
  direction,
  dimensions,
  components,
}), [server, darkMode, direction]);
