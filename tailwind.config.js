const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: token('brand'),
          strong: token('brand-strong'),
          soft: token('brand-soft'),
        },
        ink: token('ink'),
        'on-ink': token('on-ink'),
        sidebar: token('sidebar'),
        canvas: token('canvas'),
        surface: token('surface'),
        line: token('line'),
        muted: token('muted'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        info: token('info'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.05)',
        pop: '0 12px 32px -8px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};
