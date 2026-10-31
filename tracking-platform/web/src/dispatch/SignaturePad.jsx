import { useEffect, useRef } from 'react';
import { Box, Button } from '@mui/material';

// finger or mouse signature; reports a PNG data URL (null when cleared)
const SignaturePad = ({ onChange, clearLabel }) => {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const drawn = useRef(false);

  useEffect(() => {
    const element = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = element.offsetWidth * ratio;
    element.height = element.offsetHeight * ratio;
    const context = element.getContext('2d');
    context.scale(ratio, ratio);
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.strokeStyle = '#1d2433';
  }, []);

  const point = (event) => {
    const rect = canvas.current.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return [source.clientX - rect.left, source.clientY - rect.top];
  };

  const start = (event) => {
    event.preventDefault();
    drawing.current = true;
    const context = canvas.current.getContext('2d');
    context.beginPath();
    context.moveTo(...point(event));
  };
  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const context = canvas.current.getContext('2d');
    context.lineTo(...point(event));
    context.stroke();
    drawn.current = true;
  };
  const end = () => {
    if (drawing.current && drawn.current) onChange(canvas.current.toDataURL('image/png'));
    drawing.current = false;
  };
  const clear = () => {
    const element = canvas.current;
    element.getContext('2d').clearRect(0, 0, element.width, element.height);
    drawn.current = false;
    onChange(null);
  };

  return (
    <Box>
      <Box
        component="canvas"
        ref={canvas}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        sx={{
          width: '100%', height: 140, borderRadius: 2, border: '1px dashed', borderColor: 'divider', bgcolor: '#fff', touchAction: 'none', display: 'block',
        }}
      />
      <Button size="small" onClick={clear}>{clearLabel}</Button>
    </Box>
  );
};

export default SignaturePad;
