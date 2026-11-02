import { useState } from 'react';
import {
  Route, Routes, useLocation, useNavigate,
} from 'react-router-dom';
import { useDispatch } from 'react-redux';
import MainPage from './main/MainPage';
import CombinedReportPage from './reports/CombinedReportPage';
import PositionsReportPage from './reports/PositionsReportPage';
import ServerPage from './settings/ServerPage';
import UsersPage from './settings/UsersPage';
import DevicePage from './settings/DevicePage';
import UserPage from './settings/UserPage';
import NotificationsPage from './settings/NotificationsPage';
import NotificationPage from './settings/NotificationPage';
import GroupsPage from './settings/GroupsPage';
import GroupPage from './settings/GroupPage';
import PositionPage from './other/PositionPage';
import NetworkPage from './other/NetworkPage';
import EventReportPage from './reports/EventReportPage';
import ReplayPage from './other/ReplayPage';
import TripReportPage from './reports/TripReportPage';
import StopReportPage from './reports/StopReportPage';
import SummaryReportPage from './reports/SummaryReportPage';
import ChartReportPage from './reports/ChartReportPage';
import FuelReportPage from './reports/FuelReportPage';
import ExpensesPage from './reports/ExpensesPage';
import AlertCenterPage from './operations/AlertCenterPage';
import AlertRulesPage from './operations/AlertRulesPage';
import SensorReportPage from './reports/SensorReportPage';
import CustomAlertsReportPage from './reports/CustomAlertsReportPage';
import GeofenceSpeedReportPage from './reports/GeofenceSpeedReportPage';
import ConnectionQualityPage from './operations/ConnectionQualityPage';
import FleetMaintenancePage from './operations/FleetMaintenancePage';
import ReportBuilderPage from './operations/ReportBuilderPage';
import DrivingScorePage from './reports/DrivingScorePage';
import FuelEvidencePage from './reports/FuelEvidencePage';
import TrackPage from './other/TrackPage';
import DispatchPage from './dispatch/DispatchPage';
import DispatchReportPage from './dispatch/DispatchReportPage';
import OrdersPage from './dispatch/OrdersPage';
import PlannerPage from './dispatch/PlannerPage';
import DispatchDriverPage from './dispatch/DriverPage';
import DeliveryTrackPage from './dispatch/DeliveryTrackPage';
import TransitPage from './transit/TransitPage';
import TransitReportPage from './transit/TransitReportPage';
import DriverTransitPage from './transit/DriverTransitPage';
import TpmsPage from './tpms/TpmsPage';
import AssetsPage from './assets/AssetsPage';
import AgroPage from './agro/AgroPage';
import DeviceConfigPage from './deviceConfig/DeviceConfigPage';
import SecurityPage from './security/SecurityPage';
import MachineryPage from './machinery/MachineryPage';
import SimsPage from './sims/SimsPage';
import BillingPage from './billing/BillingPage';
import RegulatorPage from './regulator/RegulatorPage';
import DriversPage from './settings/DriversPage';
import DriverPage from './settings/DriverPage';
import CalendarsPage from './settings/CalendarsPage';
import CalendarPage from './settings/CalendarPage';
import ComputedAttributesPage from './settings/ComputedAttributesPage';
import ComputedAttributePage from './settings/ComputedAttributePage';
import MaintenancesPage from './settings/MaintenancesPage';
import MaintenancePage from './settings/MaintenancePage';
import CommandsPage from './settings/CommandsPage';
import CommandPage from './settings/CommandPage';
import StatisticsPage from './reports/StatisticsPage';
import LoginPage from './login/LoginPage';
import RegisterPage from './login/RegisterPage';
import ResetPasswordPage from './login/ResetPasswordPage';
import GeofencesPage from './other/GeofencesPage';
import GeofencePage from './settings/GeofencePage';
import useQuery from './common/util/useQuery';
import { useEffectAsync } from './reactHelper';
import { devicesActions } from './store';
import EventPage from './other/EventPage';
import PreferencesPage from './settings/PreferencesPage';
import AccumulatorsPage from './settings/AccumulatorsPage';
import CommandDevicePage from './settings/CommandDevicePage';
import CommandGroupPage from './settings/CommandGroupPage';
import App from './App';
import ChangeServerPage from './login/ChangeServerPage';
import DevicesPage from './settings/DevicesPage';
import ScheduledPage from './reports/ScheduledPage';
import DeviceConnectionsPage from './settings/DeviceConnectionsPage';
import GroupConnectionsPage from './settings/GroupConnectionsPage';
import UserConnectionsPage from './settings/UserConnectionsPage';
import LogsPage from './reports/LogsPage';
import SharePage from './settings/SharePage';
import AnnouncementPage from './settings/AnnouncementPage';
import EmulatorPage from './other/EmulatorPage';
import Loader from './common/components/Loader';
import { generateLoginToken } from './common/components/NativeInterface';
import { useLocalization } from './common/components/LocalizationProvider';
import fetchOrThrow from './common/util/fetchOrThrow';
import AuditPage from './reports/AuditPage';
import ResellerDashboardPage from './plans/ResellerDashboardPage';
import PlansPage from './plans/PlansPage';
import BrandingPage from './settings/BrandingPage';
import DashcamPage from './dashcam/DashcamPage';
import SystemStatusPage from './admin/SystemStatusPage';

