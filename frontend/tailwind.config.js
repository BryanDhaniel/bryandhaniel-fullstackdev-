/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // A single restrained accent, used for primary actions and active
        // states. Everything else is neutral so the job listings carry the
        // visual weight rather than the chrome.
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#bcd0ff',
          300: '#8eb0ff',
          400: '#5985ff',
          500: '#3560f5',
          600: '#2142e0',
          700: '#1c34b6',
          800: '#1c2f90',
          900: '#1c2d72',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
