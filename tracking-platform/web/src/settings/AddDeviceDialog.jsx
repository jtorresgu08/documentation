import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, MenuItem, Stack, Switch,
  Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useManager } from '../common/util/permissions';
import { useEffectAsync } from '../reactHelper';
import { devicesActions } from '../store';
import fetchOrThrow from '../common/util/fetchOrThrow';
import deviceCategories from '../common/util/deviceCategories';
import deviceModels, { instructionsFor } from '../common/util/deviceModels';
import { mapIconKey, mapIcons } from '../map/core/preloadImages';
import { MAX_CHANNELS, dashcamKeys } from '../common/util/dashcam';

const capitalize = (value) => value.replace(/^\w/, (c) => c.toUpperCase());

const parseBulk = (text) => text.split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [uniqueId, ...name] = line.split(/[,;\t]/);
    return { uniqueId: uniqueId.trim(), name: name.join(' ').trim() || uniqueId.trim() };
  });

// Quick unit creation in one dialog, GPS-Server style: model -> protocol and port, users, icon and camera
const AddDeviceDialog = ({
  open, onClose, initialUniqueId, initialProtocol,
}) => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const admin = useAdministrator();
  const manager = useManager();

  const groups = useSelector((state) => state.groups.items);
  const deviceHost = useSelector((state) => state.session.server.attributes.deviceHost) || window.location.hostname;

  const [tab, setTab] = useState('main');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [item, setItem] = useState({});
  const [model, setModel] = useState(null);
  const [userIds, setUserIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [camera, setCamera] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setTab('main');
      setBulk(false);
      setBulkText('');
      setItem({ uniqueId: initialUniqueId || '', active: true, category: 'car' });
      const suggested = initialProtocol ? deviceModels.find((it) => it.protocol === initialProtocol) : null;
      setModel(suggested || null);
      setUserIds([]);
      setCamera(suggested?.camera || {});
      setResult(null);
    }
  }, [open, initialUniqueId, initialProtocol]);

  useEffectAsync(async () => {
    if (open && manager) {
      const response = await fetchOrThrow('/api/users');
      setUsers((await response.json()).filter((user) => !user.temporary));
    }
  }, [open, manager]);

  const selectModel = (value) => {
    setModel(value);
    setCamera(value?.camera || {});
    if (value?.category) {
      setItem((current) => ({ ...current, category: value.category }));
    }
  };

  const entries = useMemo(
    () => (bulk ? parseBulk(bulkText) : [{ uniqueId: item.uniqueId?.trim(), name: item.name?.trim() }]),
    [bulk, bulkText, item.uniqueId, item.name],
  );
  const valid = entries.length > 0 && entries.every((entry) => entry.uniqueId && entry.name);

  const save = async () => {
    setSaving(true);
    const created = [];
    const failed = [];
    for (const entry of entries) {
      const attributes = {};
      if (camera.kind) {
        attributes[dashcamKeys.kind] = camera.kind;
        attributes[dashcamKeys.channels] = camera.channels || 2;
        if (camera.protocol) {
          attributes[dashcamKeys.protocol] = camera.protocol;
        }
      }
      try {
        const response = await fetchOrThrow('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: entry.name,
            uniqueId: entry.uniqueId,
            phone: bulk ? null : item.phone || null,
            model: model ? model.deviceModel || `${model.brand} ${model.model}` : null,
            category: item.category,
            groupId: item.groupId || 0,
            disabled: !item.active,
            expirationTime: admin && item.expirationTime ? new Date(item.expirationTime).toISOString() : null,
            attributes,
          }),
        });
        const device = await response.json();
        for (const userId of userIds) {
          await fetchOrThrow('/api/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, deviceId: device.id }),
          });
        }
        created.push(device);
      } catch (error) {
        failed.push({ ...entry, error: error.message });
      }
    }
    if (created.length) {
      dispatch(devicesActions.update(created));
    }
    setSaving(false);
    setResult({ created, failed });
  };

  const sms = instructionsFor(model, deviceHost);

  const instructions = model && (
    <Alert severity="info" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
      <Typography variant="subtitle2" gutterBottom>{t('addDeviceConfigure')}</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={`${t('addDeviceServer')}: ${deviceHost}`} />
        <Chip size="small" color="primary" label={`${t('addDevicePort')}: ${model.port} TCP`} />
        <Chip size="small" variant="outlined" label={`${t('addDeviceProtocol')}: ${model.protocol}`} />
      </Stack>
      {sms && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <Typography variant="body2">{`${t('addDeviceSms')}:`}</Typography>
          <Box component="code" sx={{ bgcolor: 'action.hover', px: 1, py: 0.25, borderRadius: 1 }}>{sms}</Box>
          <Tooltip title={t('addDeviceCopy')}>
            <IconButton size="small" onClick={() => navigator.clipboard?.writeText(sms)}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      )}
    </Alert>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>{t('addDeviceTitle')}</Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      {result ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              {result.created.length > 0 && (
                <Alert severity="success">
                  {`${t('addDeviceCreated')}: ${result.created.map((device) => device.name).join(', ')}`}
                </Alert>
              )}
              {result.failed.map((entry) => (
                <Alert key={entry.uniqueId} severity="error">{`${entry.name} (${entry.uniqueId}): ${entry.error}`}</Alert>
              ))}
              {result.created.length > 0 && instructions}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResult(null)}>{t('addDeviceAnother')}</Button>
            <Button variant="contained" onClick={onClose}>{t('addDeviceDone')}</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" sx={{ px: 2 }}>
            <Tab value="main" label={t('addDeviceMain')} />
            {manager && <Tab value="users" label={t('settingsUsers')} />}
            <Tab value="icon" label={t('addDeviceIcon')} />
            <Tab value="camera" label={t('dashcamSettings')} />
          </Tabs>
          <DialogContent sx={{ minHeight: 420 }}>
            {tab === 'main' && (
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormControlLabel
                    control={<Switch checked={!!item.active} onChange={(event) => setItem({ ...item, active: event.target.checked })} />}
                    label={t('addDeviceActive')}
                  />
                  <FormControlLabel
                    control={<Switch checked={bulk} onChange={(event) => setBulk(event.target.checked)} />}
                    label={t('addDeviceBulk')}
                  />
                </Stack>
                {bulk ? (
                  <TextField
                    label={t('addDeviceBulkList')}
                    helperText={`${t('addDeviceBulkHelp')} (${entries.length})`}
                    multiline
                    minRows={5}
                    value={bulkText}
                    onChange={(event) => setBulkText(event.target.value)}
                    placeholder={'869731054158804, Camión 15\n869731054158812, Camión 16'}
                  />
                ) : (
                  <>
                    <TextField
                      label={t('sharedName')}
                      value={item.name || ''}
                      onChange={(event) => setItem({ ...item, name: event.target.value })}
                      required
                      autoFocus
                    />
                    <TextField
                      label={t('addDeviceImei')}
                      value={item.uniqueId || ''}
                      onChange={(event) => setItem({ ...item, uniqueId: event.target.value.replace(/\s/g, '') })}
                      helperText={t('deviceIdentifierHelp')}
                      required
                    />
                  </>
                )}
                <Autocomplete
                  options={deviceModels}
                  groupBy={(option) => option.brand}
                  getOptionLabel={(option) => option.model}
                  value={model}
                  onChange={(_, value) => selectModel(value)}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Box sx={{ flexGrow: 1 }}>{option.model}</Box>
                      <Chip size="small" variant="outlined" label={`${option.protocol} · ${option.port}`} />
                    </li>
                  )}
                  renderInput={(params) => <TextField {...params} label={t('addDeviceModel')} />}
                />
                {!bulk && (
                  <TextField
                    label={t('addDeviceSim')}
                    value={item.phone || ''}
                    onChange={(event) => setItem({ ...item, phone: event.target.value })}
                  />
                )}
                <TextField
                  select
                  label={t('groupParent')}
                  value={item.groupId || 0}
                  onChange={(event) => setItem({ ...item, groupId: Number(event.target.value) })}
                >
                  <MenuItem value={0}>{t('deviceNoGroup')}</MenuItem>
                  {Object.values(groups).map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
                </TextField>
                {admin && (
                  <TextField
                    label={t('userExpirationTime')}
                    type="date"
                    value={item.expirationTime || ''}
                    onChange={(event) => setItem({ ...item, expirationTime: event.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
                {instructions}
              </Stack>
            )}
            {tab === 'users' && (
              <List dense>
                {users.length === 0 && <Typography variant="body2" color="text.secondary">{t('addDeviceNoUsers')}</Typography>}
                {users.map((user) => (
                  <ListItem key={user.id} disablePadding>
                    <ListItemButton onClick={() => setUserIds(userIds.includes(user.id)
                      ? userIds.filter((id) => id !== user.id) : [...userIds, user.id])}
                    >
                      <ListItemIcon><Checkbox edge="start" checked={userIds.includes(user.id)} tabIndex={-1} disableRipple /></ListItemIcon>
                      <ListItemText primary={user.name} secondary={user.email} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
            {tab === 'icon' && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1, pt: 1 }}>
                {deviceCategories.map((category) => (
                  <Button
                    key={category}
                    variant={item.category === category ? 'contained' : 'outlined'}
                    onClick={() => setItem({ ...item, category })}
                    sx={{ flexDirection: 'column', py: 1.5, textTransform: 'none' }}
                  >
                    <Box
                      component="img"
                      src={mapIcons[mapIconKey(category)]}
                      alt=""
                      sx={{ width: 28, height: 28, filter: item.category === category ? 'brightness(0) invert(1)' : 'none' }}
                    />
                    <Typography variant="caption" noWrap>{t(`category${capitalize(category)}`)}</Typography>
                  </Button>
                ))}
              </Box>
            )}
            {tab === 'camera' && (
              <Stack spacing={2} sx={{ pt: 1 }}>
                <TextField
                  select
                  label={t('dashcamKind')}
                  value={camera.kind || ''}
                  onChange={(event) => setCamera({ ...camera, kind: event.target.value || undefined })}
                >
                  <MenuItem value="">{t('dashcamKindNone')}</MenuItem>
                  <MenuItem value="dashcam">{t('dashcamKindDashcam')}</MenuItem>
                  <MenuItem value="mdvr">{t('dashcamKindMdvr')}</MenuItem>
                </TextField>
                {camera.kind && (
                  <>
                    <TextField
                      select
                      label={t('dashcamChannels')}
                      value={camera.channels || 2}
                      onChange={(event) => setCamera({ ...camera, channels: Number(event.target.value) })}
                      helperText={t('dashcamChannelsHelp')}
                    >
                      {Array.from({ length: MAX_CHANNELS }, (_, index) => index + 1).map((value) => (
                        <MenuItem key={value} value={value}>{value}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label={t('dashcamProtocol')}
                      value={camera.protocol || ''}
                      onChange={(event) => setCamera({ ...camera, protocol: event.target.value || undefined })}
                    >
                      <MenuItem value="">{t('dashcamProtocolAuto')}</MenuItem>
                      <MenuItem value="jt808">{t('dashcamProtocolJt808')}</MenuItem>
                      <MenuItem value="jimi">{t('dashcamProtocolJimi')}</MenuItem>
                    </TextField>
                  </>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>{t('sharedCancel')}</Button>
            <Button variant="contained" onClick={save} disabled={!valid || saving}>
              {bulk ? `${t('sharedSave')} (${entries.length})` : t('sharedSave')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default AddDeviceDialog;
