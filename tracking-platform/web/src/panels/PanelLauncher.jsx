import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Badge, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton,
  ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import WidgetsIcon from '@mui/icons-material/Widgets';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ReplayIcon from '@mui/icons-material/Replay';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import BuildIcon from '@mui/icons-material/Build';
import PentagonIcon from '@mui/icons-material/Pentagon';
import NearMeIcon from '@mui/icons-material/NearMe';
import StraightenIcon from '@mui/icons-material/Straighten';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import SaveIcon from '@mui/icons-material/Save';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import {
  closeAllPanels, openPanel, restorePanels, snapshotPanels, usePanels,
} from '../common/util/floatingPanels';
import { parseWorkspaces, saveWorkspaces } from './workspaces';
import { usePolling } from './panelUtils';
import { useModules } from '../common/util/permissions';

const PANEL_MODULES = {
  fuel: 'fuel', maintenance: 'maintenance', chat: 'chat', cameraWall: 'video',
};

const GROUPS = [
  ['panelGroupOperation', [
    ['alerts', 'panelAlerts', NotificationsActiveIcon],
    ['unit', 'panelUnit', DirectionsCarIcon],
    ['replay', 'panelReplay', ReplayIcon],
    ['fuel', 'panelFuel', LocalGasStationIcon],
  ]],
  ['panelGroupFleet', [
    ['fleet', 'panelFleet', DashboardIcon],
    ['quality', 'qualityTitle', SignalCellularAltIcon],
    ['maintenance', 'panelMaintenance', BuildIcon],
    ['geofences', 'panelGeofences', PentagonIcon],
  ]],
  ['panelGroupTools', [
    ['nearest', 'panelNearest', NearMeIcon],
    ['measure', 'panelMeasure', StraightenIcon],
    ['commands', 'panelCommands', SendIcon],
    ['chat', 'panelChat', ChatIcon],
  ]],
  ['panelGroupMonitoring', [
    ['cameraWall', 'panelCameraWall', ViewModuleIcon],
  ]],
];

