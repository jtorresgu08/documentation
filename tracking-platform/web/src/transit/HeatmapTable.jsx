import { Box, Tooltip, Typography } from '@mui/material';

// delay in minutes → cell colour: green on time, then yellow, orange and red as the delay grows; blue when early
export const heatColor = (delay) => {
  if (delay === null || delay === undefined) return 'transparent';
  if (delay < -1) return '#cfe0fb';
  if (delay <= 1) return '#d4f0dc';
  if (delay <= 3) return '#fbefc0';
  if (delay <= 5) return '#fbd6a8';
  if (delay <= 8) return '#f6b3a0';
  return '#ec8a7d';
};

// Rows (stops or days) by hours of the day, each cell the average delay; the tooltip adds visits and the interval
const HeatmapTable = ({
  rows, hours, label, cellText, tooltip,
}) => (
  <Box sx={{ overflowX: 'auto' }}>
    <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: '100%' }}>
      <thead>
        <tr>
          <Box component="th" sx={{ textAlign: 'left', pr: 1 }} />
          {hours.map((hour) => (
            <Box component="th" key={hour} sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', minWidth: 46 }}>{`${String(hour).padStart(2, '0')}h`}</Box>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <Box component="td" sx={{ pr: 1.5, whiteSpace: 'nowrap' }}>
              <Typography variant="body2" fontWeight={600}>{label(row)}</Typography>
            </Box>
            {hours.map((hour) => {
              const cell = row.cells[hour];
              return (
                <Tooltip key={hour} title={cell ? tooltip(row, hour, cell) : ''}>
                  <Box
                    component="td"
                    sx={{
                      bgcolor: heatColor(cell?.delay), borderRadius: 1.5, textAlign: 'center', fontSize: 12, fontWeight: 700, height: 30, color: '#232a38', border: cell ? 'none' : '1px dashed rgba(0,0,0,0.08)',
                    }}
                  >
                    {cell ? cellText(cell) : ''}
                  </Box>
                </Tooltip>
              );
            })}
          </tr>
        ))}
      </tbody>
    </Box>
  </Box>
);

export default HeatmapTable;
