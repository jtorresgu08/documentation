import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, List, ListItem, ListItemText, Tooltip, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from '../common/components/LocalizationProvider';

// One link per unit of the line for its driver's screen (no account needed); a new link disables the old one
const DriverLinksDialog = ({ route, onClose }) => {
  const t = useTranslation();
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = async (reset) => {
    const response = await fetch(`/api/transit/routes/${route.id}/driver-links${reset ? `?reset=${reset}` : ''}`, { method: 'POST' });
    if (response.ok) setLinks(await response.json());
    else setError((await response.text()).split('\n')[0]);
  };

  useEffect(() => {
    load();
  }, [route.id]);

  const url = (link) => `${window.location.origin}/bus/${link.token}`;
  const copy = async (link) => {
    try {
      await navigator.clipboard.writeText(url(link));
      setCopied(link.deviceId);
    } catch {
      setCopied(null);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t('transitDriverLinks')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('transitDriverLinksHelp')}</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {!links && !error && <LinearProgress />}
        {links && !links.length && <Alert severity="info">{t('transitNoUnits')}</Alert>}
        <List dense>
          {links?.map((link) => (
            <ListItem
              key={link.deviceId}
              divider
              secondaryAction={(
                <>
                  <Tooltip title={copied === link.deviceId ? t('transitCopied') : t('transitCopy')}><IconButton onClick={() => copy(link)}><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title="WhatsApp"><IconButton component="a" target="_blank" href={`https://wa.me/?text=${encodeURIComponent(`${route.name} · ${link.name}: ${url(link)}`)}`}><WhatsAppIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={t('transitOpen')}><IconButton component="a" target="_blank" href={url(link)}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={t('transitNewLink')}><IconButton onClick={() => load(link.deviceId)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                </>
              )}
            >
              <ListItemText primary={link.name} secondary={url(link)} slotProps={{ primary: { fontWeight: 600 }, secondary: { noWrap: true, sx: { pr: 18 } } }} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedHide')}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DriverLinksDialog;
