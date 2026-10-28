/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        info: v('info'),
        'accent-fg': v('accent-fg'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
      },
      opacity: { 3: '0.03', 6: '0.06', 8: '0.08', 12: '0.12', 15: '0.15' },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        pop: '0 24px 64px -16px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(var(--line-strong) / 1), 0 0 40px -12px rgb(var(--accent) / 0.25)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.55), 0 6px 22px -6px rgb(var(--accent) / 0.65)',
        card: '0 1px 0 0 rgb(255 255 255 / 0.02) inset',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        'slide-in': 'slide-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        'toast-in': 'toast-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
