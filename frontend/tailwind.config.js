/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Neutrals are warmed by a few degrees of hue so they read as paper
         * rather than as screen grey. Every surface, border and text colour in
         * the app comes from this one ramp — no second grey family.
         */
        ink: {
          50: '#f8f7f5',
          100: '#f1efeb',
          200: '#e5e2dc',
          300: '#d3cfc6',
          400: '#a8a29a',
          500: '#7c7770',
          600: '#5c5851',
          700: '#43403a',
          800: '#2b2925',
          900: '#1c1a17',
          950: '#121110',
        },
        /**
         * A single accent, locked for the whole app: deep teal. Saturation is
         * held under 80% and the mid-tones are desaturated so it sits inside
         * the neutral ramp instead of floating above it.
         */
        accent: {
          50: '#eef7f5',
          100: '#d3ece7',
          200: '#a7d9d0',
          300: '#72bfb3',
          400: '#3f9d90',
          500: '#1f7f73',
          600: '#14655c',
          700: '#12524b',
          800: '#123f3b',
          900: '#123532',
          950: '#07201e',
        },
        /**
         * Status hues are desaturated to match the accent's intensity. They are
         * used for the five application statuses and for nothing else, so the
         * colour of a badge always means the same thing.
         */
        status: {
          neutral: '#5c5851',
          review: '#9a6b1f',
          shortlist: '#5b5a9e',
          reject: '#a4463c',
          accept: '#2f7350',
        },
      },

      fontFamily: {
        /**
         * Display and body share one Grotesk family so the whole app has a
         * single voice; hierarchy comes from weight and optical size rather
         * than from switching typefaces. `Inter` is deliberately absent.
         */
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        /** A display scale with tighter tracking as size grows. */
        'display-sm': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-lg': ['3rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-xl': ['3.75rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
      },

      /**
       * One radius scale, applied consistently: `xl` for cards, `lg` for
       * controls, `md` for small inner chips, `full` for pills. Nothing in the
       * app invents a radius outside this set.
       */
      borderRadius: {
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },

      /**
       * Shadows are warm and low-contrast, tinted toward the paper background
       * rather than pure black, so elevation reads as depth and not as dirt.
       */
      boxShadow: {
        hair: '0 0 0 1px rgba(28, 26, 23, 0.06)',
        lift: '0 1px 2px rgba(28, 26, 23, 0.04), 0 4px 16px -6px rgba(28, 26, 23, 0.10)',
        raised: '0 2px 4px rgba(28, 26, 23, 0.04), 0 12px 32px -12px rgba(28, 26, 23, 0.16)',
        floated: '0 4px 8px rgba(28, 26, 23, 0.05), 0 24px 56px -20px rgba(28, 26, 23, 0.22)',
      },

      transitionTimingFunction: {
        /** Motion that settles rather than stops. Used on every transition. */
        settle: 'cubic-bezier(0.32, 0.72, 0, 1)',
        enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        /** Sweeps a highlight across a placeholder while data loads. */
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },

      animation: {
        'rise-in': 'rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        shimmer: 'shimmer 1.8s infinite',
      },
    },
  },
  plugins: [],
};
