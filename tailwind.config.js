/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'french-blue': '#0055FF',
        'juicy-red': '#FF3B3B',
        cream: '#FDFBF7',
      },
      boxShadow: {
        neo: '4px 4px 0px 0px rgba(0,0,0,1)',
        'neo-sm': '2px 2px 0px 0px rgba(0,0,0,1)',
        'neo-pressed': '0px 0px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
  plugins: [],
}