const Navigation = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { setLocalLanguage } = useLocalization();

  const [redirectsHandled, setRedirectsHandled] = useState(false);

  const { pathname } = useLocation();
  const query = useQuery();

  useEffectAsync(async () => {
    if (query.get('locale')) {
      setLocalLanguage(query.get('locale'));
    }
    if (query.get('token')) {
      const token = query.get('token');
      await fetch(`/api/session?token=${encodeURIComponent(token)}`);
      // keep the other parameters (tracking link destination)
      const rest = new URLSearchParams(query);
      rest.delete('token');
      navigate(rest.toString() ? `${pathname}?${rest}` : pathname, { replace: true });
    } else if (pathname == '/' && query.get('deviceId')) {
      const deviceId = query.get('deviceId');
      const response = await fetchOrThrow(`/api/devices?uniqueId=${deviceId}`);
      const items = await response.json();
      if (items.length > 0) {
        dispatch(devicesActions.selectId(items[0].id));
      }
      navigate('/', { replace: true });
    } else if (query.get('eventId')) {
      const eventId = parseInt(query.get('eventId'), 10);
      navigate(`/event/${eventId}`, { replace: true });
    } else if (query.get('openid')) {
      if (query.get('openid') === 'success') {
        generateLoginToken();
      }
      navigate('/', { replace: true });
    } else {
      setRedirectsHandled(true);
    }
  }, [query]);

  if (!redirectsHandled) {
    return (<Loader />);
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/change-server" element={<ChangeServerPage />} />
      <Route path="/track" element={<TrackPage />} />
      <Route path="/conductor/:token" element={<DispatchDriverPage />} />
      <Route path="/entrega/:token" element={<DeliveryTrackPage />} />
      <Route path="/bus/:token" element={<DriverTransitPage />} />
      <Route path="/" element={<App />}>
        <Route index element={<MainPage />} />

        <Route path="position/:id" element={<PositionPage />} />
        <Route path="network/:positionId" element={<NetworkPage />} />
        <Route path="event/:id" element={<EventPage />} />
        <Route path="replay" element={<ReplayPage />} />
        <Route path="alert-center" element={<AlertCenterPage />} />
        <Route path="alert-rules" element={<AlertRulesPage />} />
        <Route path="maintenance" element={<FleetMaintenancePage />} />
        <Route path="geofences" element={<GeofencesPage />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="dispatch/orders" element={<OrdersPage />} />
        <Route path="dispatch/planner" element={<PlannerPage />} />
        <Route path="transit" element={<TransitPage />} />
        <Route path="tpms" element={<TpmsPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="agro" element={<AgroPage />} />
        <Route path="machinery" element={<MachineryPage />} />
        <Route path="sims" element={<SimsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="regulator" element={<RegulatorPage />} />
        <Route path="device-config" element={<DeviceConfigPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="emulator" element={<EmulatorPage />} />
        <Route path="admin" element={<ResellerDashboardPage />} />
        <Route path="dashcam" element={<DashcamPage />} />
        <Route path="admin/status" element={<SystemStatusPage />} />

        <Route path="settings">
          <Route path="accumulators/:deviceId" element={<AccumulatorsPage />} />
          <Route path="announcement" element={<AnnouncementPage />} />
          <Route path="branding" element={<BrandingPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="calendars" element={<CalendarsPage />} />
          <Route path="calendar/:id" element={<CalendarPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="command/:id" element={<CommandPage />} />
          <Route path="command" element={<CommandPage />} />
          <Route path="attributes" element={<ComputedAttributesPage />} />
          <Route path="attribute/:id" element={<ComputedAttributePage />} />
          <Route path="attribute" element={<ComputedAttributePage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="device/:id/connections" element={<DeviceConnectionsPage />} />
          <Route path="device/:id/command" element={<CommandDevicePage />} />
          <Route path="device/:id/share" element={<SharePage />} />
          <Route path="device/:id" element={<DevicePage />} />
          <Route path="device" element={<DevicePage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="driver/:id" element={<DriverPage />} />
          <Route path="driver" element={<DriverPage />} />
          <Route path="geofence/:id" element={<GeofencePage />} />
          <Route path="geofence" element={<GeofencePage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="group/:id/connections" element={<GroupConnectionsPage />} />
          <Route path="group/:id/command" element={<CommandGroupPage />} />
          <Route path="group/:id" element={<GroupPage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="maintenances" element={<MaintenancesPage />} />
          <Route path="maintenance/:id" element={<MaintenancePage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="notification/:id" element={<NotificationPage />} />
          <Route path="notification" element={<NotificationPage />} />
          <Route path="preferences" element={<PreferencesPage />} />
          <Route path="server" element={<ServerPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="user/:id/connections" element={<UserConnectionsPage />} />
          <Route path="user/:id" element={<UserPage />} />
          <Route path="user" element={<UserPage />} />
        </Route>

        <Route path="reports">
          <Route path="combined" element={<CombinedReportPage />} />
          <Route path="chart" element={<ChartReportPage />} />
          <Route path="fuel" element={<FuelReportPage />} />
          <Route path="fuel/evidence" element={<FuelEvidencePage />} />
          <Route path="driving" element={<DrivingScorePage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="quality" element={<ConnectionQualityPage />} />
          <Route path="sensors" element={<SensorReportPage />} />
          <Route path="custom-alerts" element={<CustomAlertsReportPage />} />
          <Route path="geofence-speed" element={<GeofenceSpeedReportPage />} />
          <Route path="dispatch" element={<DispatchReportPage />} />
          <Route path="transit" element={<TransitReportPage />} />
          <Route path="builder" element={<ReportBuilderPage />} />
          <Route path="events" element={<EventReportPage />} />
          <Route path="route" element={<PositionsReportPage />} />
          <Route path="stops" element={<StopReportPage />} />
          <Route path="summary" element={<SummaryReportPage />} />
          <Route path="trips" element={<TripReportPage />} />
          <Route path="scheduled" element={<ScheduledPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default Navigation;
