import { useLocalDwn } from '@/contexts/Context';
import { Box, Button, Chip, Tooltip, Typography } from '@mui/material';
import { CloudOff, CloudDone, Computer } from '@mui/icons-material';

/**
 * Compact status indicator for local DWN availability.
 *
 * When a local DWN is discovered (via port probing, `dwn://register` redirect,
 * or a persisted endpoint), it shows a green "Local DWN" chip.
 *
 * When no local DWN is available, it shows an action chip that triggers the
 * `dwn://register` protocol handler discovery flow.
 */
const LocalDwnIndicator: React.FC = () => {
  const { localDwnAvailable, triggerLocalDwnDiscovery } = useLocalDwn();

  if (localDwnAvailable) {
    return (
      <Tooltip title="A local DWN server is running on this machine. Your data syncs locally for faster access.">
        <Chip
          icon={<Computer sx={{ fontSize: 16 }} />}
          label="Local DWN"
          size="small"
          color="success"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title="No local DWN detected. Click to discover a local DWN server via the dwn:// protocol handler.">
      <Chip
        icon={<CloudOff sx={{ fontSize: 16 }} />}
        label="Connect Local DWN"
        size="small"
        variant="outlined"
        onClick={triggerLocalDwnDiscovery}
        clickable
        sx={{
          fontSize: '0.75rem',
          borderColor: 'text.disabled',
          color: 'text.secondary',
          '&:hover': {
            borderColor: 'primary.main',
            color: 'primary.main',
          },
        }}
      />
    </Tooltip>
  );
};

export default LocalDwnIndicator;
