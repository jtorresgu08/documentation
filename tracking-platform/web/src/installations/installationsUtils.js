export const ORDER_STATUSES = ['scheduled', 'enRoute', 'inProgress', 'completed', 'cancelled'];
export const ORDER_TYPES = ['installation', 'maintenance', 'removal', 'inspection', 'support'];
export const STOCK_STATUSES = ['stock', 'technician', 'reserved', 'installed', 'faulty', 'retired'];
export const STOCK_TYPES = ['gps', 'camera', 'sensor', 'relay', 'sim', 'accessory'];
export const CHECKLIST = ['power', 'gpsFix', 'gsmSignal', 'ignition', 'engineStop', 'panicButton', 'wiring', 'clientTrained'];
export const PHOTO_CATEGORIES = ['vehicle', 'plate', 'odometer', 'device', 'wiring', 'other'];

export const STATUS_COLORS = {
  scheduled: '#2563c9', enRoute: '#8e44ad', inProgress: '#e0a100', completed: '#2e9d5b', cancelled: '#8a94a6',
  stock: '#2563c9', technician: '#8e44ad', reserved: '#e0a100', installed: '#2e9d5b', faulty: '#d9534f', retired: '#8a94a6',
};
export const TECHNICIAN_COLORS = ['#2563c9', '#2e9d5b', '#e0a100', '#8e44ad', '#d9534f', '#0eabf1', '#f06292', '#5d6d7e'];

export const capitalize = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');
export const statusLabel = (t, status) => t(`instStatus${capitalize(status)}`);
export const typeLabel = (t, type) => t(`instType${capitalize(type)}`);
export const stockStatusLabel = (t, status) => t(`instStock${capitalize(status)}`);
export const stockTypeLabel = (t, type) => t(`instItem${capitalize(type)}`) || type;

export const installerUrl = (token) => `${window.location.origin}/instalador/${token}`;
export const reportUrl = (token) => `${window.location.origin}/acta/${token}`;
export const whatsappUrl = (phone, text) => `https://wa.me/${(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
export const mapsUrl = (order) => (order.latitude || order.longitude
  ? `https://www.google.com/maps/dir/?api=1&destination=${order.latitude},${order.longitude}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address || '')}`);

// reduces a camera photo to at most 1600 px and JPEG, so it uploads quickly over mobile data
export const compressImage = (file, maxSize = 1600, quality = 0.8) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

export const currentPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) {
    resolve({});
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => resolve({}),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
});
