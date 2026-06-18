/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'french-blue': '#246BFE',
        'juicy-red': '#FF365E',
        cream: '#FFEEC4',
        ink: '#130A22',
        midnight: '#140D35',
        wine: '#7A1E48',
        gold: '#FFD166',
        mint: '#4DE3C1',
      },
      boxShadow: {
        neo: '0 14px 0px 0px rgba(19,10,34,0.95), 0 24px 40px rgba(0,0,0,0.35)',
        'neo-sm': '0 6px 0px 0px rgba(19,10,34,0.95), 0 12px 24px rgba(0,0,0,0.22)',
        'neo-pressed': '0px 0px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
  plugins: [],
}
