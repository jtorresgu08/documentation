import { Fragment, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import {
  Backdrop, Badge, Box, Chip, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Paper, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import ReactCountryFlag from 'react-country-flag';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import MenuIcon from '@mui/icons-material/Menu';
import NavigationIcon from '@mui/icons-material/Navigation';
import MapIcon from '@mui/icons-material/Map';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import EventIcon from '@mui/icons-material/Event';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ShareIcon from '@mui/icons-material/Share';
import SendIcon from '@mui/icons-material/Send';
import BarChartIcon from '@mui/icons-material/BarChart';
import PolylineIcon from '@mui/icons-material/Polyline';
import BuildIcon from '@mui/icons-material/Build';
import BadgeIcon from '@mui/icons-material/Badge';
import FolderIcon from '@mui/icons-material/Folder';
import TuneIcon from '@mui/icons-material/Tune';
import PaletteIcon from '@mui/icons-material/Palette';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import TireRepairIcon from '@mui/icons-material/TireRepair';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import ConstructionIcon from '@mui/icons-material/Construction';
import SimCardIcon from '@mui/icons-material/SimCard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import GavelIcon from '@mui/icons-material/Gavel';
import SettingsRemoteIcon from '@mui/icons-material/SettingsRemote';
import ShieldIcon from '@mui/icons-material/Shield';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import SpeedIcon from '@mui/icons-material/Speed';
import DnsIcon from '@mui/icons-material/Dns';
import CampaignIcon from '@mui/icons-material/Campaign';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import TodayIcon from '@mui/icons-material/Today';
import FunctionsIcon from '@mui/icons-material/Functions';
import PublishIcon from '@mui/icons-material/Publish';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import VideocamIcon from '@mui/icons-material/Videocam';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PaymentsIcon from '@mui/icons-material/Payments';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RuleIcon from '@mui/icons-material/Rule';
import TableChartIcon from '@mui/icons-material/TableChart';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import { useLocalization, useTranslation } from './LocalizationProvider';
import {
  useAdministrator, useManager, useModules, useRestriction,
} from '../util/permissions';
import useFeatures from '../util/useFeatures';
import usePersistedState from '../util/usePersistedState';
import useLogout from '../util/useLogout';
import { useBrandAttribute } from '../util/brand';
import { BRAND_LOGO } from '../util/brandDefaults';
import { useEffectAsync } from '../../reactHelper';

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 288;

const useStyles = makeStyles()((theme, { expanded, overlay }) => ({
  rail: {
    width: COLLAPSED_WIDTH,
    flexShrink: 0,
    height: '100%',
    '@media print': {
      display: 'none',
    },
  },
  railPushed: {
    width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
    transition: theme.transitions.create('width'),
  },
  panel: {
    position: overlay ? 'fixed' : 'relative',
    zIndex: overlay ? theme.zIndex.drawer + 2 : 7,
    top: 0,
    left: 0,
    height: '100%',
    width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
    transition: theme.transitions.create('width'),
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
    borderRadius: 0,
    backgroundColor: theme.palette.background.default,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    minHeight: 72,
    padding: theme.spacing(1, 1.5),
    gap: theme.spacing(1),
  },
  logo: {
    height: 40,
    maxWidth: 170,
    objectFit: 'contain',
    color: theme.palette.primary.main,
  },
  brandName: {
    fontWeight: 700,
    lineHeight: 1.1,
    color: theme.palette.primary.main,
  },
  collapseButton: {
    marginLeft: 'auto',
    borderRadius: theme.shape.borderRadius * 2,
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.primary.main,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: theme.spacing(1),
  },
  item: {
    borderRadius: 999,
    marginBottom: theme.spacing(0.5),
    minHeight: 44,
    paddingLeft: theme.spacing(1.5),
    '&.Mui-selected, &.Mui-selected:hover': {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      '& .MuiListItemIcon-root': {
        color: theme.palette.primary.contrastText,
      },
    },
  },
  itemIcon: {
    minWidth: 40,
    color: theme.palette.text.primary,
  },
  itemText: {
    whiteSpace: 'nowrap',
  },
  footer: {
    padding: theme.spacing(1),
  },
}));

const NavItem = ({
  item, expanded, selected, onNavigate, classes,
}) => {
  const content = (
    <ListItemButton
      className={classes.item}
      selected={selected}
      disabled={item.disabled}
      component={item.href ? Link : 'div'}
      to={item.href}
      onClick={(event) => {
        if (item.onClick) {
          item.onClick(event);
        }
        onNavigate();
      }}
    >
      <ListItemIcon className={classes.itemIcon}>
        {item.badge && !expanded ? (
          <Badge color="primary" variant="dot">{item.icon}</Badge>
        ) : item.icon}
      </ListItemIcon>
      {expanded && (
        <>
          <ListItemText className={classes.itemText} primary={item.title} />
          {item.badge && (
            <Chip
              size="small"
              label={item.badge}
              variant={selected ? 'filled' : 'outlined'}
              sx={selected ? { bgcolor: 'rgba(255,255,255,0.2)', color: 'inherit' } : {}}
            />
          )}
        </>
      )}
    </ListItemButton>
  );
  if (expanded) {
    return content;
  }
  return (
    <Tooltip title={item.disabled && item.disabledHint ? item.disabledHint : item.title} placement="right">
      <span>{content}</span>
    </Tooltip>
  );
};

const AppSidebar = () => {
  const theme = useTheme();
  const t = useTranslation();
  const location = useLocation();
  const logout = useLogout();
  const { languages, language, setLocalLanguage } = useLocalization();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expandedDesktop, setExpandedDesktop] = usePersistedState('sidebarExpanded', true);
  const [expandedMobile, setExpandedMobile] = useState(false);
  const expanded = desktop ? expandedDesktop : expandedMobile;
  const setExpanded = desktop ? setExpandedDesktop : setExpandedMobile;
  const overlay = !desktop;

  const { classes, cx } = useStyles({ expanded, overlay });

  const admin = useAdministrator();
  const manager = useManager();
  const readonly = useRestriction('readonly');
  const disableReports = useRestriction('disableReports');
  const limitCommands = useRestriction('limitCommands');
  const features = useFeatures();
  const hasModule = useModules();

  const user = useSelector((state) => state.session.user);
  const socket = useSelector((state) => state.session.socket);
  const devices = useSelector((state) => state.devices.items);
  const selectedDeviceId = useSelector((state) => state.devices.selectedId);

  const brandName = useBrandAttribute('title');
  const brandLogo = useBrandAttribute('logo');

  const adminPaths = ['/admin', '/settings/users', '/settings/user/', '/settings/server', '/settings/announcement',
    '/reports/statistics', '/reports/audit', '/reports/logs', '/settings/calendar', '/settings/attribute',
    '/settings/command', '/settings/devices'];
  const inAdminPath = adminPaths.some((path) => location.pathname.startsWith(path))
    && location.pathname !== `/settings/user/${user.id}`;
  const [adminMode, setAdminMode] = useState(manager && inAdminPath);
  useEffect(() => {
    if (manager && inAdminPath) {
      setAdminMode(true);
    }
  }, [manager, inAdminPath]);

  const [userCount, setUserCount] = useState(null);
  useEffectAsync(async () => {
    if (manager && adminMode) {
      const response = await fetch('/api/users');
      if (response.ok) {
        setUserCount((await response.json()).filter((it) => !it.temporary).length);
      }
    }
  }, [manager, adminMode]);

  const [languageAnchor, setLanguageAnchor] = useState(null);

  const deviceCount = Object.keys(devices).length;
  const onlineCount = Object.values(devices).filter((it) => it.status === 'online').length;
  const selectHint = t('navSelectDevice');

  const userItems = [
    manager && {
      key: 'admin',
      title: t('navAdministration'),
      icon: <AdminPanelSettingsIcon />,
      onClick: () => setAdminMode(true),
      href: '/admin',
    },
    manager && { divider: 'admin' },
    {
      key: 'devices',
      title: t('deviceTitle'),
      icon: (
        <Badge color="error" variant="dot" overlap="circular" invisible={socket !== false}>
          <NavigationIcon />
        </Badge>
      ),
      href: '/',
      match: (path) => path === '/',
    },
    !features.disableEvents && {
      key: 'events', title: t('reportEvents'), icon: <EventIcon />, href: '/reports/events',
    },
    !disableReports && {
      key: 'alertCenter', title: t('alertCenterTitle'), icon: <NotificationsActiveIcon />, href: '/alert-center', match: /^\/alert-center/,
    },
    {
      key: 'security', title: t('securityTitle'), icon: <ShieldIcon />, href: '/security', match: /^\/security/,
    },
    hasModule('alerts') && {
      key: 'alertRules', title: t('ruleTitle'), icon: <RuleIcon />, href: '/alert-rules', match: /^\/alert-rules/,
    },
    !disableReports && {
      key: 'history', title: t('navHistory'), icon: <HistoryIcon />, href: '/replay',
    },
    hasModule('dispatch') && {
      key: 'dispatch', title: t('dispatchTitle'), icon: <LocalShippingIcon />, href: '/dispatch', match: /^\/(dispatch|reports\/dispatch)/,
    },
    hasModule('transit') && {
      key: 'transit', title: t('transitTitle'), icon: <DirectionsBusIcon />, href: '/transit', match: /^\/(transit|reports\/transit)/,
    },
    hasModule('tpms') && {
      key: 'tpms', title: t('tpmsTitle'), icon: <TireRepairIcon />, href: '/tpms', match: /^\/tpms/,
    },
    hasModule('assets') && {
      key: 'assets', title: t('assetsTitle'), icon: <BatteryChargingFullIcon />, href: '/assets', match: /^\/assets/,
    },
    hasModule('agro') && {
      key: 'agro', title: t('agroTitle'), icon: <AgricultureIcon />, href: '/agro', match: /^\/agro/,
    },
    hasModule('machinery') && {
      key: 'machinery', title: t('machineryTitle'), icon: <ConstructionIcon />, href: '/machinery', match: /^\/machinery/,
    },
    hasModule('regulator') && {
      key: 'regulator', title: t('regulatorTitle'), icon: <GavelIcon />, href: '/regulator', match: /^\/regulator/,
    },
    hasModule('sims') && {
      key: 'sims', title: t('simTitle'), icon: <SimCardIcon />, href: '/sims', match: /^\/sims/,
    },
    (admin || (manager && hasModule('billing'))) && {
      key: 'billing', title: t('billingTitle'), icon: <ReceiptLongIcon />, href: '/billing', match: /^\/billing/,
    },
    hasModule('deviceConfig') && !readonly && !limitCommands && {
      key: 'deviceConfig', title: t('deviceConfigTitle'), icon: <SettingsRemoteIcon />, href: '/device-config', match: /^\/device-config/,
    },
    hasModule('video') && {
      key: 'cameras', title: t('navCameras'), icon: <VideocamIcon />, href: '/dashcam',
    },
    !readonly && {
      key: 'alerts', title: t('navAlerts'), icon: <NotificationsIcon />, href: '/settings/notifications', match: '/settings/notification',
    },
    !readonly && {
      key: 'share',
      title: t('navShareLocation'),
      icon: <ShareIcon />,
      href: selectedDeviceId ? `/settings/device/${selectedDeviceId}/share` : undefined,
      disabled: !selectedDeviceId,
      disabledHint: selectHint,
      match: /\/settings\/device\/\d+\/share/,
    },
    !limitCommands && !readonly && {
      key: 'command',
      title: t('navSendCommand'),
      icon: <SendIcon />,
      href: selectedDeviceId ? `/settings/device/${selectedDeviceId}/command` : undefined,
      disabled: !selectedDeviceId,
      disabledHint: selectHint,
      match: /\/settings\/device\/\d+\/command/,
    },
    !disableReports && {
      key: 'reports', title: t('reportTitle'), icon: <BarChartIcon />, href: '/reports/combined', match: /^\/reports\/(?!statistics|audit|logs|fuel|driving|expenses|quality|builder|dispatch|transit)/,
    },
    !disableReports && hasModule('reports') && {
      key: 'reportBuilder', title: t('reportBuilderTitle'), icon: <TableChartIcon />, href: '/reports/builder', match: /^\/reports\/builder/,
    },
    !disableReports && {
      key: 'quality', title: t('qualityTitle'), icon: <SignalCellularAltIcon />, href: '/reports/quality', match: /^\/reports\/quality/,
    },
    !disableReports && hasModule('expenses') && {
      key: 'expenses', title: t('expensesTitle'), icon: <PaymentsIcon />, href: '/reports/expenses', match: /^\/reports\/expenses/,
    },
    !disableReports && hasModule('driving') && {
      key: 'driving', title: t('drivingTitle'), icon: <EmojiEventsIcon />, href: '/reports/driving', match: /^\/reports\/driving/,
    },
    !disableReports && hasModule('fuel') && {
      key: 'fuel',
      title: t('fuelTitle'),
      icon: <LocalGasStationIcon />,
      href: selectedDeviceId ? `/reports/fuel?deviceId=${selectedDeviceId}` : '/reports/fuel',
      match: /^\/reports\/fuel/,
    },
    !readonly && {
      key: 'geofences', title: t('sharedGeofences'), icon: <PolylineIcon />, href: '/geofences', match: /^\/(geofences|settings\/geofence)/,
    },
    !readonly && !features.disableMaintenance && hasModule('maintenance') && {
      key: 'maintenance', title: t('sharedMaintenance'), icon: <BuildIcon />, href: '/maintenance', match: /^\/(maintenance|settings\/maintenance)/,
    },
    !readonly && !features.disableDrivers && {
      key: 'drivers', title: t('sharedDrivers'), icon: <BadgeIcon />, href: '/settings/drivers', match: '/settings/driver',
    },
    !readonly && !features.disableGroups && {
      key: 'groups', title: t('settingsGroups'), icon: <FolderIcon />, href: '/settings/groups', match: '/settings/group',
    },
    {
      key: 'preferences', title: t('navConfiguration'), icon: <TuneIcon />, href: '/settings/preferences',
    },
  ];

  const adminItems = [
    {
      key: 'map',
      title: t('mapTitle'),
      icon: <MapIcon />,
      href: '/',
      onClick: () => setAdminMode(false),
    },
    { divider: 'map' },
    {
      key: 'overview', title: t('resellerTitle'), icon: <DashboardIcon />, href: '/admin', match: (path) => path === '/admin',
    },
    admin && {
      key: 'plans', title: t('plansTitle'), icon: <WorkspacePremiumIcon />, href: '/settings/plans',
    },
    {
      key: 'users',
      title: t('settingsUsers'),
      icon: <PeopleIcon />,
      href: '/settings/users',
      match: (path) => path.startsWith('/settings/user') && path !== `/settings/user/${user.id}`,
      badge: userCount !== null ? String(userCount) : null,
    },
    {
      key: 'adminDevices',
      title: t('deviceTitle'),
      icon: <NavigationIcon />,
      href: '/settings/devices',
      match: '/settings/device',
      badge: `${onlineCount}/${deviceCount}`,
    },
    admin && {
      key: 'metrics', title: t('navMetrics'), icon: <SpeedIcon />, href: '/reports/statistics',
    },
    admin && {
      key: 'status', title: t('statusTitle'), icon: <MonitorHeartIcon />, href: '/admin/status',
    },
    admin && {
      key: 'server', title: t('navServerSettings'), icon: <DnsIcon />, href: '/settings/server',
    },
    hasModule('whitelabel') && {
      key: 'appearance', title: t('navAppearance'), icon: <PaletteIcon />, href: '/settings/branding',
    },
    {
      key: 'announcement', title: t('serverAnnouncement'), icon: <CampaignIcon />, href: '/settings/announcement',
    },
    { divider: 'content' },
    !features.disableCalendars && {
      key: 'calendars', title: t('sharedCalendars'), icon: <TodayIcon />, href: '/settings/calendars', match: '/settings/calendar',
    },
    !features.disableComputedAttributes && {
      key: 'attributes', title: t('sharedComputedAttributes'), icon: <FunctionsIcon />, href: '/settings/attributes', match: '/settings/attribute',
    },
    !features.disableSavedCommands && {
      key: 'commands', title: t('sharedSavedCommands'), icon: <PublishIcon />, href: '/settings/commands', match: /^\/settings\/command/,
    },
    {
      key: 'logs', title: t('sharedLogs'), icon: <ListAltIcon />, href: '/reports/logs',
    },
    admin && {
      key: 'audit', title: t('reportAudit'), icon: <FactCheckIcon />, href: '/reports/audit',
    },
  ];

  const isSelected = (item) => {
    const { pathname } = location;
    if (typeof item.match === 'function') {
      return item.match(pathname);
    }
    if (item.match instanceof RegExp) {
      return item.match.test(pathname);
    }
    if (item.match) {
      return pathname.startsWith(item.match);
    }
    return item.href ? pathname === item.href : false;
  };

  const items = (adminMode && manager ? adminItems : userItems).filter(Boolean);

  const handleNavigate = () => {
    if (overlay) {
      setExpandedMobile(false);
    }
  };

  const panel = (
    <Paper elevation={overlay && expanded ? 8 : 0} className={classes.panel} component="nav">
      <div className={classes.header}>
        {expanded && (
          <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', minWidth: 0 }}>
            {brandLogo && <img className={classes.logo} src={brandLogo} alt="" />}
            {!brandLogo && brandName && (
              <Typography variant="h6" className={classes.brandName} noWrap>{brandName}</Typography>
            )}
            {!brandLogo && !brandName && <img className={classes.logo} src={BRAND_LOGO} alt="Safe Connection" />}
          </Box>
        )}
        <IconButton
          className={expanded ? classes.collapseButton : undefined}
          sx={expanded ? {} : { mx: 'auto' }}
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? t('navCollapse') : t('navExpand')}
        >
          {expanded ? <ChevronLeftIcon /> : <MenuIcon />}
        </IconButton>
      </div>
      <Divider />
      <List className={classes.list}>
        {items.map((item) => (item.divider ? (
          <Divider key={`divider-${item.divider}`} sx={{ my: 1 }} />
        ) : (
          <Fragment key={item.key}>
            <NavItem
              item={item}
              expanded={expanded}
              selected={isSelected(item)}
              onNavigate={handleNavigate}
              classes={classes}
            />
          </Fragment>
        )))}
      </List>
      <Divider />
      <List className={classes.footer}>
        <NavItem
          item={{
            key: 'account',
            title: user.email,
            icon: <PersonIcon />,
            href: `/settings/user/${user.id}`,
          }}
          expanded={expanded}
          selected={location.pathname === `/settings/user/${user.id}`}
          onNavigate={handleNavigate}
          classes={classes}
        />
        <NavItem
          item={{
            key: 'language',
            title: languages[language].name,
            icon: <ReactCountryFlag countryCode={languages[language].country} svg style={{ width: 24 }} />,
            onClick: (event) => setLanguageAnchor(event.currentTarget),
          }}
          expanded={expanded}
          selected={false}
          onNavigate={() => {}}
          classes={classes}
        />
        <NavItem
          item={{
            key: 'logout',
            title: t('loginLogout'),
            icon: <LogoutIcon />,
            onClick: () => logout(),
          }}
          expanded={expanded}
          selected={false}
          onNavigate={handleNavigate}
          classes={classes}
        />
      </List>
      <Menu anchorEl={languageAnchor} open={Boolean(languageAnchor)} onClose={() => setLanguageAnchor(null)}>
        {Object.entries(languages).map(([code, value]) => (
          <MenuItem
            key={code}
            selected={code === language}
            onClick={() => {
              setLocalLanguage(code);
              setLanguageAnchor(null);
            }}
          >
            <ReactCountryFlag countryCode={value.country} svg style={{ width: 20, marginRight: 12 }} />
            {value.name}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );

  return (
    <div className={cx(classes.rail, !overlay && classes.railPushed)}>
      {panel}
      {overlay && (
        <Backdrop
          open={expanded}
          onClick={() => setExpandedMobile(false)}
          sx={{ zIndex: theme.zIndex.drawer + 1 }}
        />
      )}
    </div>
  );
};

export default AppSidebar;
