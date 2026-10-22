import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0',
          300: '#86efac', 400: '#4ade80', 500: '#22c55e',
          600: '#16a34a', 700: '#15803d', 800: '#166534',
          900: '#14532d', 950: '#052e16',
        },
        forest: {
          50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981',
          600: '#059669', 700: '#047857', 800: '#065f46',
          900: '#064e3b', 950: '#022c22',
        },
        ocean: {
          50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6',
          600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        'card':         '0 1px 4px 0 rgb(0 0 0 / 0.06)',
        'card-hover':   '0 4px 16px 0 rgb(0 0 0 / 0.09)',
        'card-deep':    '0 8px 32px 0 rgb(0 0 0 / 0.10)',
        'nav':          '0 1px 0 0 rgb(0 0 0 / 0.06)',
        'dropdown':     '0 8px 32px rgb(0 0 0 / 0.12), 0 2px 8px rgb(0 0 0 / 0.06)',
        'button':       '0 1px 3px 0 rgb(22 163 74 / 0.3)',
        'button-hover': '0 4px 12px 0 rgb(22 163 74 / 0.35)',
        'button-sm':    '0 1px 2px 0 rgb(22 163 74 / 0.2)',
      },
      transitionDuration: {
        '250': '250ms',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
