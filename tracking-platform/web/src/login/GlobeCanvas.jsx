import { useEffect, useRef } from 'react';
import LAND_DOTS from './landDots';

// Main Latin American hubs, joined by animated network arcs
const HUBS = [
  [-12.05, -77.04], // Lima
  [4.71, -74.07], // Bogota
  [-33.45, -70.67], // Santiago
  [-23.55, -46.63], // Sao Paulo
  [-34.6, -58.38], // Buenos Aires
  [19.43, -99.13], // Mexico City
  [-0.18, -78.47], // Quito
  [-16.5, -68.15], // La Paz
  [8.98, -79.52], // Panama
  [10.48, -66.9], // Caracas
  [-25.26, -57.58], // Asuncion
  [-15.79, -47.88], // Brasilia
];

const LINKS = [[0, 1], [0, 2], [0, 3], [0, 5], [0, 6], [0, 7], [1, 8], [1, 9], [3, 4], [2, 4],
  [3, 11], [10, 4], [8, 5], [7, 10], [6, 1]];

const RAD = Math.PI / 180;

const toVector = ([lat, lon]) => {
  const phi = lat * RAD;
  const lambda = lon * RAD;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
};

// Spherical interpolation between two unit vectors
const slerp = (a, b, t) => {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return a;
  const s = Math.sin(omega);
  const ka = Math.sin((1 - t) * omega) / s;
  const kb = Math.sin(t * omega) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
};

const GlobeCanvas = ({ size = 420, accent = '#0eabf1' }) => {
  const canvasRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.scale(ratio, ratio);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const land = [];
    for (let i = 0; i < LAND_DOTS.length; i += 2) {
      land.push(toVector([LAND_DOTS[i], LAND_DOTS[i + 1]]));
    }
    const hubs = HUBS.map(toVector);
    const arcs = LINKS.map(([a, b], index) => ({
      a: hubs[a], b: hubs[b], offset: (index * 0.37) % 1, speed: 0.12 + (index % 4) * 0.03,
    }));

    const radius = size * 0.4;
    const center = size / 2;
    let frame;
    let yaw = 68 * RAD; // Latin America facing the viewer
    const pitch = 12 * RAD;

    const project = ([x, y, z], lift = 1) => {
      const yawValue = yaw + pointer.current.x * 0.25;
      const pitchValue = pitch + pointer.current.y * 0.15;
      const cosY = Math.cos(yawValue);
      const sinY = Math.sin(yawValue);
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const cosP = Math.cos(pitchValue);
      const sinP = Math.sin(pitchValue);
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;
      return [center + x1 * radius * lift, center - y2 * radius * lift, z2];
    };

    const draw = (time) => {
      const seconds = time / 1000;
      context.clearRect(0, 0, size, size);

      const halo = context.createRadialGradient(center, center, radius * 0.6, center, center, radius * 1.35);
      halo.addColorStop(0, 'rgba(14, 171, 241, 0.25)');
      halo.addColorStop(1, 'rgba(14, 171, 241, 0)');
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);

      const sphere = context.createRadialGradient(
        center - radius * 0.35, center - radius * 0.4, radius * 0.1, center, center, radius,
      );
      sphere.addColorStop(0, '#1d4f9c');
      sphere.addColorStop(1, '#061733');
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.fillStyle = sphere;
      context.fill();
      context.strokeStyle = 'rgba(92, 200, 247, 0.55)';
      context.lineWidth = 1.2;
      context.stroke();

      land.forEach((vector) => {
        const [px, py, depth] = project(vector);
        if (depth > 0.12) {
          context.fillStyle = `rgba(127, 214, 252, ${0.15 + depth * 0.75})`;
          context.fillRect(px - 0.9, py - 0.9, 1.8, 1.8);
        }
      });

      arcs.forEach((arc) => {
        const steps = 32;
        context.beginPath();
        let visible = false;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const [px, py, depth] = project(slerp(arc.a, arc.b, t), 1 + Math.sin(Math.PI * t) * 0.12);
          if (depth > -0.05) {
            if (visible) context.lineTo(px, py); else context.moveTo(px, py);
            visible = true;
          } else {
            visible = false;
          }
        }
        context.strokeStyle = 'rgba(14, 171, 241, 0.55)';
        context.lineWidth = 1;
        context.stroke();

        const t = (seconds * arc.speed + arc.offset) % 1;
        const [px, py, depth] = project(slerp(arc.a, arc.b, t), 1 + Math.sin(Math.PI * t) * 0.12);
        if (depth > 0) {
          context.beginPath();
          context.arc(px, py, 2.4, 0, Math.PI * 2);
          context.fillStyle = '#ffffff';
          context.shadowColor = accent;
          context.shadowBlur = 10;
          context.fill();
          context.shadowBlur = 0;
        }
      });

      hubs.forEach((vector, index) => {
        const [px, py, depth] = project(vector);
        if (depth > 0) {
          const pulse = (seconds * 0.8 + index * 0.21) % 1;
          context.beginPath();
          context.arc(px, py, 3 + pulse * 9, 0, Math.PI * 2);
          context.strokeStyle = `rgba(14, 171, 241, ${0.7 * (1 - pulse)})`;
          context.stroke();
          context.beginPath();
          context.arc(px, py, 3, 0, Math.PI * 2);
          context.fillStyle = accent;
          context.fill();
        }
      });

      if (!reduced) {
        yaw = 68 * RAD + Math.sin(seconds * 0.15) * 0.35;
        frame = requestAnimationFrame(draw);
      }
    };
    frame = requestAnimationFrame(draw);

    const handleMove = (event) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener('pointermove', handleMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
    };
  }, [size, accent]);

  return <canvas ref={canvasRef} style={{ width: size, maxWidth: '100%', height: 'auto', aspectRatio: '1' }} aria-hidden />;
};

export default GlobeCanvas;
