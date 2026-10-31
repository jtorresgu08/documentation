import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Chip, Stack, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import dayjs from 'dayjs';
import FloatingPanel from './FloatingPanel';
import { Empty, formatAgo, usePolling } from './panelUtils';
import { useTranslation } from '../common/components/LocalizationProvider';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { setMapFilter } from '../common/util/mapFilter';
import { GRADE_COLORS } from '../operations/ConnectionQualityPage';
import { capitalize } from '../operations/alertUtils';
import { devicesActions } from '../store';

const ISSUE_ORDER = ['offline', 'noData', 'lowPower', 'gaps', 'weakGps', 'invalidFix', 'weakSignal', 'fewReports', 'reconnects', 'clock'];

// Units with connection problems in the last 24 hours, worst first: not reporting, no power, gaps, weak GPS or
// signal…, with the issue filter, a shortcut to show them on the map and the full quality report
const QualityPanel = ({ panel, onTop }) => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const devices = useSelector((state) => state.devices.items);
  const [items, setItems] = useState(null);
  const [issue, setIssue] = useState(null);

  usePolling(async () => {
    const ids = Object.keys(devices);
    if (!ids.length) return;
    const query = new URLSearchParams({ from: dayjs().subtract(24, 'hour').toISOString(), to: dayjs().toISOString() });
    ids.forEach((id) => query.append('deviceId', id));
    try {
      setItems(await (await fetchOrThrow(`/api/quality?${query}`)).json());
    } catch {
      setItems((current) => current || []);
    }
  }, 300000, [Object.keys(devices).length]);

  const problems = useMemo(() => (items || []).filter((item) => item.issues?.length), [items]);
  const counts = useMemo(() => {
    const result = {};
    problems.forEach((item) => item.issues.forEach((key) => { result[key] = (result[key] || 0) + 1; }));
    return ISSUE_ORDER.filter((key) => result[key]).map((key) => [key, result[key]]);
  }, [problems]);
  const visible = issue ? problems.filter((item) => item.issues.includes(issue)) : problems;
  const average = items?.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : null;
  const gradeColor = (score) => {
    if (score >= 85) return GRADE_COLORS.excellent;
    if (score >= 70) return GRADE_COLORS.good;
    if (score >= 50) return GRADE_COLORS.fair;
    return GRADE_COLORS.poor;
  };

  return (
    <FloatingPanel
      panel={panel}
      onTop={onTop}
      icon={<SignalCellularAltIcon fontSize="small" />}
      color={GRADE_COLORS.fair}
      title={t('qualityTitle')}
      subtitle={items ? `${problems.length} ${t('qualityWithIssues').toLowerCase()} · ${t('qualityFleetScore')} ${average ?? '—'}` : t('sharedLoading')}
      width={370}
      height={440}
      footer={(
        <Stack direction="row" spacing={1}>
          {visible.length > 0 && (
            <Button size="small" onClick={() => { setMapFilter({ key: 'quality', label: issue ? t(`qualityIssue${capitalize(issue)}`) : t('qualityWithIssues'), deviceIds: visible.map((item) => item.deviceId) }); navigate('/'); }}>
              {t('panelShowOnMap')}
            </Button>
          )}
          <Button size="small" onClick={() => navigate('/reports/quality')}>{t('panelOpenReport')}</Button>
        </Stack>
      )}
    >
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
        {counts.map(([key, count]) => (
          <Chip key={key} size="small" label={`${t(`qualityIssue${capitalize(key)}`)} · ${count}`} color={issue === key ? 'warning' : 'default'} variant={issue === key ? 'filled' : 'outlined'} onClick={() => setIssue(issue === key ? null : key)} sx={{ height: 22, fontSize: 11 }} />
        ))}
      </Stack>
      {items && !visible.length && <Empty>{t('panelNoQualityIssues')}</Empty>}
      <Stack spacing={0.5}>
        {visible.slice(0, 40).map((item) => (
          <Stack
            key={item.deviceId}
            direction="row"
            spacing={1}
            alignItems="center"
            onClick={() => { dispatch(devicesActions.selectId(item.deviceId)); navigate('/'); }}
            sx={{ p: 0.75, borderRadius: '10px', cursor: 'pointer', '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06) } }}
          >
            <Box sx={{
              width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800,
              color: gradeColor(item.score), border: `3px solid ${alpha(gradeColor(item.score), 0.5)}`,
            }}
            >
              {item.score}
            </Box>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" fontWeight={700} noWrap>{item.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {item.issues.slice(0, 3).map((key) => t(`qualityIssue${capitalize(key)}`)).join(' · ')}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">{formatAgo(item.lastUpdate)}</Typography>
          </Stack>
        ))}
      </Stack>
    </FloatingPanel>
  );
};

export default QualityPanel;
