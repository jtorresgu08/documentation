import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
} from '@mui/material';

// package code reading with the phone camera (BarcodeDetector where the browser has it) or typed by hand
const ScanDialog = ({
  open, onClose, onCode, labels,
}) => {
  const video = useRef(null);
  const [manual, setManual] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let stream;
    let timer;
    let stopped = false;
    (async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        setSupported(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector();
        timer = setInterval(async () => {
          try {
            const codes = await detector.detect(video.current);
            codes.forEach((code) => onCode(code.rawValue));
          } catch {
            // frame not ready
          }
        }, 400);
      } catch {
        setSupported(false);
      }
    })();
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>{labels.title}</DialogTitle>
      <DialogContent>
        {supported ? (
          <Box component="video" ref={video} muted playsInline sx={{ width: '100%', borderRadius: 2, bgcolor: '#000', maxHeight: 280 }} />
        ) : <Alert severity="info">{labels.unsupported}</Alert>}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <TextField size="small" fullWidth label={labels.manual} value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && manual.trim()) { onCode(manual.trim()); setManual(''); } }} />
          <Button variant="outlined" disabled={!manual.trim()} onClick={() => { onCode(manual.trim()); setManual(''); }}>{labels.add}</Button>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{labels.done}</Button></DialogActions>
    </Dialog>
  );
};

export default ScanDialog;
