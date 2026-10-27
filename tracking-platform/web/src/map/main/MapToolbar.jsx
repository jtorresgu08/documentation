import { Fragment } from 'react';
import {
  Chip, Divider, IconButton, Paper, Tooltip,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import PolylineIcon from '@mui/icons-material/Polyline';
import LabelIcon from '@mui/icons-material/Label';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import NavigationIcon from '@mui/icons-material/Navigation';
import StraightenIcon from '@mui/icons-material/Straighten';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import { useTranslation } from '../../common/components/LocalizationProvider';

const useStyles = makeStyles()((theme) => ({
  root: {
    position: 'absolute',
    right: 10,
    bottom: 44,
    // below the device list, which covers the map on phones
    zIndex: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing(1),
    '@media print': {
      display: 'none',
    },
  },
  bar: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: theme.shape.borderRadius * 3,
    backgroundColor: theme.palette.primary.main,
  },
  button: {
    borderRadius: 0,
    width: 44,
    height: 44,
    color: theme.palette.primary.contrastText,
  },
  active: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.36)',
    },
  },
}));

// Vertical tool bar on the right side of the map, toggles are kept by the caller
const MapToolbar = ({ tools, distance }) => {
  const { classes, cx } = useStyles();
  const t = useTranslation();

  const items = [
    { key: 'fit', title: t('mapFitAll'), icon: <FitScreenIcon />, action: true },
    { key: 'geofences', title: t('sharedGeofences'), icon: <PolylineIcon /> },
    { key: 'labels', title: t('mapShowLabels'), icon: <LabelIcon /> },
    { key: 'cluster', title: t('mapCluster'), icon: <BubbleChartIcon /> },
    { key: 'follow', title: t('mapFollowSelected'), icon: <NavigationIcon /> },
    { key: 'ruler', title: t('mapRuler'), icon: <StraightenIcon /> },
    { key: 'fullscreen', title: t('mapFullscreen'), icon: <FullscreenIcon />, action: true },
  ];

  return (
    <div className={classes.root}>
      {distance !== null && (
        <Chip
          color="primary"
          label={distance > 0 ? `${distance.toFixed(2)} km` : t('mapRulerHint')}
          sx={{ fontWeight: 600, boxShadow: 2 }}
        />
      )}
      <Paper elevation={4} className={classes.bar}>
        {items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.25)' }} />}
            <Tooltip title={item.title} placement="left">
              <IconButton
                className={cx(classes.button, !item.action && tools.values[item.key] && classes.active)}
                onClick={() => tools.toggle(item.key)}
                aria-label={item.title}
                aria-pressed={item.action ? undefined : Boolean(tools.values[item.key])}
              >
                {item.icon}
              </IconButton>
            </Tooltip>
          </Fragment>
        ))}
      </Paper>
    </div>
  );
};

export default MapToolbar;
