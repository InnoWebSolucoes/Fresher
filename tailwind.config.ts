import type { Config } from 'tailwindcss'

const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: rgb('canvas'),
        surface: rgb('surface'),
        raised: rgb('surface-raised'),
        sunken: rgb('surface-sunken'),
        line: rgb('border'),
        'line-strong': rgb('border-strong'),
        ink: rgb('text'),
        muted: rgb('text-muted'),
        subtle: rgb('text-subtle'),
        primary: {
          DEFAULT: rgb('primary'),
          hover: rgb('primary-hover'),
          active: rgb('primary-active'),
          subtle: rgb('primary-subtle'),
        },
        'on-primary': rgb('on-primary'),
        accent: {
          DEFAULT: rgb('accent'),
          hover: rgb('accent-hover'),
          subtle: rgb('accent-subtle'),
        },
        'on-accent': rgb('on-accent'),
        rail: {
          DEFAULT: rgb('rail'),
          hover: rgb('rail-hover'),
          icon: rgb('rail-icon'),
        },
        success: { DEFAULT: rgb('success'), subtle: rgb('success-subtle') },
        warning: { DEFAULT: rgb('warning'), subtle: rgb('warning-subtle') },
        danger: { DEFAULT: rgb('danger'), subtle: rgb('danger-subtle') },
        info: { DEFAULT: rgb('info'), subtle: rgb('info-subtle') },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '48px', fontWeight: '700' }],
        'title-1': ['30px', { lineHeight: '38px', fontWeight: '650' }],
        'title-2': ['24px', { lineHeight: '32px', fontWeight: '650' }],
        'title-3': ['19px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        body: ['14px', { lineHeight: '20px' }],
        'body-strong': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        small: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        brand: 'var(--ease)',
      },
      spacing: {
        topbar: 'var(--topbar-h)',
        rail: 'var(--rail-w)',
        panel: 'var(--panel-w)',
      },
    },
  },
  plugins: [],
} satisfies Config
