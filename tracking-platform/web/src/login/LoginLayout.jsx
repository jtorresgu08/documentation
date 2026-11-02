import '@fontsource/dancing-script/600.css';
import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import PublicIcon from '@mui/icons-material/Public';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import GppGoodIcon from '@mui/icons-material/GppGood';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import GlobeCanvas from './GlobeCanvas';
import { useBrandAttribute } from '../common/util/brand';
import { useTranslation } from '../common/components/LocalizationProvider';
import { BRAND_LOGO_WHITE, BRAND_NAME } from '../common/util/brandDefaults';

const useStyles = makeStyles()((theme) => ({
  root: {
    display: 'flex',
    minHeight: '100%',
    background: '#ffffff',
  },
  showcase: {
    position: 'relative',
    overflow: 'hidden',
    flex: '1 1 55%',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
    padding: theme.spacing(5, 7),
    color: '#ffffff',
    background: 'radial-gradient(circle at 70% 35%, #123f86 0%, #0a2453 40%, #050f26 100%)',
    [theme.breakpoints.down('md')]: {
      display: 'none',
    },
    '@media (max-height: 820px)': {
      gap: theme.spacing(2),
      padding: theme.spacing(3, 6),
      '& canvas': {
        width: '250px !important',
      },
      '& h1': {
        fontSize: '2rem',
      },
    },
  },
  stars: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.6), transparent),'
      + 'radial-gradient(1px 1px at 80% 10%, rgba(255,255,255,.5), transparent),'
      + 'radial-gradient(1px 1px at 60% 80%, rgba(255,255,255,.4), transparent),'
      + 'radial-gradient(1px 1px at 35% 65%, rgba(255,255,255,.35), transparent),'
      + 'radial-gradient(1px 1px at 90% 55%, rgba(255,255,255,.45), transparent)',
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1,
  },
  brandLogo: {
    height: 64,
    width: 'auto',
    alignSelf: 'flex-start',
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    zIndex: 1,
    flex: 1,
    [theme.breakpoints.down('lg')]: {
      flexDirection: 'column-reverse',
      alignItems: 'flex-start',
    },
  },
  heroText: {
    flex: 1,
    minWidth: 300,
  },
  headline: {
    fontWeight: 800,
    lineHeight: 1.15,
    fontSize: '2.3rem',
    '& span': {
      color: '#0eabf1',
    },
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: theme.spacing(2),
    zIndex: 1,
  },
  feature: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: theme.spacing(1),
    '& svg': {
      fontSize: 34,
      color: '#5cc8f7',
      filter: 'drop-shadow(0 0 6px rgba(14,171,241,.6))',
    },
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    zIndex: 1,
    borderRadius: 16,
    padding: theme.spacing(2, 1),
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(8px)',
    '& > div': {
      textAlign: 'center',
      padding: theme.spacing(0, 1),
    },
    '& > div + div': {
      borderLeft: '1px solid rgba(255,255,255,0.14)',
    },
  },
  statValue: {
    fontWeight: 800,
    fontSize: '1.5rem',
  },
  tagline: {
    zIndex: 1,
    textAlign: 'center',
    fontFamily: '"Dancing Script", cursive',
    fontSize: '1.9rem',
    color: '#d6ecff',
  },
  formSide: {
    position: 'relative',
    flex: '1 1 45%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(10, 4, 4),
    background: '#ffffff',
    color: '#1b2540',
    [theme.breakpoints.down('md')]: {
      background: 'linear-gradient(180deg, #0a2453 0px, #0a2453 180px, #ffffff 180px)',
    },
  },
  form: {
    maxWidth: theme.spacing(56),
    width: '100%',
    padding: theme.spacing(4),
    borderRadius: 16,
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(3, 2.5),
    },
    background: '#ffffff',
    [theme.breakpoints.down('md')]: {
      boxShadow: '0 10px 30px rgba(10, 36, 83, 0.18)',
    },
  },
  footer: {
    marginTop: theme.spacing(4),
    textAlign: 'center',
    color: '#7a8399',
  },
}));

// "value:label;value:label" -> [{ value, label }]
const parseStats = (text) => text.split(';').map((item) => {
  const [value, ...label] = item.split(':');
  return { value: value.trim(), label: label.join(':').trim() };
}).filter((item) => item.value);

const LoginLayout = ({ children }) => {
  const { classes } = useStyles();
  const t = useTranslation();

  const title = useBrandAttribute('title') || BRAND_NAME;
  const logoInverted = useBrandAttribute('logoInverted');
  const headline = useBrandAttribute('loginHeadline') || t('loginHeadlineDefault');
  const text = useBrandAttribute('loginText') || t('loginTextDefault');
  const tagline = useBrandAttribute('loginTagline') || t('loginTaglineDefault');
  const configuredStats = parseStats(useBrandAttribute('loginStats') || t('loginStatsDefault'));
  const [live, setLive] = useState(null);

  // real figures when the administrator enables them (server attribute loginLiveStats)
  useEffect(() => {
    fetch('/api/sims/public').then((response) => (response.ok ? response.json() : null)).then(setLive).catch(() => {});
  }, []);

  const stats = live && live.activeSims > 0 ? [
    { value: live.activeSims.toLocaleString('es-PE'), label: t('loginStatSims') },
    { value: live.availability != null ? `${live.availability}%` : '—', label: t('loginStatAvailability') },
    { value: live.clients.toLocaleString('es-PE'), label: t('loginStatClients') },
    { value: '24/7', label: t('loginStatSupport') },
  ] : configuredStats;

  // last word of the headline in the accent color, as in the brand artwork
  const words = headline.split(' ');
  const accent = words.length > 2 ? words.pop() : null;

  const features = [
    { icon: <PublicIcon />, label: t('loginFeatureCoverage') },
    { icon: <CloudDoneIcon />, label: t('loginFeatureAvailability') },
    { icon: <GppGoodIcon />, label: t('loginFeatureSecurity') },
    { icon: <SupportAgentIcon />, label: t('loginFeatureSupport') },
  ];

  return (
    <main className={classes.root}>
      <section className={classes.showcase}>
        <div className={classes.stars} />
        <div className={classes.brand}>
          <img className={classes.brandLogo} src={logoInverted || BRAND_LOGO_WHITE} alt={title} />
        </div>
        <div className={classes.hero}>
          <div className={classes.heroText}>
            <Typography component="h1" className={classes.headline}>
              {words.join(' ')}
              {accent && (
                <>
                  {' '}
                  <span>{accent}</span>
                </>
              )}
            </Typography>
            <Typography sx={{ mt: 2, opacity: 0.85, maxWidth: 420 }}>{text}</Typography>
          </div>
          <Box sx={{ flexShrink: 0 }}>
            <GlobeCanvas size={360} />
          </Box>
        </div>
        <div className={classes.features}>
          {features.map((feature) => (
            <div key={feature.label} className={classes.feature}>
              {feature.icon}
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{feature.label}</Typography>
            </div>
          ))}
        </div>
        {stats.length > 0 && (
          <div className={classes.stats} style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className={classes.statValue}>{stat.value}</div>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>{stat.label}</Typography>
              </div>
            ))}
          </div>
        )}
        <div className={classes.tagline}>{tagline}</div>
      </section>
      <section className={classes.formSide}>
        <form className={classes.form}>
          {children}
        </form>
        <Typography variant="caption" className={classes.footer}>
          <strong>{title}</strong>
          <br />
          {`Powered by ${BRAND_NAME}`}
        </Typography>
      </section>
    </main>
  );
};

export default LoginLayout;
