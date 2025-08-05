import { createTheme, alpha } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0a84ff',
      light: '#409cff',
      dark: '#0761c3',
    },
    secondary: {
      main: '#5e5ce6',
      light: '#8381ff',
      dark: '#3938b3',
    },
    background: {
      default: '#1a1a1a',
      paper: '#252525',
    },
    text: {
      primary: '#f5f5f7',
      secondary: '#a1a1a6',
    },
    divider: '#404040',
    error: {
      main: '#ff453a',
    },
    warning: {
      main: '#ffd60a',
    },
    success: {
      main: '#32d74b',
    },
    info: {
      main: '#5e5ce6',
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
            background: '#252525',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#404040',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#4a4a4a',
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: alpha('#2a2a2a', 0.8),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: '#404040',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#2a2a2a', 0.8),
          backdropFilter: 'blur(20px)',
          border: '1px solid',
          borderColor: '#404040',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
          '&:hover': {
            boxShadow: '0 8px 12px -2px rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.3)',
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
          '&:hover': {
            boxShadow: '0 0 20px rgba(10, 132, 255, 0.3)',
          },
        },
        outlined: {
          borderColor: '#404040',
          '&:hover': {
            borderColor: '#5a5a5a',
            backgroundColor: alpha('#ffffff', 0.05),
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: alpha('#1a1a1a', 0.5),
            '& fieldset': {
              borderColor: '#404040',
            },
            '&:hover fieldset': {
              borderColor: '#5a5a5a',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#0a84ff',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#1a1a1a', 0.8),
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid #404040',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: alpha('#252525', 0.95),
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid #404040',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha('#ffffff', 0.05),
          },
          '&.Mui-selected': {
            backgroundColor: alpha('#0a84ff', 0.15),
            '&:hover': {
              backgroundColor: alpha('#0a84ff', 0.2),
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#404040', 0.5),
          backdropFilter: 'blur(10px)',
          border: '1px solid #4a4a4a',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: '2px solid #404040',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: alpha('#1a1a1a', 0.95),
          backdropFilter: 'blur(10px)',
          border: '1px solid #404040',
          fontSize: '0.75rem',
        },
      },
    },
  },
});