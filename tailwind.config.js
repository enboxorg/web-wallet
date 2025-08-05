/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // MacOS-inspired dark mode colors
        dark: {
          bg: {
            primary: '#1a1a1a',
            secondary: '#252525',
            tertiary: '#2a2a2a',
            elevated: '#303030',
          },
          surface: {
            primary: '#2a2a2a',
            secondary: '#333333',
            tertiary: '#3a3a3a',
          },
          border: {
            primary: '#404040',
            secondary: '#4a4a4a',
          },
          text: {
            primary: '#f5f5f7',
            secondary: '#a1a1a6',
            tertiary: '#86868b',
          },
          accent: {
            blue: '#0a84ff',
            green: '#32d74b',
            red: '#ff453a',
            yellow: '#ffd60a',
            purple: '#bf5af2',
            indigo: '#5e5ce6',
          }
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}