/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#005AC1',
          blueDark: '#001D39',
          blueLight: '#DBE2F9',
          bg: '#F3F4F9',
          surface: '#FFFFFF',
          border: '#E1E2EC',
          borderDark: '#C4C6D0',
          text: '#1B1B1F',
          textMuted: '#44474F',
          gold: '#FFB300',
        }
      }
    },
  },
  plugins: [],
};
