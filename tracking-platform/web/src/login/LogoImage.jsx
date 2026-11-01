import { useTheme, useMediaQuery } from '@mui/material';
import { useBrandAttribute } from '../common/util/brand';
import { makeStyles } from 'tss-react/mui';
import { BRAND_LOGO, BRAND_LOGO_WHITE } from '../common/util/brandDefaults';

const useStyles = makeStyles()((theme) => ({
  image: {
    alignSelf: 'center',
    maxWidth: '240px',
    maxHeight: '120px',
    width: 'auto',
    height: 'auto',
    margin: theme.spacing(2),
  },
}));

const LogoImage = ({ color }) => {
  const theme = useTheme();
  const { classes } = useStyles();

  const expanded = !useMediaQuery(theme.breakpoints.down('lg'));

  const logo = useBrandAttribute('logo');
  const logoInverted = useBrandAttribute('logoInverted');

  if (logo) {
    if (expanded && logoInverted) {
      return <img className={classes.image} src={logoInverted} alt="" />;
    }
    return <img className={classes.image} src={logo} alt="" />;
  }
  return <img className={classes.image} src={expanded && color ? BRAND_LOGO_WHITE : BRAND_LOGO} alt="Safe Connection" />;
};

export default LogoImage;
