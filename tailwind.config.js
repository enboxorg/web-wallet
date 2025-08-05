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
        // Purple-themed dark mode colors
        dark: {
          bg: {
            primary: '#0a0a0b',
            secondary: '#18181b',
            tertiary: '#27272a',
            elevated: '#3f3f46',
          },
          surface: {
            primary: '#27272a',
            secondary: '#3f3f46',
            tertiary: '#52525b',
          },
          border: {
            primary: '#3f3f46',
            secondary: '#52525b',
          },
          text: {
            primary: '#fafafa',
            secondary: '#a1a1aa',
            tertiary: '#71717a',
          },
          accent: {
            purple: '#8b5cf6',
            violet: '#7c3aed',
            indigo: '#6366f1',
            pink: '#ec4899',
            fuchsia: '#d946ef',
            blue: '#3b82f6',
          }
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-purple': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        'gradient-pink': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
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
        },
        pulseGlow: {
          '0%, 100%': { 
            opacity: '1',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)',
          },
          '50%': { 
            opacity: '0.8',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.8)',
          },
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}