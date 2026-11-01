import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, LinearProgress, Rating, Stack, TextField, Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MapView from '../map/core/MapView';
import { sessionActions } from '../store';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useBrandAttribute } from '../common/util/brand';
import DispatchMap from './DispatchMap';
import GoogleEmbed from '../common/components/GoogleEmbed';
import { formatHour, formatWindow } from './dispatchUtils';

// Customer tracking page (public link per stop): status of the delivery, estimated arrival, stops before theirs,
// the vehicle on the map while it is on the way, and who received it once delivered
const DeliveryTrackPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const dispatch = useDispatch();
  const { token } = useParams();
  const user = useSelector((state) => state.session.user);
  const brandName = useBrandAttribute('title');
  const brandLogo = useBrandAttribute('logo');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [showRoute, setShowRoute] = useState(false);

  const rate = async () => {
    const response = await fetch(`/api/dispatch/track/${token}/rating`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: stars, comment }),
    });
    if (response.ok) setData(await response.json());
  };

  useEffect(() => {
    // the map reads the user preferences: visitors get an empty guest profile
    if (!user) dispatch(sessionActions.updateUser({ id: 0, name: '', attributes: {} }));
  }, []);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/dispatch/track/${token}`);
      if (response.ok) setData(await response.json());
      else setError(true);
    };
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [token]);

  if (error) return <Box sx={{ p: 3 }}><Alert severity="warning">{t('dispatchLinkInvalid')}</Alert></Box>;

  let headline = t('dispatchTrackPreparing');
  let color = theme.palette.primary.main;
  let Icon = LocalShippingIcon;
  if (data?.status === 'delivered') {
    headline = t('dispatchTrackDelivered').replace('{0}', formatHour(data.completedTime));
    color = '#2f9e5b';
    Icon = CheckCircleIcon;
  } else if (data?.status === 'failed') {
    headline = t('dispatchTrackFailed');
    color = '#d9534f';
    Icon = CancelIcon;
  } else if (data?.status === 'arrived') {
    headline = t('dispatchTrackArrived');
    color = '#e79a2b';
  } else if (data?.tripStatus === 'inProgress') {
    headline = data.eta ? t('dispatchTrackEta').replace('{0}', formatHour(data.eta)) : t('dispatchTrackOnTheWay');
  }

  const stop = data ? [{
    id: 0, sequence: '•', latitude: data.latitude, longitude: data.longitude, status: data.status,
  }] : [];

  return (
    <Box sx={{ position: 'fixed', inset: 0 }}>
      {user && data && (
        <MapView>
          <DispatchMap stops={stop} position={data.position} fitKey={data.position ? 'vehicle' : 'stop'} padding={{ top: 60, bottom: 300, left: 60, right: 60 }} />
        </MapView>
      )}
      <Card sx={{
        position: 'absolute', left: 12, right: 12, bottom: 16, mx: 'auto', maxWidth: 440, p: 2.5, borderRadius: 4, bgcolor: alpha(theme.palette.background.paper, 0.94), backdropFilter: 'blur(12px)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
      }}
      >
        {!data && <LinearProgress />}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          {brandLogo && <Box component="img" src={brandLogo} alt="" sx={{ height: 28 }} />}
          <Typography fontWeight={700} sx={{ flexGrow: 1 }}>{brandName || t('dispatchTrackTitle')}</Typography>
        </Stack>
        {data && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(color, 0.1) }}>
              <Icon sx={{ color, fontSize: 34 }} />
              <Box>
                <Typography variant="body2" color="text.secondary">{data.orderCode ? `${t('dispatchOrderCode')} ${data.orderCode}` : data.name}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.25 }}>{headline}</Typography>
              </Box>
            </Stack>
            {data.googleKey && data.position && (
              showRoute
                ? <GoogleEmbed googleKey={data.googleKey} height={220} title={t('googleRoute')} mode="directions" origin={data.position} destination={data} />
                : <Button size="small" variant="outlined" onClick={() => setShowRoute(true)}>{t('googleSeeRoute')}</Button>
            )}
            {data.status === 'pending' && data.tripStatus === 'inProgress' && data.stopsBefore > 0 && (
              <Typography variant="body2">{t('dispatchTrackStopsBefore').replace('{0}', data.stopsBefore)}</Typography>
            )}
            {formatWindow(data) && (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ScheduleIcon fontSize="small" color="action" />
                <Typography variant="body2">{`${t('dispatchWindow')}: ${formatWindow(data)}`}</Typography>
              </Stack>
            )}
            {data.recipient && <Typography variant="body2">{`${t('dispatchRecipient')}: ${data.recipient}`}</Typography>}
            {(data.fields || []).map((field) => (
              <Typography key={field.label} variant="body2">{`${field.label}: ${field.type === 'checkbox' ? (field.value ? t('sharedYes') : t('sharedNo')) : field.value}`}</Typography>
            ))}
            {data.failureReason && <Typography variant="body2" sx={{ color: '#d9534f' }}>{data.failureReason}</Typography>}
            {data.canRate && (
              <Box sx={{ p: 1.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" fontWeight={600}>{t('dispatchRateQuestion')}</Typography>
                <Rating size="large" value={stars} onChange={(_, value) => setStars(value || 0)} />
                {stars > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <TextField size="small" fullWidth placeholder={t('dispatchRateComment')} value={comment} onChange={(event) => setComment(event.target.value)} />
                    <Button variant="contained" onClick={rate}>{t('dispatchRateSend')}</Button>
                  </Stack>
                )}
              </Box>
            )}
            {data.rating && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Rating size="small" readOnly value={data.rating} />
                <Typography variant="caption" color="text.secondary">{t('dispatchRateThanks')}</Typography>
              </Stack>
            )}
            {(data.vehicle || data.driverName) && (
              <Typography variant="caption" color="text.secondary">{[data.vehicle, data.driverName].filter(Boolean).join(' · ')}</Typography>
            )}
          </Stack>
        )}
      </Card>
    </Box>
  );
};

export default DeliveryTrackPage;
