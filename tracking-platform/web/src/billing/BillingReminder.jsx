import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatMoney } from './BillingPage';

const DISMISSED = 'billingReminderDismissed';

// Payment reminder for clients: an invoice due in the next 5 days or overdue
const BillingReminder = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    let dismissed = null;
    try {
      dismissed = window.sessionStorage.getItem(DISMISSED);
    } catch {
      dismissed = null;
    }
    fetch('/api/billing/me').then((response) => (response.ok ? response.json() : null)).then((data) => {
      const urgent = data?.open?.find((item) => item.status === 'overdue' || (item.daysLeft != null && item.daysLeft <= 5));
      if (urgent && dismissed !== String(urgent.id)) setInvoice(urgent);
    }).catch(() => {});
  }, []);

  if (!invoice) return null;
  const overdue = invoice.status === 'overdue';
  const close = () => {
    try {
      window.sessionStorage.setItem(DISMISSED, String(invoice.id));
    } catch {
      // the reminder simply shows again
    }
    setInvoice(null);
  };
  return (
    <Alert
      severity={overdue ? 'error' : 'warning'}
      onClose={close}
      action={<Button color="inherit" size="small" onClick={() => navigate('/billing')}>{t('billingPay')}</Button>}
      sx={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, boxShadow: 4, maxWidth: 'calc(100% - 32px)',
      }}
    >
      {overdue
        ? `${t('billingReminderOverdue')} ${formatMoney(invoice.amount, invoice.currency)}`
        : `${t('billingReminderDue')} ${formatMoney(invoice.amount, invoice.currency)} · ${invoice.daysLeft <= 0 ? t('billingDueToday') : `${invoice.daysLeft} ${t('billingDaysLeft')}`}`}
    </Alert>
  );
};

export default BillingReminder;