// "Panels" button on the map: opens any floating panel and manages the workspaces (save the open panels with their
// layout, restore one, mark the one to open after login). The badge counts new messages from drivers.
const PanelLauncher = () => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.session.user);
  const selectedId = useSelector((state) => state.devices.selectedId);
  const firstDevice = useSelector((state) => Object.values(state.devices.items)[0]?.id);
  const panels = usePanels();
  const hasModule = useModules();
  const [anchor, setAnchor] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [seen, setSeen] = useState(() => dayjs().toISOString());
  const [unread, setUnread] = useState([]);
  const { items, defaultName } = parseWorkspaces(user);

  usePolling(async () => {
    if (!hasModule('chat')) return;
    try {
      setUnread(await (await fetchOrThrow(`/api/chat/recent?since=${encodeURIComponent(seen)}`)).json());
    } catch {
      // chat not available
    }
  }, 30000, [seen]);

  const open = (kind) => {
    setAnchor(null);
    const deviceId = selectedId || firstDevice;
    if (kind === 'unit') {
      openPanel('unit', { deviceId });
    } else if (kind === 'chat') {
      openPanel('chat', { deviceId: unread[0]?.deviceId || deviceId }, { id: 'chat' });
      setSeen(dayjs().toISOString());
      setUnread([]);
    } else if (kind === 'commands') {
      openPanel('commands', { deviceIds: selectedId ? [selectedId] : [] });
    } else if (kind === 'replay' || kind === 'fuel') {
      openPanel(kind, selectedId ? { deviceId: selectedId } : {}, { id: kind });
    } else {
      openPanel(kind);
    }
  };

  const persist = async (list, name) => {
    try {
      await saveWorkspaces(dispatch, user, list, name);
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async () => {
    const list = [...items.filter((item) => item.name !== saving.name.trim()), { name: saving.name.trim(), panels: snapshotPanels() }];
    await persist(list, saving.makeDefault ? saving.name.trim() : (defaultName === saving.name.trim() ? null : defaultName));
    setSaving(null);
  };

  return (
    <>
      <Box sx={{
        position: 'absolute', top: 10, right: 56, zIndex: 3, '@media print': { display: 'none' },
      }}
      >
        <Badge color="error" badgeContent={unread.length} overlap="rectangular">
          <Button
            variant="contained"
            startIcon={<WidgetsIcon />}
            onClick={(event) => setAnchor(event.currentTarget)}
            sx={{ borderRadius: '12px', boxShadow: '0 6px 18px rgba(15,27,45,0.18)' }}
          >
            {`${t('panelLauncher')}${panels.length ? ` · ${panels.length}` : ''}`}
          </Button>
        </Badge>
      </Box>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 300, maxHeight: '80vh', borderRadius: '14px' } } }}
      >
        {GROUPS.map(([group, kinds]) => [
          <ListSubheader key={group} sx={{ lineHeight: '30px', bgcolor: 'transparent', fontWeight: 700 }}>{t(group)}</ListSubheader>,
          ...kinds.filter(([kind]) => hasModule(PANEL_MODULES[kind])).map(([kind, label, Icon]) => (
            <MenuItem key={kind} dense onClick={() => open(kind)}>
              <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
              <ListItemText>{t(label)}</ListItemText>
              {kind === 'chat' && unread.length > 0 && <Badge color="error" badgeContent={unread.length} sx={{ mr: 1 }} />}
            </MenuItem>
          )),
        ])}
        <Divider />
        <ListSubheader sx={{ lineHeight: '30px', bgcolor: 'transparent', fontWeight: 700 }}>{t('panelWorkspaces')}</ListSubheader>
        {!items.length && <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, pb: 1 }}>{t('panelNoWorkspaces')}</Typography>}
        {items.map((item) => (
          <MenuItem key={item.name} dense onClick={() => { setAnchor(null); restorePanels(item.panels); }}>
            <ListItemText primary={item.name} secondary={`${item.panels.length} ${t('panelPanels')}`} />
            <Tooltip title={t('panelDefaultWorkspace')}>
              <IconButton size="small" onClick={(event) => { event.stopPropagation(); persist(items, defaultName === item.name ? null : item.name); }}>
                {defaultName === item.name ? <StarIcon fontSize="small" sx={{ color: '#f5a623' }} /> : <StarBorderIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={(event) => { event.stopPropagation(); persist(items.filter((other) => other !== item), defaultName === item.name ? null : defaultName); }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
        <MenuItem dense disabled={!panels.length} onClick={() => { setAnchor(null); setSaving({ name: '', makeDefault: !items.length }); }}>
          <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('panelSaveWorkspace')}</ListItemText>
        </MenuItem>
        <MenuItem dense disabled={!panels.length} onClick={() => { setAnchor(null); closeAllPanels(); }}>
          <ListItemIcon><CloseIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('panelCloseAll')}</ListItemText>
        </MenuItem>
        {error && <Typography variant="caption" color="error" component="div" sx={{ px: 2 }}>{error}</Typography>}
      </Menu>
      <Dialog open={Boolean(saving)} onClose={() => setSaving(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('panelSaveWorkspace')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{`${panels.length} ${t('panelPanels')}: ${t('panelSaveHint')}`}</Typography>
          <TextField autoFocus fullWidth label={t('sharedName')} placeholder={t('panelWorkspaceExample')} value={saving?.name || ''} onChange={(event) => setSaving({ ...saving, name: event.target.value })} />
          <FormControlLabel control={<Checkbox checked={Boolean(saving?.makeDefault)} onChange={(event) => setSaving({ ...saving, makeDefault: event.target.checked })} />} label={t('panelOpenOnLogin')} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaving(null)}>{t('sharedCancel')}</Button>
          <Button variant="contained" disabled={!saving?.name?.trim()} onClick={save}>{t('sharedSave')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PanelLauncher;
