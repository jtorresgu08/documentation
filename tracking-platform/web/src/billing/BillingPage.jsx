import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, LinearProgress, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField,
  Tooltip, Typography,
} from '@mui/material';
import PaymentsIcon from '@mui/icons-material/Payments';
import BlockIcon from '@mui/icons-material/Block';
import LinkIcon from '@mui/icons-material/Link';
import SettingsIcon from '@mui/icons-material/Settings';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAdministrator, useManager, useModule } from '../common/util/permissions';
import { useCatch } from '../reactHelper';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { downloadCsv } from '../reports/reportPeriods';

const STATUS_COLORS = {
  pending: '#2563c9', overdue: '#d9534f', paid: '#2e9d5b', void: '#8a94a6',
};
const CURRENCIES = ['PEN', 'USD', 'CLP', 'COP', 'MXN', 'BOB', 'ARS'];
const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export const formatMoney = (amount, currency = 'PEN') => {
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toFixed(2)}`;
  }
};

const totals = (byCurrency) => (byCurrency && Object.keys(byCurrency).length
  ? Object.entries(byCurrency).map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')
  : formatMoney(0));

const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const ClientDialog = ({ client, onClose, onSaved }) => {
  const t = useTranslation();
  const [settings, setSettings] = useState(client?.settings);
  useEffect(() => setSettings(client?.settings), [client]);
  const save = useCatch(async () => {
    await fetchOrThrow(`/api/billing/clients/${client.id}`, {
      method: 'PUT',
      ...json({
        ...settings,
        price: Number(settings.price) || 0,
        fixedFee: Number(settings.fixedFee) || 0,
        day: Number(settings.day) || 1,
        dueDays: Number(settings.dueDays) || 0,
        graceDays: Number(settings.graceDays) || 0,
      }),
    });
    onSaved();
  });
  if (!client || !settings) return null;
  const number = (key, label, help) => (
    <TextField size="small" type="number" label={label} helperText={help} value={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} sx={{ flex: 1 }} />
  );
  const preview = (Number(settings.price) || 0) * client.units + (Number(settings.fixedFee) || 0);
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{`${t('billingConfigure')} · ${client.name}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {number('price', t('billingPricePerUnit'), `${client.units} ${t('billingUnitsNow')}`)}
            {number('fixedFee', t('billingFixedFee'), t('billingFixedFeeHelp'))}
            <TextField select size="small" label={t('billingCurrency')} value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })} sx={{ minWidth: 100 }}>
              {CURRENCIES.map((currency) => <MenuItem key={currency} value={currency}>{currency}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {number('day', t('billingDay'), t('billingDayHelp'))}
            {number('dueDays', t('billingDueDays'), t('billingDueDaysHelp'))}
            {number('graceDays', t('billingGraceDays'), t('billingGraceDaysHelp'))}
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={Boolean(settings.autoSuspend)} onChange={(event) => setSettings({ ...settings, autoSuspend: event.target.checked })} />}
            label={t('billingAutoSuspend')}
          />
          <Alert severity="info">{`${t('billingPreview')}: ${formatMoney(preview, settings.currency)} ${t('billingPerMonth')}`}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('sharedSave')}</Button>
      </DialogActions>
    </Dialog>
  );
};

