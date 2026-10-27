import { useId } from 'react';
import { useTheme } from '@mui/material';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { useTranslation } from '../../common/components/LocalizationProvider';

// circle with an arrow on top of the fill / drain line, and the amount next to it
const ChangeMarker = ({ viewBox, color, up, text, faded }) => {
  if (!viewBox) {
    return null;
  }
  const { x, y } = viewBox;
  return (
    <g opacity={faded ? 0.35 : 1}>
      <circle cx={x} cy={y + 9} r={9} fill={color} />
      <path
        d={up ? `M${x} ${y + 4} L${x - 4} ${y + 9} M${x} ${y + 4} L${x + 4} ${y + 9} M${x} ${y + 4} L${x} ${y + 14}`
          : `M${x} ${y + 14} L${x - 4} ${y + 9} M${x} ${y + 14} L${x + 4} ${y + 9} M${x} ${y + 14} L${x} ${y + 4}`}
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <text x={x + 14} y={y + 13} fill={color} fontSize={12} fontWeight={700}>{text}</text>
    </g>
  );
};

const FuelChart = ({
  points, changes, unit, scale, reviews, selected, height = 300,
}) => {
  const theme = useTheme();
  const t = useTranslation();
  const gradient = useId().replace(/:/g, '');

  const fill = theme.palette.success.main;
  const drain = theme.palette.error.main;
  const data = points.map((point) => ({
    ...point, level: point.level * scale, value: point.value * scale,
  }));
  const span = points.length ? points[points.length - 1].time - points[0].time : 0;
  const format = span > 3 * 24 * 3600 * 1000 ? 'DD MMM' : 'DD MMM HH:mm';
  const labels = { level: t('fuelLevel'), value: t('fuelRaw'), speed: t('positionSpeed') };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.28} />
            <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value) => dayjs(value).format(format)}
          stroke={theme.palette.text.secondary}
          fontSize={12}
          minTickGap={24}
        />
        <YAxis
          yAxisId="fuel"
          stroke={theme.palette.text.secondary}
          fontSize={12}
          width={56}
          label={{ value: `${t('fuelTitle')} (${unit})`, angle: -90, position: 'insideLeft', fontSize: 12, fill: theme.palette.text.secondary, dy: 50 }}
        />
        <YAxis
          yAxisId="speed"
          orientation="right"
          stroke={theme.palette.text.disabled}
          fontSize={12}
          width={56}
          label={{ value: `${t('positionSpeed')} (km/h)`, angle: 90, position: 'insideRight', fontSize: 12, fill: theme.palette.text.disabled, dy: -50 }}
        />
        <Tooltip
          labelFormatter={(value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss')}
          formatter={(value, key) => [key === 'speed' ? `${value} km/h` : `${Number(value).toFixed(1)} ${unit}`, labels[key]]}
          contentStyle={{ backgroundColor: theme.palette.background.paper, borderRadius: 8, border: `1px solid ${theme.palette.divider}` }}
        />
        <Area yAxisId="speed" type="stepAfter" dataKey="speed" stroke="none" fill={theme.palette.text.disabled} fillOpacity={0.12} dot={false} isAnimationActive={false} />
        <Line yAxisId="fuel" type="monotone" dataKey="value" stroke={theme.palette.primary.light} strokeOpacity={0.35} strokeWidth={1} dot={false} isAnimationActive={false} />
        <Area yAxisId="fuel" type="monotone" dataKey="level" stroke={theme.palette.primary.main} strokeWidth={2.5} fill={`url(#${gradient})`} dot={false} isAnimationActive={false} />
        {changes.map((change) => {
          const color = change.type === 'fill' ? fill : drain;
          const amount = (change.amount * scale).toFixed(1);
          return (
            <ReferenceLine
              key={change.time}
              yAxisId="fuel"
              x={change.time}
              stroke={color}
              strokeDasharray="4 4"
              strokeWidth={selected === change.time ? 2.5 : 1.5}
              strokeOpacity={reviews[change.time] === 'false' ? 0.35 : 1}
              label={(
                <ChangeMarker
                  color={color}
                  up={change.type === 'fill'}
                  text={`${change.type === 'fill' ? '+' : '−'}${amount} ${unit}`}
                  faded={reviews[change.time] === 'false'}
                />
              )}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default FuelChart;
