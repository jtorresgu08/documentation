import circle from '@turf/circle';

const meters = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(a));
};

// Draw mode for circular geofences: first click sets the center, moving the mouse sets the radius (shown as the
// feature's name) and the second click finishes; the created feature carries its center and radius in meters
const CircleMode = {
  onSetup() {
    const feature = this.newFeature({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[]] },
    });
    this.addFeature(feature);
    this.clearSelectedFeatures();
    this.updateUIClasses({ mouse: 'add' });
    this.setActionableState({ trash: true });
    return { feature, center: null };
  },

  update(state, point) {
    const radius = Math.max(10, meters(state.center, point));
    const polygon = circle(state.center, radius, { steps: 64, units: 'meters' });
    state.feature.incomingCoords(polygon.geometry.coordinates);
    state.feature.setProperty('circleCenter', state.center);
    state.feature.setProperty('circleRadius', Math.round(radius));
    state.feature.setProperty('name', radius >= 1000 ? `${(radius / 1000).toFixed(2)} km` : `${Math.round(radius)} m`);
  },

  onClick(state, event) {
    const point = [event.lngLat.lng, event.lngLat.lat];
    if (!state.center) {
      state.center = point;
      this.update(state, [point[0] + 0.0005, point[1]]);
      return;
    }
    this.update(state, point);
    this.map.fire('draw.create', { features: [state.feature.toGeoJSON()] });
    this.changeMode('simple_select', { featureIds: [state.feature.id] });
  },

  onMouseMove(state, event) {
    if (state.center) {
      this.update(state, [event.lngLat.lng, event.lngLat.lat]);
    }
  },

  onKeyUp(state, event) {
    if (event.keyCode === 27) {
      this.deleteFeature([state.feature.id], { silent: true });
      this.changeMode('simple_select');
    }
  },

  onStop(state) {
    this.updateUIClasses({ mouse: 'none' });
    if (!state.center && this.getFeature(state.feature.id)) {
      this.deleteFeature([state.feature.id], { silent: true });
    }
  },

  onTrash(state) {
    this.deleteFeature([state.feature.id], { silent: true });
    this.changeMode('simple_select');
  },

  toDisplayFeatures(state, geojson, display) {
    const shown = { ...geojson, properties: { ...geojson.properties, active: 'true' } };
    display(shown);
  },
};

export default CircleMode;
