import { Box, Tooltip, Typography } from '@mui/material';

const km = (meters) => (meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`);

// greedy rows so that labels closer than the given fraction of the strip do not overlap
const levels = (positions, spacing) => {
  const last = [];
  return positions.map((position) => {
    let level = 0;
    while (last[level] !== undefined && position - last[level] < spacing) level += 1;
    last[level] = position;
    return level;
  });
};

const LINE_TOP = 128;

// Line strip: stops along the line and the buses at their progress, with the distance and minutes between each bus
// and the one ahead (red when bunched, orange when there is a gap); on circular lines the last gap wraps around
const LineDiagram = ({
  live, color, circular, onSelect, selectedId, t,
}) => {
  const { summary, stops, units } = live;
  const length = summary.lengthKm * 1000;
  const lineColor = color || '#2563c9';
  const running = units.filter((unit) => unit.along !== undefined && unit.along !== null && unit.active && !unit.offRoute)
    .sort((a, b) => a.along - b.along);
  const fraction = (along) => Math.min(1, Math.max(0, along / length));
  const x = (along) => `${fraction(along) * 100}%`;
  const gapColor = (meters) => {
    if (meters < summary.bunchingKm * 1000) return '#d9534f';
    if (summary.gapKm && meters > summary.gapKm * 1000) return '#e79a2b';
    return '#2f9e5b';
  };
  const gaps = [];
  running.forEach((unit, index) => {
    const ahead = running[index + 1];
    if (ahead) gaps.push({ from: unit.along, to: ahead.along, meters: unit.aheadMeters, minutes: unit.aheadMinutes });
  });
  const wrap = circular && running.length > 1 ? running[running.length - 1] : null;
  const labels = [...gaps.map((gap) => fraction((gap.from + gap.to) / 2)), ...(wrap ? [1] : [])];
  const labelLevels = levels(labels, 0.15);
  const chipLevels = levels(running.map((unit) => fraction(unit.along)), 0.1);

  return (
    <Box sx={{ position: 'relative', height: 240, mx: 3 }}>
      {gaps.map((gap, index) => {
        const tone = gapColor(gap.meters);
        return (
          <Box key={`${gap.from}-${gap.to}`}>
            <Box sx={{
              position: 'absolute', top: 58, height: 8, left: x(gap.from), width: x(gap.to - gap.from), border: `2px solid ${tone}`, borderBottom: 'none', borderRadius: '6px 6px 0 0',
            }}
            />
            <Typography
              variant="caption"
              sx={{
                position: 'absolute', top: 36 - labelLevels[index] * 18, left: x((gap.from + gap.to) / 2), transform: 'translateX(-50%)', fontWeight: 700, color: tone, whiteSpace: 'nowrap', bgcolor: 'background.paper', px: 0.5, borderRadius: 1, lineHeight: 1.5,
              }}
            >
              {`${km(gap.meters)} · ${gap.minutes} min`}
            </Typography>
          </Box>
        );
      })}
      {wrap && (
        <>
          <Box sx={{
            position: 'absolute', top: 58, height: 8, left: x(wrap.along), right: 0, border: `2px dashed ${gapColor(wrap.aheadMeters)}`, borderBottom: 'none', borderRight: 'none', borderRadius: '6px 0 0 0',
          }}
          />
          <Typography
            variant="caption"
            sx={{
              position: 'absolute', top: 36 - labelLevels[labels.length - 1] * 18, right: -12, fontWeight: 700, color: gapColor(wrap.aheadMeters), whiteSpace: 'nowrap', bgcolor: 'background.paper', px: 0.5, borderRadius: 1, lineHeight: 1.5,
            }}
          >
            {`↻ ${km(wrap.aheadMeters)} · ${wrap.aheadMinutes} min`}
          </Typography>
        </>
      )}
      <Box sx={{
        position: 'absolute', top: LINE_TOP, left: 0, right: 0, height: 8, borderRadius: 4, bgcolor: lineColor, opacity: 0.85,
      }}
      />
      {stops.map((stop) => (
        <Box key={`${stop.name}-${stop.along}`} sx={{ position: 'absolute', top: LINE_TOP - 6, left: x(stop.along), transform: 'translateX(-50%)' }}>
          <Box sx={{
            width: 20, height: 20, borderRadius: '50%', bgcolor: '#fff', border: `4px solid ${lineColor}`, boxSizing: 'border-box',
          }}
          />
          <Typography
            variant="caption"
            sx={{
              position: 'absolute', top: 24, left: '50%', transformOrigin: 'left top', transform: 'rotate(30deg)', whiteSpace: 'nowrap', color: 'text.secondary',
            }}
          >
            {stop.name}
          </Typography>
        </Box>
      ))}
      {running.map((unit, index) => {
        const selected = unit.deviceId === selectedId;
        const top = 96 - chipLevels[index] * 26;
        return (
          <Tooltip key={unit.deviceId} title={`${unit.name} · ${unit.speed ?? 0} km/h${unit.nextStopName ? ` · ${t('transitNext')} ${unit.nextStopName}` : ''}`}>
            <Box onClick={() => onSelect(unit.deviceId)} sx={{ cursor: 'pointer' }}>
              <Box sx={{
                position: 'absolute', top: top + 20, height: LINE_TOP - top - 18, left: x(unit.along), width: 2, ml: '-1px', bgcolor: '#232a38', zIndex: 2,
              }}
              />
              <Box sx={{
                position: 'absolute', top: LINE_TOP - 1, left: x(unit.along), width: 10, height: 10, ml: '-5px', borderRadius: '50%', bgcolor: '#232a38', zIndex: 3,
              }}
              />
              <Box sx={{
                position: 'absolute', top, left: x(unit.along), transform: 'translateX(-50%)', px: 0.75, py: 0.25, borderRadius: 1.5, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', bgcolor: selected ? '#232a38' : '#fff', color: selected ? '#fff' : '#232a38', border: '2px solid #232a38', boxShadow: '0 2px 6px rgba(0,0,0,.2)', zIndex: 4,
              }}
              >
                {`🚌 ${unit.name}`}
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default LineDiagram;