const PaymentDialog = ({ invoice, onClose, onSaved }) => {
  const t = useTranslation();
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const save = useCatch(async () => {
    await fetchOrThrow(`/api/billing/invoices/${invoice.id}/paid`, { method: 'PUT', ...json({ method, reference }) });
    onSaved();
  });
  if (!invoice) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('billingRegisterPayment')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography>{`${invoice.userName} · ${invoice.period} · ${formatMoney(invoice.amount, invoice.currency)}`}</Typography>
          <TextField select size="small" label={t('billingMethod')} value={method} onChange={(event) => setMethod(event.target.value)}>
            {['transfer', 'cash', 'yape', 'plin', 'card', 'other'].map((item) => <MenuItem key={item} value={item}>{t(`billingMethod${capitalize(item)}`)}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('billingReference')} value={reference} onChange={(event) => setReference(event.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sharedCancel')}</Button>
        <Button variant="contained" onClick={save}>{t('billingMarkPaid')}</Button>
      </DialogActions>
    </Dialog>
  );
};

// Billing: what clients owe, invoices of the month, payments and suspensions; for clients, their invoices and the
// payment link
const BillingPage = () => {
  const t = useTranslation();
  const admin = useAdministrator();
  const manager = useManager();
  const billingModule = useModule('billing');
  const biller = admin || (manager && billingModule);
  const user = useSelector((state) => state.session.user);
  const [tab, setTab] = useState(biller ? 'invoices' : 'mine');
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [clients, setClients] = useState(null);
  const [status, setStatus] = useState('');
  const [configuring, setConfiguring] = useState(null);
  const [paying, setPaying] = useState(null);
  const [mercadoPago, setMercadoPago] = useState(false);

  const load = async () => {
    const requests = [fetch(`/api/billing/invoices${status ? `?status=${status}` : ''}`), fetch('/api/billing/me')];
    if (biller) requests.push(fetch('/api/billing/summary'), fetch('/api/billing/clients'));
    const [list, me, totalsResponse, clientsResponse] = await Promise.all(requests);
    if (list.ok) setInvoices(await list.json());
    if (me.ok) setMercadoPago((await me.json()).mercadoPago);
    if (totalsResponse?.ok) setSummary(await totalsResponse.json());
    if (clientsResponse?.ok) setClients(await clientsResponse.json());
  };
  useEffect(() => {
    load();
  }, [status]);

  const pay = useCatch(async (invoice) => {
    const response = await fetchOrThrow(`/api/billing/invoices/${invoice.id}/checkout`, { method: 'POST' });
    const updated = await response.json();
    if (updated.paymentUrl) window.open(updated.paymentUrl, '_blank', 'noopener');
    load();
  });
  const copyLink = useCatch(async (invoice) => {
    const response = await fetchOrThrow(`/api/billing/invoices/${invoice.id}/checkout`, { method: 'POST' });
    const updated = await response.json();
    await navigator.clipboard?.writeText(updated.paymentUrl);
    load();
  });
  const voidInvoice = useCatch(async (invoice) => {
    if (window.confirm(t('billingVoidConfirm'))) {
      await fetchOrThrow(`/api/billing/invoices/${invoice.id}/void`, { method: 'PUT' });
      load();
    }
  });
  const issue = useCatch(async (client) => {
    await fetchOrThrow(`/api/billing/clients/${client.id}/issue`, { method: 'POST' });
    load();
  });
  const runNow = useCatch(async () => {
    await fetchOrThrow('/api/billing/run', { method: 'POST' });
    load();
  });

  const kpi = (label, value, detail, color) => (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 160, p: 1.5, borderRadius: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>
      {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
    </Card>
  );

  const open = (invoice) => invoice.status === 'pending' || invoice.status === 'overdue';
  const mine = (invoices || []).filter((invoice) => invoice.userId === user.id);
  const managed = (invoices || []).filter((invoice) => invoice.userId !== user.id);
  const exportCsv = () => downloadCsv('facturas', [t('billingClient'), t('billingPeriod'), t('billingUnits'), t('billingAmount'), t('billingCurrency'), t('simStatusLabel'), t('billingDueDate'), t('billingPaidDate'), t('billingMethod'), t('billingReference')],
    managed.map((invoice) => [invoice.userName, invoice.period, invoice.units, invoice.amount, invoice.currency, t(`billingStatus${capitalize(invoice.status)}`), invoice.dueDate && dayjs(invoice.dueDate).format('DD/MM/YYYY'), invoice.paidDate && dayjs(invoice.paidDate).format('DD/MM/YYYY'), invoice.paymentMethod, invoice.paymentRef]));

  const invoiceRows = (list, asClient) => (
    <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {!asClient && <TableCell>{t('billingClient')}</TableCell>}
            <TableCell>{t('billingPeriod')}</TableCell>
            <TableCell align="right">{t('billingUnits')}</TableCell>
            <TableCell align="right">{t('billingAmount')}</TableCell>
            <TableCell>{t('billingDueDate')}</TableCell>
            <TableCell>{t('simStatusLabel')}</TableCell>
            <TableCell>{t('billingPayment')}</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map((invoice) => (
            <TableRow key={invoice.id} hover>
              {!asClient && <TableCell sx={{ fontWeight: 700 }}>{invoice.userName}</TableCell>}
              <TableCell>{dayjs(`${invoice.period}-01`).format('MMMM YYYY')}</TableCell>
              <TableCell align="right">{invoice.units}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{formatMoney(invoice.amount, invoice.currency)}</TableCell>
              <TableCell sx={{ color: invoice.status === 'overdue' ? '#d9534f' : undefined }}>{invoice.dueDate ? dayjs(invoice.dueDate).format('DD/MM/YYYY') : '—'}</TableCell>
              <TableCell>
                <Chip size="small" label={t(`billingStatus${capitalize(invoice.status)}`)} sx={{ bgcolor: `${STATUS_COLORS[invoice.status]}22`, color: STATUS_COLORS[invoice.status], fontWeight: 700 }} />
              </TableCell>
              <TableCell>
                {invoice.paidDate ? (
                  <Typography variant="caption">{`${dayjs(invoice.paidDate).format('DD/MM/YYYY')} · ${t(`billingMethod${capitalize(invoice.paymentMethod || 'other')}`)}${invoice.paymentRef ? ` · ${invoice.paymentRef}` : ''}`}</Typography>
                ) : '—'}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {open(invoice) && asClient && mercadoPago && (
                  <Button size="small" variant="contained" startIcon={<PaymentsIcon />} onClick={() => pay(invoice)}>{t('billingPay')}</Button>
                )}
                {open(invoice) && !asClient && (
                  <>
                    <Tooltip title={t('billingRegisterPayment')}><IconButton size="small" onClick={() => setPaying(invoice)}><PaymentsIcon fontSize="small" /></IconButton></Tooltip>
                    {mercadoPago && <Tooltip title={t('billingCopyLink')}><IconButton size="small" onClick={() => copyLink(invoice)}><LinkIcon fontSize="small" /></IconButton></Tooltip>}
                    <Tooltip title={t('billingVoid')}><IconButton size="small" onClick={() => voidInvoice(invoice)}><BlockIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!list.length && (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>{t('billingEmpty')}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700}>{t('billingTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">{biller ? t('billingSubtitle') : t('billingSubtitleClient')}</Typography>
        </Box>
        {biller && tab === 'invoices' && (
          <>
            <TextField select size="small" label={t('simStatusLabel')} value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 150 }}>
              <MenuItem value="">{t('simAll')}</MenuItem>
              {['pending', 'overdue', 'paid', 'void'].map((item) => <MenuItem key={item} value={item}>{t(`billingStatus${capitalize(item)}`)}</MenuItem>)}
            </TextField>
            <Chip label="CSV" variant="outlined" onClick={() => managed.length && exportCsv()} />
          </>
        )}
        {admin && <Button variant="outlined" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} startIcon={<ReceiptLongIcon />} onClick={runNow}>{t('billingRunNow')}</Button>}
      </Stack>
      {biller && summary && (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {kpi(t('billingPending'), totals(summary.pending), t('billingPendingHelp'), STATUS_COLORS.pending)}
          {kpi(t('billingOverdue'), totals(summary.overdue), t('billingOverdueHelp'), STATUS_COLORS.overdue)}
          {kpi(t('billingCollected'), totals(summary.paidThisMonth), t('billingCollectedHelp'), STATUS_COLORS.paid)}
          {kpi(t('billingClients'), summary.billedClients, `${summary.suspended} ${t('billingSuspendedCount')}`)}
          {kpi('Mercado Pago', summary.mercadoPago ? t('billingConnected') : t('billingNotConnected'), summary.mercadoPago ? t('billingConnectedHelp') : t('billingNotConnectedHelp'), summary.mercadoPago ? STATUS_COLORS.paid : '#8a94a6')}
        </Stack>
      )}
      {biller && (
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab value="invoices" label={t('billingInvoices')} />
          <Tab value="clients" label={t('billingClients')} />
          {mine.length > 0 && <Tab value="mine" label={t('billingMine')} />}
        </Tabs>
      )}
      {!invoices && <LinearProgress />}
      {invoices && tab === 'invoices' && invoiceRows(managed, false)}
      {invoices && tab === 'mine' && invoiceRows(mine, true)}
      {tab === 'clients' && clients && (
        <Card variant="outlined" sx={{ borderRadius: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('billingClient')}</TableCell>
                <TableCell align="right">{t('billingUnits')}</TableCell>
                <TableCell>{t('billingRate')}</TableCell>
                <TableCell>{t('billingDay')}</TableCell>
                <TableCell align="right">{t('billingOpen')}</TableCell>
                <TableCell>{t('simStatusLabel')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{client.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{client.email}</Typography>
                  </TableCell>
                  <TableCell align="right">{client.units}</TableCell>
                  <TableCell>
                    {client.billed
                      ? `${formatMoney(client.settings.price, client.settings.currency)} × ${t('billingUnit')}${client.settings.fixedFee ? ` + ${formatMoney(client.settings.fixedFee, client.settings.currency)}` : ''}`
                      : <Typography variant="caption" color="text.secondary">{t('billingNotBilled')}</Typography>}
                  </TableCell>
                  <TableCell>{client.billed ? client.settings.day : '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: client.overdue ? STATUS_COLORS.overdue : undefined }}>
                    {client.openAmount ? formatMoney(client.openAmount, client.settings.currency) : '—'}
                  </TableCell>
                  <TableCell>
                    {client.suspended && <Chip size="small" color="error" label={t('billingSuspended')} />}
                    {!client.suspended && client.overdue > 0 && <Chip size="small" sx={{ bgcolor: '#d9534f22', color: '#d9534f' }} label={t('billingStatusOverdue')} />}
                    {!client.suspended && !client.overdue && client.billed && <Chip size="small" sx={{ bgcolor: '#2e9d5b22', color: '#2e9d5b' }} label={t('billingUpToDate')} />}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={t('billingConfigure')}><IconButton size="small" onClick={() => setConfiguring(client)}><SettingsIcon fontSize="small" /></IconButton></Tooltip>
                    {client.billed && <Tooltip title={t('billingIssueNow')}><IconButton size="small" onClick={() => issue(client)}><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {configuring && <ClientDialog client={configuring} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); load(); }} />}
      {paying && <PaymentDialog invoice={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </Container>
  );
};

export default BillingPage;
