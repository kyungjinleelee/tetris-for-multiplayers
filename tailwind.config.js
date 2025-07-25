/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tetris-blue': '#1e3a8a',
        'tetris-cyan': '#06b6d4',
        'tetris-yellow': '#eab308',
        'tetris-orange': '#ea580c',
        'tetris-green': '#16a34a',
        'tetris-purple': '#9333ea',
        'tetris-red': '#dc2626',
        'tetris-gray': '#1f2937',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      }
    },
  },
  plugins: [],
} 