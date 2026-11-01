import { Box, Tooltip, Typography } from '@mui/material';

export const TIRE_COLORS = {
  ok: '#2f9e5b', low: '#d9534f', high: '#e67e22', hot: '#b0306a', no_data: '#a3abb8',
};

// Vehicle seen from above, front at the top: each axle with 2 or 4 tires, colored by state, with pressure (and
// temperature when large)
const TireDiagram = ({
  config, wheels, size = 'small', unit, t,
}) => {
  const large = size === 'large';
  const axleGap = large ? 74 : 40;
  const tireW = large ? 26 : 13;
  const tireH = large ? 46 : 24;
  const bodyW = large ? 96 : 50;
  const axles = config.axles;
  const height = axles.length * axleGap + (large ? 40 : 20);
  const width = bodyW + 4 * tireW + (large ? 150 : 24);
  const byNumber = Object.fromEntries((wheels || []).map((wheel) => [wheel.number, wheel]));
  let number = 1;
  const items = [];
  axles.forEach((count, axle) => {
    const y = (large ? 26 : 12) + axle * axleGap;
    const xs = count === 2
      ? [-bodyW / 2 - tireW - 4, bodyW / 2 + 4]
      : [-bodyW / 2 - 2 * tireW - 6, -bodyW / 2 - tireW - 3, bodyW / 2 + 3, bodyW / 2 + tireW + 6];
    xs.forEach((x, index) => {
      const wheel = byNumber[number] || { number, status: 'no_data' };
      items.push({
        ...wheel, x, y, index, count, axle,
      });
      number += 1;
    });
  });
  const cx = width / 2;
  return (
    <Box sx={{ position: 'relative', width, height, mx: 'auto' }}>
      <Box sx={{
        position: 'absolute', left: cx - bodyW / 2, top: 0, width: bodyW, height, borderRadius: large ? '28px 28px 10px 10px' : '14px 14px 6px 6px', bgcolor: 'action.hover', border: '2px solid', borderColor: 'divider',
      }}
      />
      {axles.map((count, axle) => (
        <Box key={`axle-${axle}`} sx={{ position: 'absolute', left: cx - bodyW / 2 - 2 * tireW, top: (large ? 26 : 12) + axle * axleGap + tireH / 2 - 1, width: bodyW + 4 * tireW, height: 3, bgcolor: 'text.disabled' }} />
      ))}
      {items.map((wheel) => {
        const color = TIRE_COLORS[wheel.status] || TIRE_COLORS.no_data;
        const left = wheel.x < 0;
        const outer = wheel.count === 2 || wheel.index === 0 || wheel.index === 3;
        return (
          <Tooltip
            key={wheel.number}
            title={`${wheel.name || wheel.number}: ${wheel.pressure != null ? `${wheel.pressure} ${unit}` : t('tpmsNoData')}${wheel.temperature != null ? ` · ${wheel.temperature} °C` : ''}`}
          >
            <Box>
              <Box sx={{
                position: 'absolute', left: cx + wheel.x, top: wheel.y, width: tireW, height: tireH, borderRadius: large ? 2 : 1, bgcolor: color, boxShadow: wheel.status !== 'ok' && wheel.status !== 'no_data' ? `0 0 0 3px ${color}55` : 'none',
              }}
              />
              {large && outer && (
                <Box sx={{
                  position: 'absolute', top: wheel.y + 2, width: 66, textAlign: left ? 'right' : 'left', left: left ? cx + wheel.x - 72 : cx + wheel.x + tireW + 6,
                }}
                >
                  <Typography variant="body2" fontWeight={800} sx={{ color, lineHeight: 1.1 }}>{wheel.pressure != null ? wheel.pressure : '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{wheel.temperature != null ? `${wheel.temperature} °C` : unit}</Typography>
                </Box>
              )}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default TireDiagram;
