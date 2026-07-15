import type { Config } from 'tailwindcss';

/**
 * Tema Sembada — di-port dari colors_and_type.css supaya bisa dipakai
 * di komponen React lewat utility Tailwind. Token CSS variable tetap
 * ada (lihat globals.css) untuk konsistensi dengan design system.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aksen utama — di-back CSS variable supaya bisa diganti tema runtime
        // (lihat globals.css :root & [data-theme]). Default = Sogan/maroon.
        sogan: {
          50: 'rgb(var(--sogan-50) / <alpha-value>)',
          100: 'rgb(var(--sogan-100) / <alpha-value>)',
          200: 'rgb(var(--sogan-200) / <alpha-value>)',
          300: 'rgb(var(--sogan-300) / <alpha-value>)',
          400: 'rgb(var(--sogan-400) / <alpha-value>)',
          500: 'rgb(var(--sogan-500) / <alpha-value>)',
          600: 'rgb(var(--sogan-600) / <alpha-value>)',
          700: 'rgb(var(--sogan-700) / <alpha-value>)',
          800: 'rgb(var(--sogan-800) / <alpha-value>)',
          900: 'rgb(var(--sogan-900) / <alpha-value>)',
        },
        cream: {
          50: '#FBF9F4',
          100: '#F5F1E8',
          200: '#ECE5D8',
          300: '#E5DDD0',
          400: '#D6C9B3',
          500: '#BFAE94',
        },
        tanah: {
          100: '#EFE6DA',
          300: '#B89A7A',
          500: '#8C6B4A',
          700: '#5C3A1E',
          900: '#2E1D0F',
        },
        padi: { 100: '#E4F0DE', 300: '#95BD83', 500: '#4A7C3A', 700: '#335829' },
        emas: { 100: '#FAEFC9', 300: '#ECC979', 500: '#D4A437', 700: '#97751F' },
        bata: { 100: '#FBE3DD', 300: '#E48975', 500: '#C44536', 700: '#8C2C1F' },
        wedel: { 900: '#1F1B16' },
        // Info (biru) — token semantik "in-progress" dari spec Sembada.
        info: { DEFAULT: '#2A6FA8', soft: '#DDEAF5', 500: '#2A6FA8', 700: '#1F5480' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Plus Jakarta Sans', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Warm-tinted (sogan/tanah), tidak abu-abu — sesuai spec.
        xs: '0 1px 2px rgba(92, 58, 30, 0.06)',
        sm: '0 2px 6px rgba(92, 58, 30, 0.08)',
        md: '0 6px 16px rgba(92, 58, 30, 0.10)',
        lg: '0 16px 32px rgba(92, 58, 30, 0.12)',
        xl: '0 32px 64px rgba(92, 58, 30, 0.16)',
        focus: '0 0 0 3px rgb(var(--sogan-500) / 0.18)',
        inner: 'inset 0 1px 2px rgba(92, 58, 30, 0.08)',
      },
      transitionTimingFunction: {
        sembada: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '240ms',
        slow: '400ms',
      },
      keyframes: {
        'lent-fade': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'lent-fade': 'lent-fade 240ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
} satisfies Config;
