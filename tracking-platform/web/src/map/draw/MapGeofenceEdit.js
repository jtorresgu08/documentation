import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import maplibregl from 'maplibre-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useEffect, useMemo } from 'react';

import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { map } from '../core/MapView';
import { findFonts, geofenceToFeature, geometryToArea } from '../core/mapUtil';
import { errorsActions, geofencesActions } from '../../store';
import { useCatchCallback } from '../../reactHelper';
import drawTheme from './theme';
import CircleMode from './circleMode';
import { useTranslation } from '../../common/components/LocalizationProvider';
import fetchOrThrow from '../../common/util/fetchOrThrow';

MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';

const meters = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
};

const circleArea = ([lon, lat], radius) => `CIRCLE (${lat.toFixed(6)} ${lon.toFixed(6)}, ${Math.round(radius)})`;

// a circle moved or reshaped in the editor stays a circle: center of its outline and average radius
const ringToCircle = (geometry) => {
  const ring = geometry.coordinates[0].slice(0, -1);
  const center = [ring.reduce((sum, point) => sum + point[0], 0) / ring.length, ring.reduce((sum, point) => sum + point[1], 0) / ring.length];
  const radius = ring.reduce((sum, point) => sum + meters(center, point), 0) / ring.length;
  return circleArea(center, radius);
};

// buttons for the circle tool and the panel to create a circle or a route by coordinates
class ExtraControls {
  constructor(buttons) {
    this.buttons = buttons;
  }

  onAdd() {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this.buttons.forEach(({ title, icon, onClick }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.innerHTML = icon;
      button.style.display = 'grid';
      button.style.placeItems = 'center';
      button.onclick = onClick;
      this.container.appendChild(button);
    });
    return this.container;
  }

  onRemove() {
    this.container.remove();
  }
}

const CIRCLE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#333" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="#333"/></svg>';
const ROUTE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 19c3-6 4-14 14-14" fill="none" stroke="#333" stroke-width="2" stroke-dasharray="3 2"/><circle cx="5" cy="19" r="2.4" fill="#2e7d32"/><circle cx="19" cy="5" r="2.4" fill="#c62828"/></svg>';

const MapGeofenceEdit = ({ selectedGeofenceId, onCreateByCoordinates }) => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const t = useTranslation();

  const draw = useMemo(() => new MapboxDraw({
    displayControlsDefault: false,
    modes: { ...MapboxDraw.modes, draw_circle: CircleMode },
    controls: {
      polygon: true,
      line_string: true,
      trash: true,
    },
    userProperties: true,
    styles: [...drawTheme, {
      id: 'gl-draw-title',
      type: 'symbol',
      filter: ['all'],
      layout: {
        'text-field': '{user_name}',
        'text-font': findFonts(map),
        'text-size': 12,
      },
      paint: {
        'text-halo-color': 'white',
        'text-halo-width': 1,
      },
    }],
  }), []);

  const geofences = useSelector((state) => state.geofences.items);

  const refreshGeofences = useCatchCallback(async () => {
    const response = await fetchOrThrow('/api/geofences');
    dispatch(geofencesActions.refresh(await response.json()));
  }, [dispatch]);

  useEffect(() => {
    refreshGeofences();

    map.addControl(draw, theme.direction === 'rtl' ? 'top-right' : 'top-left');
    const extra = new ExtraControls([
      { title: t('geofenceDrawCircle'), icon: CIRCLE_ICON, onClick: () => draw.changeMode('draw_circle') },
      { title: t('geofenceByCoordinates'), icon: ROUTE_ICON, onClick: () => onCreateByCoordinates?.() },
    ]);
    map.addControl(extra, theme.direction === 'rtl' ? 'top-right' : 'top-left');
    return () => {
      map.removeControl(extra);
      map.removeControl(draw);
    };
  }, [refreshGeofences]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      const { circleCenter, circleRadius } = feature.properties || {};
      const area = circleRadius ? circleArea(circleCenter, circleRadius) : geometryToArea(feature.geometry);
      const newItem = { name: circleRadius ? `${t('geofenceCircle')} ${feature.properties.name}` : t('sharedGeofence'), area };
      draw.delete(feature.id);
      try {
        const response = await fetchOrThrow('/api/geofences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        });
        const item = await response.json();
        navigate(`/settings/geofence/${item.id}`);
      } catch (error) {
        dispatch(errorsActions.push(error.message));
      }
    };

    map.on('draw.create', listener);
    return () => map.off('draw.create', listener);
  }, [dispatch, navigate]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      try {
        await fetchOrThrow(`/api/geofences/${feature.id}`, { method: 'DELETE' });
        refreshGeofences();
      } catch (error) {
        dispatch(errorsActions.push(error.message));
      }
    };

    map.on('draw.delete', listener);
    return () => map.off('draw.delete', listener);
  }, [dispatch, refreshGeofences]);

  useEffect(() => {
    const listener = async (event) => {
      const feature = event.features[0];
      const item = Object.values(geofences).find((i) => i.id === feature.id);
      if (item) {
        const area = item.area.startsWith('CIRCLE') && feature.geometry.type === 'Polygon'
          ? ringToCircle(feature.geometry) : geometryToArea(feature.geometry);
        const updatedItem = { ...item, area };
        try {
          await fetchOrThrow(`/api/geofences/${feature.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedItem),
          });
          refreshGeofences();
        } catch (error) {
          dispatch(errorsActions.push(error.message));
        }
      }
    };

    map.on('draw.update', listener);
    return () => map.off('draw.update', listener);
  }, [dispatch, geofences, refreshGeofences]);

  useEffect(() => {
    draw.deleteAll();
    Object.values(geofences).forEach((geofence) => {
      draw.add(geofenceToFeature(theme, geofence));
    });
  }, [geofences]);

  useEffect(() => {
    if (selectedGeofenceId) {
      const feature = draw.get(selectedGeofenceId);
      let { coordinates } = feature.geometry;
      if (Array.isArray(coordinates[0][0])) {
        [coordinates] = coordinates;
      }
      const bounds = coordinates.reduce(
        (bounds, coordinate) => bounds.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[1]),
      );
      const canvas = map.getCanvas();
      map.fitBounds(bounds, { padding: Math.min(canvas.width, canvas.height) * 0.1 });
    }
  }, [selectedGeofenceId]);

  return null;
};

export default MapGeofenceEdit;
