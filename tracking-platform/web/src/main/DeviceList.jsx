import {
  forwardRef, useEffect, useMemo, useRef, useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { VariableSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useTheme } from '@mui/material/styles';
import { devicesActions } from '../store';
import { useEffectAsync } from '../reactHelper';
import Row, { DEVICE_ROW_HEIGHT, GROUP_ROW_HEIGHT } from './DeviceRow';
import fetchOrThrow from '../common/util/fetchOrThrow';
import usePersistedState from '../common/util/usePersistedState';

const useStyles = makeStyles()((theme) => ({
  list: {
    maxHeight: '100%',
  },
  listInner: {
    position: 'relative',
    margin: theme.spacing(1.5, 0),
  },
}));

const OuterElement = forwardRef(function OuterElement(props, ref) {
  const theme = useTheme();
  const { className, style, ...rest } = props;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        direction: theme.direction,
      }}
      {...rest}
    />
  );
});

// Devices grouped by group, each group with a visibility checkbox, a counter and a collapse button
const DeviceList = ({ devices, hiddenDevices, setHiddenDevices }) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const listRef = useRef(null);

  const groups = useSelector((state) => state.groups.items);
  const [collapsedGroups, setCollapsedGroups] = usePersistedState('collapsedGroups', []);

  const [, setTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setTime(Date.now()), 60000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffectAsync(async () => {
    const response = await fetchOrThrow('/api/devices');
    dispatch(devicesActions.refresh(await response.json()));
  }, []);

  const data = useMemo(() => {
    const collapsed = new Set(collapsedGroups);
    const byGroup = new Map();
    devices.forEach((device) => {
      const groupId = groups[device.groupId] ? device.groupId : 0;
      if (!byGroup.has(groupId)) {
        byGroup.set(groupId, []);
      }
      byGroup.get(groupId).push(device);
    });
    const ordered = [...byGroup.keys()].sort((a, b) => {
      if (!a || !b) {
        return a ? -1 : 1;
      }
      return groups[a].name.localeCompare(groups[b].name);
    });
    const rows = [];
    ordered.forEach((groupId) => {
      const items = byGroup.get(groupId);
      rows.push({
        type: 'group', id: groupId, name: groups[groupId]?.name, deviceIds: items.map((it) => it.id),
      });
      if (!collapsed.has(groupId)) {
        items.forEach((device) => rows.push({ type: 'device', device }));
      }
    });
    return {
      rows,
      hidden: new Set(hiddenDevices),
      collapsed,
      setHidden: (ids, hide) => {
        const next = new Set(hiddenDevices);
        ids.forEach((id) => (hide ? next.add(id) : next.delete(id)));
        setHiddenDevices([...next]);
      },
      toggleCollapsed: (groupId) => setCollapsedGroups(collapsed.has(groupId)
        ? collapsedGroups.filter((id) => id !== groupId)
        : [...collapsedGroups, groupId]),
    };
  }, [devices, groups, hiddenDevices, collapsedGroups]);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [data.rows]);

  return (
    <AutoSizer className={classes.list}>
      {({ height, width }) => (
        <VariableSizeList
          ref={listRef}
          width={width}
          height={height}
          itemCount={data.rows.length}
          itemData={data}
          itemSize={(index) => (data.rows[index].type === 'group' ? GROUP_ROW_HEIGHT : DEVICE_ROW_HEIGHT)}
          overscanCount={10}
          outerElementType={OuterElement}
        >
          {Row}
        </VariableSizeList>
      )}
    </AutoSizer>
  );
};

export default DeviceList;
