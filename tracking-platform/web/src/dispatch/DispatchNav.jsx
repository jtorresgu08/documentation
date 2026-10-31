import { useLocation, useNavigate } from 'react-router-dom';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';

// switch between trips, the order pool and the planner
const DispatchNav = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  let value = '/dispatch';
  if (pathname.startsWith('/dispatch/orders')) value = '/dispatch/orders';
  else if (pathname.startsWith('/dispatch/planner')) value = '/dispatch/planner';
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, next) => next && navigate(next)} sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.5, textTransform: 'none', fontWeight: 600 } }}>
      <ToggleButton value="/dispatch">{t('dispatchTrips')}</ToggleButton>
      <ToggleButton value="/dispatch/orders">{t('dispatchOrders')}</ToggleButton>
      <ToggleButton value="/dispatch/planner">{t('dispatchPlanner')}</ToggleButton>
    </ToggleButtonGroup>
  );
};

export default DispatchNav;
