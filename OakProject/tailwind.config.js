/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        oak: {
          50: '#f4f8f0',
          100: '#e4eedd',
          200: '#c8dcba',
          300: '#a0c288',
          400: '#78a85a',
          500: '#5a8a3a',
          600: '#456e2c',
          700: '#375824',
          800: '#2d461e',
          900: '#263a19',
        }
      }
    }
  },
  plugins: []
}
