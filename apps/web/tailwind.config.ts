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
        sogan: {
          50: '#FBF2EE',
          100: '#F4DDD3',
          200: '#E5B4A4',
          300: '#D08672',
          400: '#B85A48',
          500: '#8B2E2E',
          600: '#7A2828',
          700: '#5E1F1F',
          800: '#421717',
          900: '#2A0F0F',
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
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Plus Jakarta Sans', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px rgba(92, 58, 30, 0.06)',
        sm: '0 2px 6px rgba(92, 58, 30, 0.08)',
        md: '0 6px 16px rgba(92, 58, 30, 0.10)',
        lg: '0 16px 32px rgba(92, 58, 30, 0.12)',
        focus: '0 0 0 3px rgba(139, 46, 46, 0.18)',
      },
    },
  },
} satisfies Config;
