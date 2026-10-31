import { useRef, useState } from 'react';
import {
  Box, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import FilterNoneIcon from '@mui/icons-material/FilterNone';
import { useTranslation } from '../common/components/LocalizationProvider';
import { closePanel, focusPanel, updatePanel } from '../common/util/floatingPanels';

const TOP = 72;
const MARGIN = 16;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Window frame shared by every floating panel: glass card that can be moved by its header, resized from the corner,
// minimized to its header, maximized and closed; the last one touched comes to the front. Position and size are kept
// in the panel store so workspaces can restore them. On phones it becomes a sheet at the bottom of the screen.
const FloatingPanel = ({
  panel, onTop, icon, color, title, subtitle, actions, footer, children, width: defaultWidth = 380, height: defaultHeight,
  minWidth = 300, onClose, padding = true,
}) => {
  const theme = useTheme();
  const t = useTranslation();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const accent = color || theme.palette.primary.main;
  const [maximized, setMaximized] = useState(false);
  const drag = useRef(null);
  const resize = useRef(null);
  const [live, setLive] = useState(null);

  const base = (() => {
    const width = clamp(panel.geometry?.width || defaultWidth, minWidth, window.innerWidth - 2 * MARGIN);
    const height = panel.geometry?.height || defaultHeight || null;
    // new panels line up from the right edge leftwards, then start another row slightly lower
    const perRow = Math.max(1, Math.floor((window.innerWidth - 150) / (width + 12)));
    const column = panel.cascade % perRow;
    const row = Math.floor(panel.cascade / perRow);
    const x = panel.geometry?.x ?? window.innerWidth - 64 - width - column * (width + 12) - row * 24;
    const y = panel.geometry?.y ?? TOP - 8 + row * 44;
    return {
      x: clamp(x, 0, window.innerWidth - 120), y: clamp(y, 0, window.innerHeight - 48), width, height,
    };
  })();
  const geometry = live || base;

  const save = (value) => {
    setLive(null);
    updatePanel(panel.id, { geometry: value });
  };

  const startDrag = (event) => {
    if (!desktop || maximized || event.target.closest('button, input, textarea, a, [role="combobox"], [role="tab"], .MuiSelect-select')) {
      return;
    }
    focusPanel(panel.id);
    drag.current = { dx: event.clientX - geometry.x, dy: event.clientY - geometry.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (drag.current) {
      setLive({
        ...geometry,
        x: clamp(event.clientX - drag.current.dx, -geometry.width + 120, window.innerWidth - 120),
        y: clamp(event.clientY - drag.current.dy, 0, window.innerHeight - 48),
      });
    }
  };
  const endDrag = () => {
    if (drag.current) {
      drag.current = null;
      if (live) save(live);
    }
  };

  const box = useRef(null);
  const startResize = (event) => {
    event.stopPropagation();
    const rect = box.current.getBoundingClientRect();
    resize.current = {
      x: event.clientX, y: event.clientY, width: rect.width, height: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event) => {
    if (resize.current) {
      setLive({
        ...geometry,
        width: clamp(resize.current.width + event.clientX - resize.current.x, minWidth, window.innerWidth - geometry.x - 8),
        height: clamp(resize.current.height + event.clientY - resize.current.y, 160, window.innerHeight - geometry.y - 8),
      });
    }
  };
  const endResize = () => {
    if (resize.current) {
      resize.current = null;
      if (live) save(live);
    }
  };

  const close = () => {
    if (onClose) onClose();
    closePanel(panel.id);
  };

  let placement;
  if (!desktop) {
    placement = { left: 8, right: 8, bottom: 8, maxHeight: '62vh' };
  } else if (maximized) {
    placement = { inset: MARGIN };
  } else {
    placement = {
      left: geometry.x,
      top: geometry.y,
      width: geometry.width,
      ...(geometry.height && !panel.minimized ? { height: geometry.height } : { maxHeight: `calc(100vh - ${geometry.y + MARGIN}px)` }),
    };
  }

  return (
    <Box
      ref={box}
      onPointerDown={() => focusPanel(panel.id)}
      sx={{
        position: 'fixed',
        zIndex: theme.zIndex.appBar + (onTop ? 3 : 2),
        ...placement,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '18px',
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, 0.86),
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
        boxShadow: onTop ? '0 18px 48px rgba(15,27,45,0.22)' : '0 8px 24px rgba(15,27,45,0.14)',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onDoubleClick={() => desktop && setMaximized(!maximized)}
        sx={{
          px: 1.5, py: 1, cursor: desktop && !maximized ? 'move' : 'default', userSelect: 'none', flexShrink: 0,
        }}
      >
        <Box sx={{
          width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: alpha(accent, 0.13), color: accent, flexShrink: 0,
        }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary" noWrap component="div">{subtitle}</Typography>}
        </Box>
        {!panel.minimized && actions}
        <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
          <Tooltip title={panel.minimized ? t('videoRestore') : t('videoMinimize')}>
            <IconButton size="small" onClick={() => updatePanel(panel.id, { minimized: !panel.minimized })} aria-label={t('videoMinimize')}><RemoveIcon fontSize="small" /></IconButton>
          </Tooltip>
          {desktop && (
            <Tooltip title={maximized ? t('videoRestore') : t('videoMaximize')}>
              <IconButton size="small" onClick={() => setMaximized(!maximized)} aria-label={t('videoMaximize')}>
                {maximized ? <FilterNoneIcon sx={{ fontSize: 16 }} /> : <CropSquareIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t('sharedHide')}>
            <IconButton size="small" onClick={close} aria-label={t('sharedHide')}><CloseIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {!panel.minimized && (
        <>
          <Box sx={{
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', ...(padding ? { px: 1.5, pb: 1.25 } : {}),
          }}
          >
            {children}
          </Box>
          {(footer || (desktop && !maximized)) && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 0.5, minHeight: 20, flexShrink: 0, borderTop: footer ? `1px solid ${alpha(theme.palette.divider, 0.5)}` : 'none' }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>{footer}</Box>
              {desktop && !maximized && (
                <Box
                  onPointerDown={startResize}
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  aria-hidden="true"
                  sx={{
                    width: 14, height: 14, cursor: 'nwse-resize', mr: -0.75, flexShrink: 0,
                    background: `linear-gradient(135deg, transparent 50%, ${alpha(theme.palette.text.secondary, 0.5)} 50%, ${alpha(theme.palette.text.secondary, 0.5)} 60%, transparent 60%, transparent 70%, ${alpha(theme.palette.text.secondary, 0.5)} 70%, ${alpha(theme.palette.text.secondary, 0.5)} 80%, transparent 80%)`,
                  }}
                />
              )}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
};

export default FloatingPanel;
