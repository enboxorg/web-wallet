import { createTheme, alpha } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8b5cf6', // Purple
      light: '#a78bfa',
      dark: '#7c3aed',
    },
    secondary: {
      main: '#ec4899', // Pink
      light: '#f472b6',
      dark: '#db2777',
    },
    background: {
      default: '#0a0a0b',
      paper: '#18181b',
    },
    text: {
      primary: '#fafafa',
      secondary: '#a1a1aa',
    },
    divider: '#3f3f46',
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    success: {
      main: '#10b981',
    },
    info: {
      main: '#6366f1',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Roboto", sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    subtitle1: {
      fontWeight: 500,
    },
    subtitle2: {
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#18181b',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#3f3f46',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#52525b',
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: alpha('#27272a', 0.8),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: alpha('#3f3f46', 0.5),
          boxShadow: '0 10px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(139,92,246,0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#27272a', 0.6),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: alpha('#3f3f46', 0.3),
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
          '&:hover': {
            boxShadow: '0 8px 12px -2px rgba(0, 0, 0, 0.5), 0 4px 8px -2px rgba(0, 0, 0, 0.4)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          padding: '8px 16px',
          transition: 'all 0.2s ease-in-out',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
        contained: {
          boxShadow: 'none',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          '&:hover': {
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)',
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          },
        },
        outlined: {
          borderColor: alpha('#8b5cf6', 0.5),
          '&:hover': {
            borderColor: '#8b5cf6',
            backgroundColor: alpha('#8b5cf6', 0.08),
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: alpha('#18181b', 0.5),
            '& fieldset': {
              borderColor: alpha('#3f3f46', 0.5),
            },
            '&:hover fieldset': {
              borderColor: alpha('#52525b', 0.8),
            },
            '&.Mui-focused fieldset': {
              borderColor: '#8b5cf6',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#0a0a0b', 0.8),
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid',
          borderColor: alpha('#3f3f46', 0.3),
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha('#18181b', 0.95),
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid',
          borderColor: alpha('#3f3f46', 0.3),
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          marginBottom: '4px',
          '&:hover': {
            backgroundColor: alpha('#8b5cf6', 0.08),
          },
          '&.Mui-selected': {
            backgroundColor: alpha('#8b5cf6', 0.15),
            borderLeft: '3px solid #8b5cf6',
            '&:hover': {
              backgroundColor: alpha('#8b5cf6', 0.2),
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#3f3f46', 0.5),
          backdropFilter: 'blur(10px)',
          border: '1px solid',
          borderColor: alpha('#52525b', 0.5),
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: '2px solid',
          borderColor: alpha('#8b5cf6', 0.3),
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: alpha('#18181b', 0.95),
          backdropFilter: 'blur(10px)',
          border: '1px solid',
          borderColor: alpha('#3f3f46', 0.5),
          fontSize: '0.75rem',
        },
      },
    },
  },
});