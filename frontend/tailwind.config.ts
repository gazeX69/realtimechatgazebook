import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f3f4f6',
        line: '#1f2937',
        surface: '#030712',
        brand: '#a855f7',
        coral: '#ef4444',
      },
      boxShadow: {
        neon: '0 18px 60px rgba(168, 85, 247, 0.10)',
      },
    },
  },
  plugins: [],
} satisfies Config;
