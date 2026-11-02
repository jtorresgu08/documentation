import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, Divider, Paper, Stack, Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { BRAND_LOGO, BRAND_NAME } from '../common/util/brandDefaults';
import { useBrandAttribute } from '../common/util/brand';
import { OrderReport } from './InstallationsPage';
import { stockTypeLabel, typeLabel } from './installationsUtils';

// Public installation report of a completed work order, ready to print or save as PDF
const ActaPage = () => {
  const t = useTranslation();
  const { token } = useParams();
  const logo = useBrandAttribute('logo');
  const [order, setOrder] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/installer/acta/${token}`).then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((data) => {
      setOrder(data);
      document.title = `${t('instReport')} #${data.id} · ${data.plate || data.clientName}`;
    }).catch(() => setFailed(true));
  }, [token]);

  if (failed) return <Container sx={{ py: 4 }}><Alert severity="error">{t('instReportNotFound')}</Alert></Container>;
  if (!order) return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>;

  const row = (label, value) => (
    <Box sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'pre-wrap' }}>{value || '—'}</Typography>
    </Box>
  );
  const duration = order.startedAt && order.completedAt ? Math.round((new Date(order.completedAt) - new Date(order.startedAt)) / 60000) : null;

  return (
    <Box sx={{ bgcolor: '#eef2f8', minHeight: '100%', py: { xs: 0, sm: 3 }, '@media print': { bgcolor: '#fff', py: 0 } }}>
      <Container maxWidth="md" disableGutters>
        <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, borderRadius: { xs: 0, sm: 3 }, '@media print': { boxShadow: 'none' } }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box component="img" src={logo || BRAND_LOGO} alt="" sx={{ height: 54 }} />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h5" fontWeight={800} color="#0a2453">{t('instReportTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">{`${typeLabel(t, order.type)} · ${t('instOrder')} #${order.id}`}</Typography>
            </Box>
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ '@media print': { display: 'none' } }}>{t('instPrint')}</Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3 }}>
            {row(t('instClient'), order.clientName)}
            {row(t('instContact'), [order.contactName, order.contactPhone].filter(Boolean).join(' · '))}
            {row(t('instAddress'), order.address)}
            {row(t('instVehicle'), [order.plate, order.vehicle].filter(Boolean).join(' · '))}
            {row('IMEI', order.uniqueId)}
            {row('ICCID (SIM)', order.iccid)}
            {row(t('instOdometer'), order.odometer)}
            {row(t('instTechnician'), order.technicianName)}
            {row(t('instStarted'), order.startedAt && dayjs(order.startedAt).format('DD/MM/YYYY HH:mm'))}
            {row(t('instCompletedAt'), `${dayjs(order.completedAt).format('DD/MM/YYYY HH:mm')}${duration != null ? ` (${duration} min)` : ''}`)}
          </Box>
          {row(t('instEquipment'), order.items.map((item) => `${stockTypeLabel(t, item.type)} ${item.model || ''} — ${item.serial}`).join('\n'))}
          {order.techNotes && row(t('instTechNotes'), order.techNotes)}
          {(order.latitude || order.longitude) ? row(t('instLocation'), `${order.latitude.toFixed(5)}, ${order.longitude.toFixed(5)}`) : null}
          <Typography fontWeight={700} sx={{ mt: 3, mb: 1 }}>{t('instChecklistAndEvidence')}</Typography>
          <OrderReport order={order} photoUrl={(photo) => `/api/installer/acta/${token}/photos/${photo.id}`} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            {`${t('instReportFooter')} ${order.company || BRAND_NAME}.`}
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
};

export default ActaPage;
