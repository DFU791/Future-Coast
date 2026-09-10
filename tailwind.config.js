/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'fc-land': '#E8EAED',
        'fc-ocean': '#A8D8EA',
        'fc-flood': '#4A90D9',
        'fc-flood-active': '#2E7BC4',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'PingFang SC', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
