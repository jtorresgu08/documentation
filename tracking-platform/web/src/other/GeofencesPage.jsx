import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Divider, Typography, IconButton, Toolbar,
  Paper, Menu, MenuItem, ListItemText, ListSubheader,
} from '@mui/material';
import Tooltip from '@mui/material/Tooltip';
import { makeStyles } from 'tss-react/mui';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useNavigate } from 'react-router-dom';
import MapView from '../map/core/MapView';
import MapCurrentLocation from '../map/MapCurrentLocation';
import GeofenceCreatePanel from './GeofenceCreatePanel';
import GeofenceImportPanel from './GeofenceImportPanel';
import { EXPORT_FORMATS, exportGeofences } from './geofenceFormats';
import MapGeofenceEdit from '../map/draw/MapGeofenceEdit';
import GeofencesList from './GeofencesList';
import { useTranslation } from '../common/components/LocalizationProvider';
import MapGeocoder from '../map/geocoder/MapGeocoder';
import { errorsActions } from '../store';
import MapScale from '../map/MapScale';
import BackIcon from '../common/components/BackIcon';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  content: {
    flexGrow: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column-reverse',
    },
  },
  drawer: {
    display: 'flex',
    flexDirection: 'column',
    [theme.breakpoints.up('sm')]: {
      width: theme.dimensions.drawerWidthDesktop,
    },
    [theme.breakpoints.down('sm')]: {
      height: theme.dimensions.drawerHeightPhone,
    },
  },
  mapContainer: {
    flexGrow: 1,
  },
  title: {
    flexGrow: 1,
  },
}));

const GeofencesPage = () => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const [selectedGeofenceId, setSelectedGeofenceId] = useState();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportAnchor, setExportAnchor] = useState(null);
  const geofences = useSelector((state) => state.geofences.items);

  const handleExport = async (format) => {
    setExportAnchor(null);
    try {
      const blob = await exportGeofences(Object.values(geofences), format.id, t('sharedGeofences'));
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `geocercas-${new Date().toISOString().slice(0, 10)}.${format.extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
      dispatch(errorsActions.push(error.message));
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.content}>
        <Paper square className={classes.drawer}>
          <Toolbar>
            <IconButton edge="start" sx={{ mr: 2 }} onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Typography variant="h6" className={classes.title}>{t('sharedGeofences')}</Typography>
            <Tooltip title={t('geofenceImport')}>
              <IconButton onClick={() => { setCreating(false); setImporting(true); }}>
                <UploadFileIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('geofenceExport')}>
              <span>
                <IconButton edge="end" aria-label={t('geofenceExport')} disabled={!Object.keys(geofences).length} onClick={(event) => setExportAnchor(event.currentTarget)}>
                  <FileDownloadIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
              <ListSubheader sx={{ lineHeight: '32px' }}>{t('geofenceExportAll').replace('{0}', Object.keys(geofences).length)}</ListSubheader>
              {EXPORT_FORMATS.map((format) => (
                <MenuItem key={format.id} onClick={() => handleExport(format)}>
                  <ListItemText primary={format.label} secondary={format.description} />
                </MenuItem>
              ))}
            </Menu>
          </Toolbar>
          <Divider />
          <GeofencesList onGeofenceSelected={setSelectedGeofenceId} />
        </Paper>
        <div className={classes.mapContainer}>
          <MapView>
            <MapGeofenceEdit selectedGeofenceId={selectedGeofenceId} onCreateByCoordinates={() => { setImporting(false); setCreating(true); }} />
          </MapView>
          {creating && <GeofenceCreatePanel onClose={() => setCreating(false)} />}
          {importing && <GeofenceImportPanel onClose={() => setImporting(false)} />}
          <MapScale />
          <MapCurrentLocation />
          <MapGeocoder />
        </div>
      </div>
    </div>
  );
};

export default GeofencesPage;
