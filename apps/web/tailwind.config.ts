import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tenant:      'var(--tenant)',
        'tenant-soft':'var(--tenant-soft)',
        ink:         '#1a1f2e',
        'ink-dim':   '#6b7382',
        line:        '#e3e6ec',
        'line-strong':'#cdd1da',
        ok:   '#1c8b59',
        warn: '#c47f00',
        bad:  '#c33d3d',
      },
      fontFamily: { sans: ['-apple-system','BlinkMacSystemFont','Inter','sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
