import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { restorePanels, usePanels } from '../common/util/floatingPanels';
import { parseWorkspaces } from './workspaces';
import VideoWindow from '../main/VideoWindows';
import AlertsPanel from './AlertsPanel';
import UnitPanel from './UnitPanel';
import ReplayPanel from './ReplayPanel';
import FuelPanel from './FuelPanel';
import FleetPanel from './FleetPanel';
import QualityPanel from './QualityPanel';
import MaintenancePanel from './MaintenancePanel';
import GeofencesPanel from './GeofencesPanel';
import NearestPanel from './NearestPanel';
import MeasurePanel from './MeasurePanel';
import CommandsPanel from './CommandsPanel';
import ChatPanel from './ChatPanel';
import CameraWallPanel from './CameraWallPanel';

export const PANEL_KINDS = {
  alerts: AlertsPanel,
  unit: UnitPanel,
  replay: ReplayPanel,
  fuel: FuelPanel,
  fleet: FleetPanel,
  quality: QualityPanel,
  maintenance: MaintenancePanel,
  geofences: GeofencesPanel,
  nearest: NearestPanel,
  measure: MeasurePanel,
  commands: CommandsPanel,
  chat: ChatPanel,
  cameraWall: CameraWallPanel,
};

// Every open floating panel, over all pages; the user's default workspace is restored once after logging in
const FloatingPanels = () => {
  const panels = usePanels();
  const user = useSelector((state) => state.session.user);
  const restored = useRef(false);

  useEffect(() => {
    if (user && !restored.current) {
      restored.current = true;
      const { items, defaultName } = parseWorkspaces(user);
      const workspace = items.find((item) => item.name === defaultName);
      if (workspace && !panels.length) restorePanels(workspace.panels);
    }
  }, [user]);

  return panels.map((panel, index) => {
    const onTop = index === panels.length - 1;
    if (panel.kind === 'video') {
      return <VideoWindow key={panel.id} deviceId={panel.props.deviceId} cascade={panel.cascade % 4} onTop={onTop} />;
    }
    const Component = PANEL_KINDS[panel.kind];
    return Component ? <Component key={panel.id} panel={panel} onTop={onTop} /> : null;
  });
};

export default FloatingPanels;
